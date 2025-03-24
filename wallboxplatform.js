'use strict';
const wallboxAPI = require('./wallboxapi');
const lockMechanism = require('./devices/lock');
const battery = require('./devices/battery');
const sensor = require('./devices/sensor');
const basicSwitch = require('./devices/switch');
const outlet = require('./devices/outlet');
const control = require('./devices/control');
const enumeration = require('./enumerations');
const fileName = 'platform';

class wallboxPlatform {
  constructor(log, config, api) {
    this.wallboxapi = new wallboxAPI(this, log);
    this.lockMechanism = new lockMechanism(this, log);
    this.battery = new battery(this, log);
    this.sensor = new sensor(this, log);
    this.basicSwitch = new basicSwitch(this, log, config);
    this.outlet = new outlet(this, log, config);
    this.control = new control(this, log, config);
    this.enumeration = enumeration;
    this.timeStamp = new Date();

    this.log = log;
    this.config = config;
    this.email = config.email;
    this.password = config.password;
    this.token;
    this.refreshToken;
    this.lastToken;
    this.ttl;
    this.ttlTime;
    this.retryWait = config.retryWait || 60; //sec
    this.retryMax = config.retryMax || 3; //attempts
    this.retryAttempt = 0;
    this.refreshInterval = config.refreshInterval || 24; //hour
    this.liveTimeout = config.liveRefreshTimeout || 2; //min
    this.liveRefresh = config.liveRefreshRate || 20; //sec
    this.lastInterval;
    this.apiCount = 0;
    this.liveUpdate = false;
    this.showBattery = config.cars ? true : false;
    this.showSensor = config.socSensor ? config.socSensor : false;
    this.showControls = config.showControls;
    this.useFahrenheit = config.useFahrenheit ? config.useFahrenheit : true;
    this.showAPIMessages = config.showAPIMessages ? config.showAPIMessages : false;
    this.showUserMessages = config.showUserMessages ? config.showUserMessages : false;
    this.id;
    this.userId;
    this.model_name;
    this.cars = config.cars;
    this.locationName = config.locationName;
    this.locationMatch;
    this.accessories = [];
    this.amps = [];
    this.endTime = [];
    if (this.showControls == 8) {
      this.showControls = 4;
      this.useFahrenheit = false;
    }
    if (!config.email || !config.password) {
      this.log.error(
        `[${fileName}] Valid email and password are required in order to communicate with wallbox, please check the plugin config`
      );
    }
    this.log.info(`[${fileName}] Starting Wallbox platform using homebridge API`, api.version);
    if (api) {
      this.api = api;
      this.api.on(
        'didFinishLaunching',
        function () {
          // Get devices
          this.getDevices();
        }.bind(this)
      );
    }
  }

  identify() {
    this.log.info(`[${fileName}] Identify wallbox!`);
  }

