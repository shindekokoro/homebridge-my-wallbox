const wallboxAPI = require('../wallboxapi');
const fileName = 'battery';

class battery {
  constructor(platform, log) {
    this.log = log;
    this.platform = platform;
    this.wallboxapi = new wallboxAPI(this.platform, log);
  }

  createBatteryService(device) {
    this.log.info(`[${fileName}] Adding battery service for ${device.name} charger`);
    let stateOfCharge = device.stateOfCharge ? device.stateOfCharge : 0;
    let batteryStatus = new Service.Battery(device.name, device.id);
    batteryStatus
      .setCharacteristic(
        Characteristic.StatusLowBattery,
        Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
      )
      .setCharacteristic(Characteristic.BatteryLevel, stateOfCharge)
      .setCharacteristic(Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGING)
      .setCharacteristic(Characteristic.ActiveIdentifier, device.maxAvailableCurrent);
    return batteryStatus;
  }

  configureBatteryService(batteryStatus) {
    let serviceName = batteryStatus.getCharacteristic(Characteristic.Name).value;
    this.log.debug(`[${fileName}] Configured battery service for ${serviceName}`);
    if (batteryStatus.getCharacteristic(Characteristic.BatteryLevel).value < 30) {
      batteryStatus.setCharacteristic(
        Characteristic.StatusLowBattery,
        Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      );
    } else {
      batteryStatus.setCharacteristic(
        Characteristic.StatusLowBattery,
        Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
      );
    }
    //.on('get', this.getStatusLowBattery.bind(this, batteryStatus))
  }

  updateBatteryService(batteryStatus, batteryChargeState, batteryPercent) {
    let serviceName = batteryStatus.getCharacteristic(Characteristic.Name).value;
    if (!batteryStatus) {
      return;
    } else {
      this.log.debug(`[${fileName}] Update battery service for ${serviceName}`);
      batteryStatus.getCharacteristic(Characteristic.ChargingState).updateValue(batteryChargeState);
      batteryStatus.getCharacteristic(Characteristic.BatteryLevel).updateValue(batteryPercent);
      if (batteryStatus.getCharacteristic(Characteristic.BatteryLevel).value < 10) {
        batteryStatus.setCharacteristic(
          Characteristic.StatusLowBattery,
          Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
        );
      } else {
        batteryStatus.setCharacteristic(
          Characteristic.StatusLowBattery,
          Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
        );
      }
    }
  }

  configureBatteryService(batteryStatus) {
    let serviceName = batteryStatus.getCharacteristic(Characteristic.Name).value;
    this.log.debug(`[${fileName}] Configured battery service for ${serviceName}`);
    batteryStatus.getCharacteristic(Characteristic.StatusLowBattery);
  }

  getStatusLowBattery(batteryStatus, callback) {
    let batteryValue = batteryStatus.getCharacteristic(Characteristic.BatteryLevel).value;
    let currentValue = batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).value;
    if (batteryValue <= 10) {
      this.log.warn(`[${fileName}] Battery Status Low ${batteryValue}`);
      batteryStatus.setCharacteristic(
        Characteristic.StatusLowBattery,
        Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
      );
      currentValue = Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
    }
    callback(null, currentValue);
  }
}
module.exports = battery;
