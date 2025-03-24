const wallboxAPI = require('../wallboxapi');
const enumeration = require('../enumerations');
const fileName = 'outlet';

class basicOutlet {
  constructor(platform, log, config) {
    this.log = log;
    this.platform = platform;
    this.wallboxapi = new wallboxAPI(this.platform, log);
    this.enumeration = enumeration;
  }

  createOutletService(device, type) {
    this.log.info(`[${fileName}] Adding outlet for ${device.name} charger`);
    let outletService = new Service.Outlet(type, device.id);
    let outletOn = false;
    this.log.info(`[${fileName}] Device status: ${device.status}`);
    if (device.status == 'CHARGING') {
      outletOn = true;
    }
    outletService
      .setCharacteristic(Characteristic.On, outletOn)
      .setCharacteristic(Characteristic.Name, device.name + ' ' + type)
      .setCharacteristic(Characteristic.StatusFault, false);
    return outletService;
  }

  configureOutletService(device, outletService) {
    let serviceName = outletService.getCharacteristic(Characteristic.Name).value;
    this.log.debug(`[${fileName}] Configured ${serviceName} outlet for ${device.name}`);
    outletService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getOutletValue.bind(this, outletService))
      .on('set', this.setOutletValue.bind(this, device, outletService));
  }

  updateOutletService(outletService, outletState) {
    if (!outletService) {
      return;
    }
    let serviceName = outletService.getCharacteristic(Characteristic.Name).value;
    this.log.info(`[${fileName}] Configured ${serviceName} outlet`);
    outletService.getCharacteristic(Characteristic.On).updateValue(outletState);
  }

  async setOutletValue(device, outletService, value, callback) {
    if (outletService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
      callback('error');
    } else {
      outletService.getCharacteristic(Characteristic.On).updateValue(value);
      let currentMode;
      let chargerData = await this.wallboxapi.getChargerData(this.platform.token, device.id).catch((err) => {
        this.log.error(`[${fileName}] Failed to get charger data.`, err);
      });
      let statusCode = chargerData.status;
      try {
        currentMode = this.enumeration.filter((result) => result.status_id == statusCode)[0].mode;
        this.log.debug(`[${fileName}] Checking status code = ${statusCode}, current mode = ${currentMode}`);
      } catch (error) {
        currentMode = 'unknown';
        this.log.error(`[${fileName}] Failed current mode check ${statusCode}. Error: ${error}`);
      }
      switch (currentMode) {
        case 'lockedMode':
        case 'readyMode':
          if (statusCode == 210) {
            this.log.info(`[${fileName}] Charger must be unlocked for this operation`);
            this.log.warn(`[${fileName}] Car Connected. Unlock charger to start session`);
          } else {
            this.log.info(`[${fileName}] Car must be connected for this operation`);
          }
          outletService.getCharacteristic(Characteristic.On).updateValue(!value);
          callback();
          break;
        case 'standbyMode':
          this.log.info(`[${fileName}] Waiting for a charge request`);
          if (
            outletService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT
          ) {
            callback('error');
          } else {
            let response = await this.wallboxapi.remoteAction(this.platform.token, device.id, 'resume').catch((err) => {
              this.log.error(`[${fileName}] Failed to resume.`, err);
            });
            switch (response.status) {
              case 403:
                this.log.warn(`[${fileName}] Wrong status showing in HomeKit, updating`);
              case 200:
                outletService.getCharacteristic(Characteristic.On).updateValue(value);
                this.log.info(`[${fileName}] Charging resumed`);
                break;
              default:
                outletService.getCharacteristic(Characteristic.On).updateValue(!value);
                this.log.info(`[${fileName}] Failed to start charging`);
                this.log.debug(`[${fileName}] `, response.data);
                break;
            }
          }
          callback();
          break;
        case 'chargingMode':
          let serviceName = outletService.getCharacteristic(Characteristic.Name).value;
          this.log.debug(`[${fileName}] Toggle outlet ${serviceName}`);
          if (
            outletService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT
          ) {
            callback('error');
          } else {
            let response = await this.wallboxapi.remoteAction(this.platform.token, device.id, 'pause').catch((err) => {
              this.log.error(`[${fileName}] Failed to pause.`, err);
            });
            switch (response.status) {
              case 403:
                this.log.warn(`[${fileName}] Wrong status showing in HomeKit, updating`);
              case 200:
                outletService.getCharacteristic(Characteristic.On).updateValue(value);
                this.log.info(`[${fileName}] Charging paused`);
                break;
              default:
                outletService.getCharacteristic(Characteristic.On).updateValue(!value);
                this.log.info(`[${fileName}] Failed to stop charging`);
                this.log.debug(`[${fileName}] ${response.data}`);
                break;
            }
          }
          callback();
          break;
        case 'firmwareUpdate':
        case 'errorMode':
          this.log.error(`[${fileName}] The charger ${device.name} has a fault condition with code= ${statusCode}`);
          outletService.getCharacteristic(Characteristic.On).updateValue(!value);
          callback();
        default:
          this.log.info(`[${fileName}] This operation cannot be completed at this time, status ${statusCode}`);
          outletService.getCharacteristic(Characteristic.On).updateValue(!value);
          callback();
          break;
      }
    }
  }

  getOutletValue(outletService, callback) {
    if (outletService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
      callback('error');
    } else {
      let currentValue = outletService.getCharacteristic(Characteristic.On).value;
      callback(null, currentValue);
    }
  }
}
module.exports = basicOutlet;