  async getDevices() {
    try {
      this.log.info(`[${fileName}] Getting Account Device info...`);
      // login to the API and get the token
      let email = await this.wallboxapi.checkEmail(this.email).catch((err) => {
        this.log.error(`[${fileName}] Failed to get email for build. ${err}`);
      });
      this.log.info(`[${fileName}] Email status ${email.data.attributes.status}`);
      if (email.data.attributes.status != 'confirmed') {
        return;
      }
      // get signin & token
      let signin = await this.wallboxapi.signin(this.email, this.password).catch((err) => {
        this.log.error(`[${fileName}] Failed to get signin for build. ${err}`);
      });
      this.log.debug(`[${fileName}] Found user ID ${signin.data.attributes.user_id}`);
      //this.log.debug(`[${fileName}] Found token ${signin.data.attributes.token}`)
      let tokenPt1 = signin.data.attributes.token.substring(0, 35);
      let tokenPt2 = signin.data.attributes.token.substring(signin.data.attributes.token.length - 35);
      let refreshPt1 = signin.data.attributes.refresh_token.substring(0, 35);
      let refreshPt2 = signin.data.attributes.refresh_token.substring(signin.data.attributes.refresh_token.length - 35);
      this.log.debug(`[${fileName}] Found token  ${tokenPt1}********************${tokenPt2}`);
      this.log.debug(`[${fileName}] Found refresh token  ${refreshPt1}********************${refreshPt2}`);
      this.id = signin.data.attributes.user_id;
      this.token = signin.data.attributes.token;
      this.refreshToken = signin.data.attributes.refresh_token;
      this.ttl = signin.data.attributes.ttl;
      this.ttlTime = Math.round((signin.data.attributes.ttl - Date.now()) / 60 / 1000);

      let ttlLocale = new Date(signin.data.attributes.ttl).toLocaleString();
      let refreshTime = Math.round((signin.data.attributes.refresh_token_ttl - Date.now()) / 24 / 60 / 60 / 1000);
      let refreshLocale = new Date(signin.data.attributes.refresh_token_ttl).toLocaleString();
      if (this.showUserMessages) {
        this.log.info(`[${fileName}] Current time `, new Date(Date.now()).toLocaleString());
        this.log.info(`[${fileName}] Token will expire on ${ttlLocale}, ${this.ttlTime} minutes `);
        this.log.info(`[${fileName}] Refresh Token will expire on ${refreshLocale}, ${refreshTime} days `);
      } else {
        this.log.debug(`[${fileName}] Current time `, new Date(Date.now()).toLocaleString());
        this.log.debug(`[${fileName}] Token will expire on ${ttlLocale}, ${this.ttlTime} minutes `);
        this.log.debug(`[${fileName}] Refresh Token will expire on ${refreshLocale}, ${refreshTime} days `);
      }

      //get get user id
      let userId = await this.wallboxapi.getId(this.token, this.id).catch((err) => {
        this.log.error(`[${fileName}] Failed to get userId for build. \n${err}`);
      });
      this.userId = userId.data.attributes.value;
      this.log.debug(`[${fileName}] Found user ID ${this.userId}`);

      //get groups
      let groups = await this.wallboxapi.getChargerGroups(this.token).catch((err) => {
        this.log.error(`[${fileName}] Failed to get groups for build. \n${err}`);
      });
      groups.result.groups.forEach((group) => {
        this.log.info(`[${fileName}] Found group for ${group.name} `);
        group.chargers.forEach(async (charger) => {
          //get model info
          let chargerInfo = await this.wallboxapi.getCharger(this.token, group.uid).catch((err) => {
            this.log.error(`[${fileName}] Failed to get charger info for build. \n${err}`);
          });
          this.model_name = chargerInfo.data[0].attributes.model_name;
          this.log.info(`[${fileName}] Found charger ${charger.name} with software ${charger.software.currentVersion}`);
          if (charger.software.updateAvailable) {
            this.log.warn(`[${fileName}] ${charger.name} software update ${charger.software.latestVersion} is available`);
          }
        });
      });
      //get user
      let user = await this.wallboxapi.getUser(this.token, this.userId).catch((err) => {
        this.log.error(`[${fileName}] Failed to get user for build. \n${err}`);
      });
      this.log.info(`[${fileName}] Found account for ${user.data.name} ${user.data.surname}`);
      user.data.accessConfigs
        .filter((accessConfig) => {
          groups.result.groups.forEach((group) => {
            if (!this.locationName || (this.locationName == group.name && accessConfig.group == group.id)) {
              this.log.info(`[${fileName}] Found device at the location: ${group.name}`);
              this.locationMatch = true;
            } else {
              this.log.info(
                `[${fileName}] Skipping device at ${group.name}, not found at the configured location: ${this.locationName}`
              );
              this.locationMatch = false;
            }
          });
          return this.locationMatch;
        })
        .forEach((accessConfig) => {
          accessConfig.chargers.forEach(async (charger) => {
            //loop each charger
            let chargerData = await this.wallboxapi.getChargerData(this.token, charger).catch((err) => {
              this.log.error(`[${fileName}] Failed to get charger data for build. \n${err}`);
            });
            let chargerName = this.cars.filter((car) => car.chargerName == chargerData.name);
            if (chargerName[0]) {
              let uuid = UUIDGen.generate(chargerData.uid);
              let chargerConfig = await this.wallboxapi.getChargerConfig(this.token, charger).catch((err) => {
                this.log.error(`[${fileName}] Failed to get charger configs for build. \n${err}`);
              });
              let lockAccessory = this.lockMechanism.createLockAccessory(
                chargerData,
                chargerConfig,
                uuid,
                this.accessories[uuid]
              );
              let lockService = lockAccessory.getService(Service.LockMechanism);
              //this.lockMechanism.createLockService(chargerData)
              this.lockMechanism.configureLockService(chargerData, lockService);

              if (this.showSensor) {
                let sensorService = this.sensor.createSensorService(chargerData, 'SOC');
                this.sensor.configureSensorService(chargerData, sensorService);
                let service = lockAccessory.getService(Service.HumiditySensor);
                if (!service) {
                  lockAccessory.addService(sensorService);
                  this.api.updatePlatformAccessories([lockAccessory]);
                }
                lockAccessory.getService(Service.LockMechanism).addLinkedService(sensorService);
              } else {
                let service = lockAccessory.getService(Service.HumiditySensor);
                if (service) {
                  lockAccessory.removeService(service);
                  this.api.updatePlatformAccessories([lockAccessory]);
                }
              }

              if (this.showBattery) {
                let batteryService = this.battery.createBatteryService(chargerData);
                this.battery.configureBatteryService(batteryService);
                let service = lockAccessory.getService(Service.Battery);
                if (!service) {
                  lockAccessory.addService(batteryService);
                  this.api.updatePlatformAccessories([lockAccessory]);
                }
                lockAccessory.getService(Service.LockMechanism).addLinkedService(batteryService);
                this.amps[batteryService.subtype] = chargerData.maxChgCurrent;
              } else {
                let service = lockAccessory.getService(Service.Battery);
                if (service) {
                  lockAccessory.removeService(service);
                  this.api.updatePlatformAccessories([lockAccessory]);
                }
              }

              if (this.showControls == 5 || this.showControls == 4) {
                let outletService = lockAccessory.getService(Service.Outlet);
                if (!outletService) {
                  let outletService = this.outlet.createOutletService(chargerData, 'Charging');
                  this.outlet.configureOutletService(chargerData, outletService);
                  lockAccessory.addService(outletService);
                  this.api.updatePlatformAccessories([lockAccessory]);
                } else {
                  this.outlet.configureOutletService(chargerData, outletService);
                  this.api.updatePlatformAccessories([lockAccessory]);
                }
              } else {
                let service = lockAccessory.getService(Service.Outlet);
                if (service) {
                  lockAccessory.removeService(service);
                  this.api.updatePlatformAccessories([lockAccessory]);
                }
              }

              if (this.showControls == 3 || this.showControls == 4) {
                let controlService = lockAccessory.getService(Service.Thermostat);
                if (!controlService) {
                  let controlService = this.control.createControlService(chargerData, 'Charging Amps');
                  this.control.configureControlService(chargerData, controlService);
                  lockAccessory.addService(controlService);
                  this.api.updatePlatformAccessories([lockAccessory]);
                } else {
                  this.control.configureControlService(chargerData, controlService);
                  this.api.updatePlatformAccessories([lockAccessory]);
                }
              } else {
                let service = lockAccessory.getService(Service.Thermostat);
                if (service) {
                  lockAccessory.removeService(service);
                  this.api.updatePlatformAccessories([lockAccessory]);
                }
              }

              if (this.showControls == 1 || this.showControls == 4) {
                let switchService = lockAccessory.getService(Service.Switch);
                if (!switchService) {
                  let switchService = this.basicSwitch.createSwitchService(chargerData, 'Charging');
                  this.basicSwitch.configureSwitchService(chargerData, switchService);
                  lockAccessory.addService(switchService);
                  lockAccessory.getService(Service.LockMechanism).addLinkedService(switchService);
                } else {
                  this.basicSwitch.configureSwitchService(chargerData, switchService);
                  this.api.updatePlatformAccessories([lockAccessory]);
                }
              } else {
                let service = lockAccessory.getService(Service.Switch);
                if (service) {
                  lockAccessory.removeService(service);
                  this.api.updatePlatformAccessories([lockAccessory]);
                }
              }

              if (!this.accessories[uuid]) {
                this.log.debug(`[${fileName}] Registering platform accessory`);
                this.accessories[uuid] = lockAccessory;
                this.api.registerPlatformAccessories(PluginName, PlatformName, [lockAccessory]);
              }
              this.setChargerRefresh(chargerData);
              this.getStatus(chargerData.id);
            } else {
              this.log.warn(
                `[${fileName}] Charger "${chargerData.name}" not found in the plugin settings. Please check your plugin settings.`
              );
            }
          });
        });
      setTimeout(() => {
        this.log.success('Wallbox platform finished loading');
      }, 2500);
    } catch (err) {
      if (this.retryAttempt < this.retryMax) {
        this.retryAttempt++;
        this.log.error(
          `[${fileName}] Failed to get devices. Retry attempt ${this.retryAttempt} of ${this.retryMax} in ${this.retryWait} seconds...`
        );
        setTimeout(async () => {
          this.getDevices();
        }, this.retryWait * 1000);
      } else {
        this.log.error(`[${fileName}] Failed to get devices...\n${err}`);
      }
    }
  }

