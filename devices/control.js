const wallboxAPI = require('../wallboxapi');
const enumeration = require('../enumerations');
const fileName = 'control';

class control {
  constructor(platform, log, config) {
    this.log = log;
    this.platform = platform;
    this.wallboxapi = new wallboxAPI(this.platform, log);
    this.enumeration = enumeration;
  }

  createControlService(device, type) {
    this.log.info(`[${fileName}] Adding amperage control for ${device.name} charger`);
    let currentAmps;
    if (this.platform.useFahrenheit) {
      currentAmps = (((device.maxAvailableCurrent - 32 + 0.01) * 5) / 9).toFixed(2);
    } else {
      currentAmps = device.maxAvailableCurrent;
    }
    let controlService = new Service.Thermostat(type, device.id);
    controlService
      .setCharacteristic(Characteristic.Name, device.name + ' ' + type)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
      .setCharacteristic(Characteristic.TargetTemperature, currentAmps)
      .setCharacteristic(Characteristic.CurrentTemperature, currentAmps)
      .setCharacteristic(Characteristic.TemperatureDisplayUnits, this.platform.useFahrenheit)
      .setCharacteristic(Characteristic.TargetHeatingCoolingState, 0)
      .setCharacteristic(Characteristic.CurrentHeatingCoolingState, 0);
    return controlService;
  }

  configureControlService(device, controlService) {
    let serviceName = controlService.getCharacteristic(Characteristic.Name).value;
    let min;
    let max;
    let step;
    if (this.platform.useFahrenheit) {
      min = -14.5;
      max = 4.5; //4.45
      step = 0.5;
      if (device.maxAvailableCurrent == 48) {
        max = 9;
      }
    } else {
      min = 6;
      max = 40;
      step = 1;
      if (device.maxAvailableCurrent == 48) {
        max = 48;
      }
    }

    this.log.debug(`[${fileName}] Configured ${serviceName} control for ${device.name}`);
    controlService
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .setProps({
        minValue: 0,
        maxValue: 1
      })
      .on('get', this.getControlState.bind(this, controlService))
      .on('set', this.setControlState.bind(this, device, controlService));
    controlService
      .getCharacteristic(Characteristic.TargetTemperature)
      .setProps({
        minValue: min,
        maxValue: max,
        minStep: step
      })
      .on('get', this.getControlAmps.bind(this, controlService))
      .on('set', this.setControlAmps.bind(this, device, controlService));
    controlService
      .getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .on('get', this.getControlUnits.bind(this, controlService))
      .on('set', this.setControlUnits.bind(this, device, controlService));
  }
  updateControlService(controlService, controlState, controlLimit) {
    if (!controlService) return;

    let serviceName = controlService.getCharacteristic(Characteristic.Name).value;
    this.log.info(`[${fileName}] Updated ${serviceName} control`);
    controlService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(controlState);
    controlService.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(controlState);
    controlService.getCharacteristic(Characteristic.CurrentTemperature).updateValue(controlLimit);
    controlService.getCharacteristic(Characteristic.TargetTemperature).updateValue(controlLimit);
  }

  async setControlAmps(device, controlService, value, callback) {
    if (controlService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
      callback('error');
    } else {
      controlService.getCharacteristic(Characteristic.TargetTemperature).updateValue(value);
      let amps;
      if (this.platform.useFahrenheit) {
        amps = (value * 1.8 + 32 + 0.01).toFixed(2);
      } else {
        amps = value;
      }
      let currentMode;
      let chargerData = await this.wallboxapi.getChargerData(this.platform.token, device.id).catch((err) => {
        this.log.error(`[${fileName}] Failed to get charger data. \n${err}`);
      });
      let statusCode = chargerData.status;
      try {
        currentMode = this.enumeration.filter((result) => result.status_id == statusCode)[0].mode;
        this.log.debug(`[${fileName}] checking current mode = ${currentMode}`);
      } catch (error) {
        currentMode = 'unknown';
        this.log.error(`[${fileName}] Failed current mode check ${statusCode}. Error: ${error}`);
      }
      switch (currentMode) {
        case 'lockedMode':
          switch (statusCode) {
            case 209:
              this.log.info(`[${fileName}] Car must be connected for this operation`);
              controlService
                .getCharacteristic(Characteristic.TargetTemperature)
                .updateValue(controlService.getCharacteristic(Characteristic.CurrentTemperature).value);
              callback();
              break;
            case 210:
              this.log.info(`[${fileName}] Charger must be unlocked for this operation`);
              this.log.warn(`[${fileName}] Car Connected. Unlock charger to start session`);
              controlService
                .getCharacteristic(Characteristic.TargetTemperature)
                .updateValue(controlService.getCharacteristic(Characteristic.CurrentTemperature).value);
              callback();
              break;
          }
        case 'standbyMode':
        case 'chargingMode':
          this.log.debug(`[${fileName}] set amps to ${amps}`);
          if (
            controlService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT
          ) {
            callback('error');
          } else {
            let response = await this.wallboxapi.setAmps(this.platform.token, device.id, amps).catch((err) => {
              this.log.error(`[${fileName}] Failed to set amps. \n${err}`);
            });
            switch (response.status) {
              case 403:
                this.log.warn(`[${fileName}] Wrong status showing in HomeKit, updating`);
              case 200:
                controlService
                  .getCharacteristic(Characteristic.CurrentTemperature)
                  .updateValue(controlService.getCharacteristic(Characteristic.TargetTemperature).value);
                break;
              default:
                controlService
                  .getCharacteristic(Characteristic.TargetTemperature)
                  .updateValue(controlService.getCharacteristic(Characteristic.CurrentTemperature).value);
                this.log.info(`[${fileName}] Failed to change charging amps ${response.data.title}`);
                this.log.debug(`[${fileName}] `, response.data);
                break;
            }
          }
          callback();
          break;
        case 'firmwareUpdate':
        case 'errorMode':
          this.log.info(`[${fileName}] This operation cannot be completed at this time, status ${statusCode}`);
          this.log.error(`[${fileName}] the charger ${device.name} has a fault condition with code = ${statusCode}`);
          controlService
            .getCharacteristic(Characteristic.TargetTemperature)
            .updateValue(controlService.getCharacteristic(Characteristic.CurrentTemperature).value);
          callback();
          break;
        default:
          this.log.info(`[${fileName}] This operation cannot be completed at this time, status ${statusCode}`);
          controlService
            .getCharacteristic(Characteristic.TargetTemperature)
            .updateValue(controlService.getCharacteristic(Characteristic.CurrentTemperature).value);
          callback();
          break;
      }
    }
  }

