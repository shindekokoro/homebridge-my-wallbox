const wallboxAPI = require('../wallboxapi');
const fileName = 'sensor';

class sensor {
  constructor(platform, log) {
    this.log = log;
    this.platform = platform;
    this.wallboxapi = new wallboxAPI(this.platform, log);
  }

  createSensorService(device, type) {
    this.log.info(`[${fileName}] Adding sensor for ${device.name} charger.`);
    let humiditySensor = new Service.HumiditySensor(type, device.id);
    let stateOfCharge = 0;
    if (device.stateOfCharge) {
      stateOfCharge = device.stateOfCharge;
    }
    humiditySensor = new Service.HumiditySensor(type, device.id);
    humiditySensor
      .setCharacteristic(Characteristic.Name, device.name + ' ' + type)
      .setCharacteristic(Characteristic.CurrentRelativeHumidity, stateOfCharge);
    return humiditySensor;
  }

  configureSensorService(device, sensorStatus) {
    let serviceName = sensorStatus.getCharacteristic(Characteristic.Name).value;
    this.log.debug(`[${fileName}] Configured ${serviceName} sensor for ${device.name}`);
    sensorStatus.getCharacteristic(Characteristic.CurrentRelativeHumidity);
  }

  updateSensorService(sensorDevice, stateOfCharge) {
    if (!sensorDevice) return;
    let serviceName = sensorDevice.getCharacteristic(Characteristic.Name).value;
    this.log.debug(`[${fileName}] Update sensor service for ${serviceName}`);
    return sensorDevice.getCharacteristic(Characteristic.CurrentRelativeHumidity).updateValue(stateOfCharge);
  }
}

module.exports = sensor;