  async getNewToken(token) {
    if (this.ttl >= Date.now()) {
      return 'TOKEN IS STILL VALID';
    }
    this.log.info(`[${fileName}] Token expired, refreshing...`);
    let refresh = await this.wallboxapi.refresh(token).catch((err) => {
      this.log.error(`[${fileName}] Failed to refresh token. \n${err}`);
    });
    try {
      if (refresh.status == 200) {
        this.log.info(`[${fileName}] Token is still valid, refreshing... does it hit here?`);
        let tokenPt1 = refresh.data.data.attributes.token.substring(0, 35);
        let tokenPt2 = refresh.data.data.attributes.token.substring(refresh.data.data.attributes.token.length - 35);
        let refreshPt1 = refresh.data.data.attributes.refresh_token.substring(0, 35);
        let refreshPt2 = refresh.data.data.attributes.refresh_token.substring(
          refresh.data.data.attributes.refresh_token.length - 35
        );
        if (this.showUserMessages) {
          this.log.info(`[${fileName}] Updated token  ${tokenPt1}********************${tokenPt2}`);
          this.log.info(`[${fileName}] Updated refresh token  ${refreshPt1}********************${refreshPt2}`);
        } else {
          this.log.debug(`[${fileName}] Updated token  ${tokenPt1}********************${tokenPt2}`);
          this.log.debug(`[${fileName}] Updated refresh token  ${refreshPt1}********************${refreshPt2}`);
        }
        this.id = refresh.data.data.attributes.user_id;
        this.token = refresh.data.data.attributes.token;
        this.refreshToken = refresh.data.data.attributes.refresh_token;
        this.ttl = refresh.data.data.attributes.ttl;
        this.ttlTime = Math.round((refresh.data.data.attributes.ttl - Date.now()) / 60 / 1000);
        return 'Refreshed existing token';
      }
      if (refresh.status == 401) {
        this.log.info(`[${fileName}] Signed out, signing in...`);
        let signin = await this.wallboxapi.signin(this.email, this.password).catch((err) => {
          this.log.error(`[${fileName}] Failed to get signin for build.`, err);
        });
        let tokenPt1 = signin.data.attributes.token.substring(0, 35);
        let tokenPt2 = signin.data.attributes.token.substring(signin.data.attributes.token.length - 35);
        let refreshPt1 = signin.data.attributes.refresh_token.substring(0, 35);
        let refreshPt2 = signin.data.attributes.refresh_token.substring(signin.data.attributes.refresh_token.length - 35);
        if (this.showUserMessages) {
          this.log.info(`[${fileName}] New token ${tokenPt1}********************${tokenPt2}`);
          this.log.info(`[${fileName}] New refresh token ${refreshPt1}********************${refreshPt2}`);
        } else {
          this.log.debug(`[${fileName}] New token ${tokenPt1}********************${tokenPt2}`);
          this.log.debug(`[${fileName}] New refresh token ${refreshPt1}********************${refreshPt2}`);
        }
        this.id = signin.data.attributes.user_id;
        this.token = signin.data.attributes.token;
        this.refreshToken = signin.data.attributes.refresh_token;
        this.ttl = signin.data.attributes.ttl;
        this.ttlTime = Math.round((signin.data.attributes.ttl - Date.now()) / 60 / 1000);
        return 'Retrieved new token';
      }
      return 'Failed to update token';
    } catch (err) {
      this.log.error(`[${fileName}] Failed to refresh token`, err);
    }
  }

