let wallboxAPI=require('../wallboxapi')
let packageJson=require('../package.json')

function lockMechanism (platform,log){
	this.log=log
	this.platform=platform
	this.wallboxapi=new wallboxAPI(this,log)
}

lockMechanism.prototype={

  createLockAccessory(device,uuid){
    this.log.debug('Create Lock Accessory %s',device.name)
    let newPlatformAccessory=new PlatformAccessory(device.name, uuid)
    newPlatformAccessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Name, device.name)
      .setCharacteristic(Characteristic.Manufacturer, "Wallbox")
      .setCharacteristic(Characteristic.SerialNumber, device.serialNumber)
      .setCharacteristic(Characteristic.Model, device.chargerType)
      .setCharacteristic(Characteristic.Identify, true)
      .setCharacteristic(Characteristic.FirmwareRevision, device.softwareVersion)
      .setCharacteristic(Characteristic.HardwareRevision, "device.part_number")
      .setCharacteristic(Characteristic.SoftwareRevision, packageJson.version)
    return newPlatformAccessory
  },

  createLockService(device){
    this.log.debug("create Lock service for %s, serial number %s",device.name, device.serialNumber )
		let lockService=new Service.LockMechanism(device.name, device.id)
		lockService
			.setCharacteristic(Characteristic.SerialNumber, device.serialNumber)
			.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
			.setCharacteristic(Characteristic.OutletInUse,false)
			.setCharacteristic(Characteristic.AccessoryIdentifier, device.uid)
    return lockService
  },

  configureLockService(device, lockService){
    this.log.debug("configured Lock for %s",lockService.getCharacteristic(Characteristic.Name).value)
    lockService
			.setCharacteristic(Characteristic.LockCurrentState, device.locked)
			.setCharacteristic(Characteristic.LockTargetState, device.locked)
		lockService
			.getCharacteristic(Characteristic.LockTargetState)
			.on('get', this.getLockTargetState.bind(this,lockService))
      .on('set', this.setLockTargetState.bind(this, device, lockService))
		lockService
			.getCharacteristic(Characteristic.LockCurrentState)
			.on('get', this.getLockCurrentState.bind(this, device, lockService))
			//.on('set', this.setLockCurrentState.bind(this, device, lockService))
  },

	updateLockService(lockService, lockStatusFault, lockInUse, lockedState){
		if(!lockService){ return this.log.error('No lock configured'); }
		this.log.debug("Update Lock for %s",lockService.getCharacteristic(Characteristic.Name).value)
		lockService.getCharacteristic(Characteristic.StatusFault).updateValue(lockStatusFault)
		lockService.getCharacteristic(Characteristic.OutletInUse).updateValue(lockInUse)
		lockService.getCharacteristic(Characteristic.LockCurrentState).updateValue(lockedState)
		lockService.getCharacteristic(Characteristic.LockTargetState).updateValue(lockedState)
	},

	getLockCurrentState: function (device,lockService, callback) {
		let currentValue=lockService.getCharacteristic(Characteristic.LockCurrentState).value
		this.platform.startLiveUpdate(device)
		callback(null,currentValue)
	},

	setLockCurrentState: function (device, lockService, value, callback) {
		this.log.info('Set State %s',lockService.getCharacteristic(Characteristic.Name).value)
		if(lockService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
			callback('error')
		}
		else{
		if (value == true) {
			this.log.info('%s locked',lockService.getCharacteristic(Characteristic.Name).value)
			lockService.getCharacteristic(Characteristic.LockCurrentState).updatevalue(Characteristic.LockCurrentState.SECURED)
		}
		else {
			this.log.info('%s unlocked',lockService.getCharacteristic(Characteristic.Name).value)
			lockService.getCharacteristic(Characteristic.LockCurrentState).updateValue(Characteristic.LockCurrentState.UNSECURED)
		}
		callback()
		}
	},

	getLockTargetState: function (lockService, callback) {
		let currentValue=lockService.getCharacteristic(Characteristic.LockTargetState).value
		callback(null,currentValue)
	},

	setLockTargetState: function (device, lockService, value, callback) {
		if(lockService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
			callback('error')
		}
		else{
			if (value == true) {
				this.log.info('Locking %s',lockService.getCharacteristic(Characteristic.Name).value)
				lockService.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.SECURED)
				let chargerId=lockService.getCharacteristic(Characteristic.SerialNumber).value
				this.wallboxapi.lock(this.platform.token,chargerId,value).then(response=>{
					lockService.getCharacteristic(Characteristic.LockCurrentState).updateValue(response.data.data.chargerData.locked)
				})
			}
			else{
				this.log.info('Unlocking %s',lockService.getCharacteristic(Characteristic.Name).value)
				lockService.getCharacteristic(Characteristic.LockTargetState).updateValue(Characteristic.LockTargetState.UNSECURED)
				let chargerId=lockService.getCharacteristic(Characteristic.SerialNumber).value
				this.wallboxapi.lock(this.platform.token,chargerId,value).then(response=>{
					lockService.getCharacteristic(Characteristic.LockCurrentState).updateValue(response.data.data.chargerData.locked)
				})
			}
			callback()
		}
	}
}

module.exports = lockMechanism