  async setControlState(device, controlService, value, callback) {
    if (controlService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
      callback('error');
    } else {
      controlService.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(value);
      let currentMode;
      let chargerData = await this.wallboxapi.getChargerData(this.platform.token, device.id).catch((err) => {
        this.log.error(`[${fileName}] Failed to get charger data. \n${err}`);
      });
      let statusCode = chargerData.status;
      try {
        currentMode = this.enumeration.filter((result) => result.status_id == statusCode)[0].mode;
        this.log.debug(`[${fileName}] checking status code = ${statusCode}, current mode = ${currentMode}`);
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
          controlService
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .updateValue(controlService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value);
          callback();
          break;
        case 'standbyMode':
          this.log.info(`[${fileName}] Waiting for a charge request`);
          if (
            controlService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT
          ) {
            callback('error');
          } else {
            let response = await this.wallboxapi.remoteAction(this.platform.token, device.id, 'resume').catch((err) => {
              this.log.error(`[${fileName}] Failed to resume. \n${err}`);
            });
            switch (response.status) {
              case 403:
                this.log.warn(`[${fileName}] Wrong status showing in HomeKit, updating`);
              case 200:
                controlService
                  .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                  .updateValue(controlService.getCharacteristic(Characteristic.TargetHeatingCoolingState).value);
                this.log.info(`[${fileName}] Charging resumed`);
                break;
              default:
                controlService
                  .getCharacteristic(Characteristic.TargetHeatingCoolingState)
                  .updateValue(controlService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value);
                this.log.info(`[${fileName}] Failed to start charging`);
                this.log.debug(`[${fileName}] `, response.data);
                break;
            }
          }
          callback();
          break;
        case 'chargingMode':
          let serviceName = controlService.getCharacteristic(Characteristic.Name).value;
          this.log.debug(`[${fileName}] toggle control ${serviceName}`);
          if (
            controlService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT
          ) {
            callback('error');
          } else {
            let response = await this.wallboxapi.remoteAction(this.platform.token, device.id, 'pause').catch((error) => {
              this.log.error(`[${fileName}] Failed to pause. \n${error}`);
            });
            switch (response.status) {
              case 403:
                this.log.warn(`[${fileName}] Wrong status showing in HomeKit, updating`);
              case 200:
                controlService
                  .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                  .updateValue(controlService.getCharacteristic(Characteristic.TargetHeatingCoolingState).value);
                this.log.info(`[${fileName}] Charging paused`);
                break;
              default:
                controlService
                  .getCharacteristic(Characteristic.TargetHeatingCoolingState)
                  .updateValue(controlService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value);
                this.log.info(`[${fileName}] Failed to stop charging`);
                this.log.debug(`[${fileName}] `, response.data);
                break;
            }
          }
          callback();
          break;
        case 'firmwareUpdate':
        case 'errorMode':
          this.log.info(`[${fileName}] This operation cannot be completed at this time, status ${statusCode}`);
          this.log.error(`[${fileName}] the charger ${device.name} has a fault condition with code = ${statusCode}`);
          controlService
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .updateValue(controlService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value);
          callback();
        default:
          this.log.info(`[${fileName}] This operation cannot be completed at this time, status ${statusCode}`);
          controlService
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .updateValue(controlService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value);
          callback();
          break;
      }
    }
  }

  setControlUnits(device, controlService, value, callback) {
    if (controlService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
      callback('error');
    } else {
      this.log.debug(`[${fileName}] change unit value to ${value}`);
      callback();
    }
  }

  getControlState(controlService, callback) {
    if (controlService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
      callback('error');
    } else {
      let currentValue = controlService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value;
      callback(null, currentValue);
    }
  }

  getControlAmps(controlService, callback) {
    if (controlService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
      callback('error');
    } else {
      let currentValue = controlService.getCharacteristic(Characteristic.CurrentTemperature).value;
      callback(null, currentValue);
    }
  }

  getControlUnits(controlService, callback) {
    if (controlService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
      callback('error');
    } else {
      let currentValue = controlService.getCharacteristic(Characteristic.TemperatureDisplayUnits).value;
      callback(null, currentValue);
    }
  }
}
module.exports = control;