  setChargerRefresh(device) {
    // Refresh charger status
    setInterval(async () => {
      await this.getNewToken(this.refreshToken);
      this.log.info(`[${fileName}] API calls for this polling period ${this.apiCount}`);
      this.apiCount = 0;
      this.getStatus(device.id);
      try {
        let checkUpdate = await this.wallboxapi.getChargerConfig(this.token, device.id).catch((err) => {
          this.log.error(`[${fileName}] Failed to refresh charger configs. \n${err}`);
        });
        if (checkUpdate.software.updateAvailable) {
          this.log.warn(
            `[${fileName}] ${checkUpdate.name} software update ${checkUpdate.software.latestVersion} is available`
          );
        }
      } catch (err) {
        this.log.error(`[${fileName}] Error checking for update. \n${err}`);
      }
    }, this.refreshInterval * 60 * 60 * 1000);
  }

  async startLiveUpdate(device) {
    //check for duplicate call
    let delta = new Date() - this.timeStamp;
    if (delta > 500) {
      //calls within 1/2 sec will be skipped as duplicate
      this.timeStamp = new Date();
    } else {
      this.log.debug(`[${fileName}] Skipped new live update due to duplicate call, timestamp delta ${delta} ms`);
      return;
    }
    clearInterval(this.lastInterval);
    //get new token
    let x = await this.getNewToken(this.refreshToken);
    if ((this, this.showUserMessages)) {
      this.log.info(`[${fileName}] Starting live update`, x);
    } else {
      this.log.debug(`[${fileName}] Starting live update`, x);
    }
    this.liveUpdate = true;
    let startTime = new Date().getTime(); //live refresh start time
    if (!this.liveUpdate) {
      this.log.debug(`[${fileName}] Live update started`);
    }
    this.liveUpdate = true;
    let interval = setInterval(async () => {
      if (new Date().getTime() - startTime > this.liveTimeout * 60 * 1000) {
        clearInterval(interval);
        this.liveUpdate = false;
        if (this.showUserMessages) {
          this.log.info(`[${fileName}] Live update stopped`);
        } else {
          this.log.debug(`[${fileName}] Live update stopped`);
        }
        return;
      }
      this.getStatus(device.id);
      this.log.debug(`[${fileName}] API call count ${this.apiCount}`);
    }, this.liveRefresh * 1000);
    this.lastInterval = interval;
  }

