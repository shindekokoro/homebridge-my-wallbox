const wallboxAPI = require('../wallboxapi');
const packageJson = require('../package.json');
const fileName = 'lock';

class lockMechanism {
  constructor(platform, log) {
    this.log = log;
    this.platform = platform;
    this.wallboxapi = new wallboxAPI(this.platform, log);
  }

  createLockAccessory(device, config, uuid, platformAccessory) {
    this.log.info(`[${fileName}] Adding lock for ${device.name} charger`);
    if (!platformAccessory) {
      platformAccessory = new PlatformAccessory(device.name, uuid);
      let lockService = new Service.LockMechanism(device.name, device.id);
      lockService.addCharacteristic(Characteristic.Identifier);
      lockService.addCharacteristic(Characteristic.StatusFault);
      lockService.addCharacteristic(Characteristic.OutletInUse);
      lockService.addCharacteristic(Characteristic.AccessoryIdentifier);
      platformAccessory.addService(lockService);
    }
    platformAccessory
      .getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Name, device.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Wallbox')
      .setCharacteristic(Characteristic.SerialNumber, device.serialNumber)
      .setCharacteristic(Characteristic.Model, this.platform.model_name)
      .setCharacteristic(Characteristic.Identify, true)
      .setCharacteristic(Characteristic.FirmwareRevision, config.software.currentVersion)
      .setCharacteristic(Characteristic.HardwareRevision, config.part_number)
      .setCharacteristic(Characteristic.SoftwareRevision, packageJson.version);

    platformAccessory
      .getService(Service.LockMechanism)
      .setCharacteristic(Characteristic.Name, device.name)
      .setCharacteristic(Characteristic.Identifier, device.serialNumber)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
      .setCharacteristic(Characteristic.OutletInUse, false)
      .setCharacteristic(Characteristic.AccessoryIdentifier, device.uniqueIdentifier);

    return platformAccessory;
  }

  createLockService(device) {
    this.log.info(`[${fileName}] Adding lock service for ${device.name}, serial number ${device.serialNumber}`);
    let lockService = new Service.LockMechanism(device.name, device.id);
    lockService
      .setCharacteristic(Characteristic.Identifier, device.serialNumber)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
      .setCharacteristic(Characteristic.OutletInUse, false)
      .setCharacteristic(Characteristic.AccessoryIdentifier, device.uid);
    return lockService;
  }

  configureLockService(device, lockService) {
    let serviceName = lockService.getCharacteristic(Characteristic.Name).value;
    this.log.debug(`[${fileName}] Configured ${serviceName} lock for ${device.name}`);
    lockService
      .setCharacteristic(Characteristic.LockCurrentState, device.locked)
      .setCharacteristic(Characteristic.LockTargetState, device.locked);
    lockService
      .getCharacteristic(Characteristic.LockTargetState)
      .on('get', this.getLockTargetState.bind(this, lockService))
      .on('set', this.setLockTargetState.bind(this, lockService));
    lockService
      .getCharacteristic(Characteristic.LockCurrentState)
      .on('get', this.getLockCurrentState.bind(this, device, lockService));
    //.on('set', this.setLockCurrentState.bind(this, device, lockService))
  }

  updateLockService(lockService, lockStatusFault, lockInUse, lockedState) {
    if (!lockService) return this.log.error(`[${fileName}] No lock configured`);
    this.log.debug(`[${fileName}] Update Lock for ${lockService.getCharacteristic(Characteristic.Name).value}`);
    lockService.getCharacteristic(Characteristic.StatusFault).updateValue(lockStatusFault);
    lockService.getCharacteristic(Characteristic.OutletInUse).updateValue(lockInUse);
    lockService.getCharacteristic(Characteristic.LockCurrentState).updateValue(lockedState);
    lockService.getCharacteristic(Characteristic.LockTargetState).updateValue(lockedState);
  }

  async getLockCurrentState(device, lockService, callback) {
    let currentValue = lockService.getCharacteristic(Characteristic.LockCurrentState).value;
    callback(null, currentValue);
    this.platform.startLiveUpdate(device); //may slowdown plugin
  }

  setLockCurrentState(device, lockService, value, callback) {
    let lockName = lockService.getCharacteristic(Characteristic.Name).value;
    this.log.info(`[${fileName}] Set State ${lockName}`);
    if (lockService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
      callback('error');
    } else {
      if (value == true) {
        this.log.info(`[${fileName}] ${lockName} locked`);
        lockService.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.SECURED);
      } else {
        this.log.info(`[${fileName}] ${lockName} unlocked`);
        lockService
          .getCharacteristic(Characteristic.LockCurrentState)
          .updateValue(Characteristic.LockCurrentState.UNSECURED);
      }
      callback();
    }
  }

  getLockTargetState(lockService, callback) {
    let currentValue = lockService.getCharacteristic(Characteristic.LockTargetState).value;
    callback(null, currentValue);
  }

  async setLockTargetState(lockService, value, callback) {
    if (lockService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
      callback('error');
    } else {
      await this.platform.getNewToken(this.platform.token);
      if (value == true) {
        this.log.info(`[${fileName}] Locking ${lockService.getCharacteristic(Characteristic.Name).value}`);
        lockService.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED);
        let chargerId = lockService.getCharacteristic(Characteristic.Identifier).value;
        let response = await this.wallboxapi.lock(this.platform.token, chargerId, value).catch((err) => {
          this.log.error(`[${fileName}] Failed to unlock.`, err);
        });
        try {
          switch (response.status) {
            case 200:
              lockService
                .getCharacteristic(Characteristic.LockCurrentState)
                .updateValue(response.data.data.chargerData.locked);
              break;
            default:
              lockService
                .getCharacteristic(Characteristic.LockCurrentState)
                .updateValue(!response.data.data.chargerData.locked);
              this.log.info(`[${fileName}] Failed to lock WallBox`);
              break;
          }
        } catch (error) {
          this.log.error(`[${fileName}] Failed to lock Wallbox`, error);
        }
      } else {
        let serviceName = lockService.getCharacteristic(Characteristic.Name).value;
        this.log.info(`[${fileName}] Unlocking ${serviceName}`);
        lockService.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.UNSECURED);
        let chargerId = lockService.getCharacteristic(Characteristic.Identifier).value;
        let response = await this.wallboxapi.lock(this.platform.token, chargerId, value).catch((err) => {
          this.log.error(`[${fileName}] Failed to unlock.`, err);
        });
        try {
          switch (response.status) {
            case 200:
              lockService
                .getCharacteristic(Characteristic.LockCurrentState)
                .updateValue(response.data.data.chargerData.locked);
              break;
            default:
              lockService
                .getCharacteristic(Characteristic.LockCurrentState)
                .updateValue(!response.data.data.chargerData.locked);
              this.log.info(`[${fileName}] Failed to unlock WallBox`);
              break;
          }
        } catch (error) {
          this.log.error(`[${fileName}] Failed to unlock Wallbox`, error);
        }
      }
      callback();
    }
  }
}
module.exports = lockMechanism;
