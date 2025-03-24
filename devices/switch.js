const wallboxAPI = require('../wallboxapi');
const enumeration = require('../enumerations');
const fileName = 'switch';

class basicSwitch {
  constructor(platform, log, config) {
    this.log = log;
    this.platform = platform;
    this.wallboxapi = new wallboxAPI(this.platform, log);
    this.enumeration = enumeration;
  }

  createSwitchService(device, type) {
    this.log.info(`[${fileName}] Adding switch for ${device.name} charger`);
    let switchService = new Service.Switch(type, device.id);
    let switchOn = false;
    this.log.debug(`[${fileName}] Device status: ${device.status}`);
    if (device.status == 'CHARGING') {
      switchOn = true;
    }
    switchService
      .setCharacteristic(Characteristic.On, switchOn)
      .setCharacteristic(Characteristic.Name, device.name + ' ' + type)
      .setCharacteristic(Characteristic.StatusFault, false);
    return switchService;
  }

  configureSwitchService(device, switchService) {
    this.log.debug(
      `[${fileName}]configured ${switchService.getCharacteristic(Characteristic.Name).value} switch for ${device.name}`
    );
    switchService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getSwitchValue.bind(this, switchService))
      .on('set', this.setSwitchValue.bind(this, device, switchService));
  }

  updateSwitchService(switchService, switchState) {
    if (!switchService) return;
    this.log.info(
      `[${fileName}] Updated ${switchService.getCharacteristic(Characteristic.Name).value} switch to ${switchState}`
    );
    switchService.getCharacteristic(Characteristic.On).updateValue(switchState);
  }
  async setSwitchValue(device, switchService, value, callback) {
    if (switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
      callback('error');
    } else {
      switchService.getCharacteristic(Characteristic.On).updateValue(value);
      let currentMode;
      let refreshToken = await this.platform.getNewToken(this.platform.token).catch((err) => {
        this.log.error(`[${fileName}] Failed to get new token.`, err);
      });
      this.log.warn(`[${fileName}] Refreshed token: ${refreshToken}`);
      let chargerData = await this.wallboxapi.getChargerData(this.platform.token, device.id).catch((err) => {
        this.log.error(`[${fileName}] Failed to get charger data.`, err);
      });
      let statusCode = chargerData.status;
      try {
        currentMode = this.enumeration.filter((result) => result.status_id == statusCode)[0].mode;
        this.log.debug(`[${fileName}]checking status code = ${statusCode}, current mode = ${currentMode}`);
      } catch (error) {
        currentMode = 'unknown';
        this.log.error(`[${fileName}] Failed current mode check ${statusCode}. Error: ${error}`);
      }
      switch (currentMode) {
        case 'lockedMode':
        case 'readyMode':
          if (statusCode == 210) {
            this.log.warn(`[${fileName}] Car Connected. Unlock charger to start session`);
          } else {
            this.log.info(`[${fileName}] Car must be connected for this operation`);
          }
          switchService.getCharacteristic(Characteristic.On).updateValue(!value);
          callback();
          break;
        case 'standbyMode':
          this.log.info(`[${fileName}] Waiting for a charge request`);
          if (
            switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT
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
                switchService.getCharacteristic(Characteristic.On).updateValue(value);
                this.log.info(`[${fileName}] Charging resumed`);
                break;
              default:
                switchService.getCharacteristic(Characteristic.On).updateValue(!value);
                this.log.info(`[${fileName}] Failed to start charging`);
                this.log.debug(`[${fileName}] `, response.data);
                break;
            }
          }
          callback();
          break;
        case 'chargingMode':
          this.log.debug(`[${fileName}] Toggle switch ${switchService.getCharacteristic(Characteristic.Name).value}`);
          if (
            switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT
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
                switchService.getCharacteristic(Characteristic.On).updateValue(value);
                this.log.info(`[${fileName}] Charging paused`);
                break;
              default:
                switchService.getCharacteristic(Characteristic.On).updateValue(!value);
                this.log.info(`[${fileName}] Failed to stop charging`);
                this.log.debug(`[${fileName}] `, response.data);
                break;
            }
          }
          callback();
          break;
        case 'firmwareUpdate':
        case 'errorMode':
          this.log.info(`[${fileName}]This operation cannot be completed at this time, status ${statusCode}`);
          this.log.error(`[${fileName}] the charger ${device.name} has a fault condition with code = ${statusCode}`);
          switchService.getCharacteristic(Characteristic.On).updateValue(!value);
          callback();
        default:
          this.log.info(`[${fileName}]This operation cannot be completed at this time, status ${statusCode}`);
          switchService.getCharacteristic(Characteristic.On).updateValue(!value);
          callback();
          break;
      }
    }
  }

  getSwitchValue(switchService, callback) {
    if (switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
      callback('error');
    } else {
      let currentValue = switchService.getCharacteristic(Characteristic.On).value;
      callback(null, currentValue);
    }
  }
}
module.exports = basicSwitch;