  calcBattery(batteryService, energyAdded, chargingTime) {
    let wallboxChargerName = batteryService.getCharacteristic(Characteristic.Name).value;
    try {
      if (this.cars) {
        let car = this.cars.filter((charger) => charger.chargerName == wallboxChargerName);
        if (car[0]) {
          this.batterySize = car[0].kwH;
        } else {
          this.log.warn(
            `[${fileName}] Unable to find charger named "${wallboxChargerName}" as configured in the plugin settings.\n`,
            `[${fileName}] Check your plugin settings for "${this.cars[0].carName}" with charger "${this.cars[0].chargerName}"`
          );
        }
      }
    } catch (err) {
      this.log.error(`[${fileName}] Error with config.\n${JSON.stringify(this.cars, null, 2)}`);
    }

    if (!this.batterySize) {
      this.batterySize = 80;
    }
    let hours = Math.floor(chargingTime / 60 / 60);
    let minutes = Math.floor(chargingTime / 60) - hours * 60;
    let seconds = chargingTime % 60;
    let percentAdded = Math.round((energyAdded / this.batterySize) * 100);
    this.log.debug(
      `[${fileName}] Charging time ${hours} hours ${minutes} minutes, charge added ${energyAdded} kWh, ${percentAdded}%`
    );
    return percentAdded;
  }

  async getStatus(id) {
    let statusResponse = await this.wallboxapi.getChargerStatus(this.token, id).catch((err) => {
      this.log.error(`[${fileName}] Failed to update charger status. ${err}`);
    });
    try {
      this.log.debug(`[${fileName}] Response status ${statusResponse.status}`);
      if (statusResponse.status == 200) {
        this.updateStatus(statusResponse.data);
      }
    } catch (err) {
      this.log.error(`[${fileName}] Error updating status. ${err}`);
    }
  }

  async updateStatus(charger) {
    try {
      let chargerID = charger.config_data.charger_id;
      let chargerUID = charger.config_data.uid;
      let lockedState = charger.config_data.locked;
      let maxAmps = charger.config_data.max_charging_current;
      let chargerName = charger.name;
      let statusID = charger.status_id;
      let added_kWh = charger.added_energy;
      let chargingTime = charger.charging_time;
      let uuid = UUIDGen.generate(chargerUID);
      let lockAccessory = this.accessories[uuid];
      let controlService = lockAccessory.getServiceById(Service.Thermostat, chargerID);
      let switchService = lockAccessory.getServiceById(Service.Switch, chargerID);
      let outletService = lockAccessory.getServiceById(Service.Outlet, chargerID);
      let lockService = lockAccessory.getServiceById(Service.LockMechanism, chargerID);
      let batteryService = lockAccessory.getServiceById(Service.Battery, chargerID);
      let tempControl = this.useFahrenheit ? (((maxAmps - 32 + 0.01) * 5) / 9).toFixed(2) : maxAmps;
      let sensorService = lockAccessory.getServiceById(Service.HumiditySensor, chargerID);
      let chargingState = false;
      let outletState = false;
      let statusInfo;
      let batteryPercent = this.calcBattery(batteryService, added_kWh, chargingTime);
      this.log.debug(`[${fileName}] Updating charger ID ${chargerID}`);

      try {
        statusInfo = this.enumeration.filter((result) => result.status_id == statusID)[0];
        this.log.debug(`[${fileName}] Refreshed charger with status:`);
        this.log.debug(`[${fileName}] ${statusID}: ${statusInfo.status} - ${statusInfo.text}, ${statusInfo.altText}`);
      } catch (err) {
        statusInfo.mode = 'unknown';
      }

      this.sensor.updateSensorService(sensorService, batteryPercent);
      switch (statusInfo.mode) {
        case 'lockedMode':
        case 'readyMode':
          outletState = statusID === 210 ? true : false;
          this.lockMechanism.updateLockService(lockService, Characteristic.StatusFault.NO_FAULT, outletState, lockedState);
          this.basicSwitch.updateSwitchService(switchService, chargingState);
          this.outlet.updateOutletService(outletService, chargingState);
          this.control.updateControlService(controlService, chargingState, tempControl);
          this.battery.updateBatteryService(batteryService, Characteristic.ChargingState.NOT_CHARGING, batteryPercent);
          break;
        case 'chargingMode':
          chargingState = true;
          outletState = true;
          this.lockMechanism.updateLockService(lockService, Characteristic.StatusFault.NO_FAULT, outletState, lockedState);
          this.basicSwitch.updateSwitchService(switchService, chargingState);
          this.outlet.updateOutletService(outletService, chargingState);
          this.control.updateControlService(controlService, chargingState, tempControl);
          this.battery.updateBatteryService(batteryService, Characteristic.ChargingState.CHARGING, batteryPercent);
          break;
        case 'standbyMode':
          outletState = true;
          this.lockMechanism.updateLockService(lockService, Characteristic.StatusFault.NO_FAULT, outletState, lockedState);
          this.basicSwitch.updateSwitchService(switchService, chargingState);
          this.outlet.updateOutletService(outletService, chargingState);
          this.control.updateControlService(controlService, chargingState, tempControl);
          this.battery.updateBatteryService(batteryService, Characteristic.ChargingState.NOT_CHARGING, batteryPercent);
          if (statusID == 4) {
            this.log.info(`[${fileName}] ${chargerName} completed at ${new Date().toLocaleString()}`);
          }
          break;
        case 'firmwareUpdate':
        case 'errorMode':
          lockService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT);
          switch (statusID) {
            case 166: //Updating':
              this.log.info(`[${fileName}] ${chargerName} updating...`);
              break;
            case 14: //error':
            case 15:
              this.log.error(`[${fileName}] ${chargerName} threw an error at ${Date().toLocaleString()}!`);
              break;
            case 5: //Offline':
            case 0: //'Disconnected':
              let statusTime = new Date(charger.config_data.sync_timestamp * 1000).toLocaleString();
              let mode = statusInfo.mode === 5 ? 'offline' : 'disconnected';
              this.log.warn(
                `[${fileName}] ${chargerName} ${mode} at ${statusTime}! This will show as non-responding in Homekit until the connection is restored.`
              );
              break;
          }
          break;
        default:
          this.log.warn(`[${fileName}] Unknown device status received: ${statusID}`);
          break;
      }
      return charger;
    } catch (err) {
      this.log.error(`[${fileName}] Error updating status ${err}`);
    }
  }

  //**
  //** REQUIRED - Homebridge will call the "configureAccessory" method once for every cached accessory restored
  //**
  configureAccessory(accessory) {
    // Added cached devices to the accessories array
    this.log.debug(`[${fileName}] Found cached accessory ${accessory.displayName}`);
    this.accessories[accessory.UUID] = accessory;
  }
}
module.exports = wallboxPlatform;
