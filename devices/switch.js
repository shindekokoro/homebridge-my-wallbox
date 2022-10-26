let wallboxAPI=require('../wallboxapi')
let enumeration=require('../enumerations')

function basicSwitch (platform,log,config){
	this.log=log
	this.platform=platform
	this.wallboxapi=new wallboxAPI(this,log)
	this.enumeration=enumeration
}

basicSwitch.prototype={

  createSwitchService(device, type){
    this.log.debug('adding new switch')
		let switchService=new Service.Switch(type, device.id)
		let switchOn=false
		if(device.statusDescription=="Charging"){switchOn=true}
    switchService
      .setCharacteristic(Characteristic.On, switchOn)
      .setCharacteristic(Characteristic.Name, type)
      .setCharacteristic(Characteristic.StatusFault,false)
    return switchService
  },

  configureSwitchService(device, switchService){
    this.log.info("Configured %s switch for %s" , switchService.getCharacteristic(Characteristic.Name).value, device.name)
    switchService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getSwitchValue.bind(this, switchService))
      .on('set', this.setSwitchValue.bind(this, device, switchService))
  },

	updateSwitchService(switchService, switchState){
		if(!switchService){ return; }
		this.log.info("Updated %s switch" , switchService.getCharacteristic(Characteristic.Name).value)
		switchService.getCharacteristic(Characteristic.On).updateValue(switchState)
	},

  setSwitchValue(device, switchService, value, callback){
		this.wallboxapi.getChargerData(this.platform.token,device.id).then(response=>{
			try{
				statusCode=response.data.data.chargerData.status
				currentMode=this.enumeration.items.filter(result=>result.status == statusCode)[0].mode
				this.log.debug('checking current mode = %s',currentMode)
			}catch(error){
				currentMode='unknown'
				this.log.error('failed current mode check')
			}
			switch(currentMode){
				case 'lockedMode':
				case 'readyMode':
					if(statusCode==210){
						this.log.info('Charger must be unlocked for this operation')
						this.log.warn('Car Connected. Unlock charger to start session')
					}
					else{
						this.log.info('Car must be connected for this operation')
					}
					switchService.getCharacteristic(Characteristic.On).updateValue(!value)
					callback()
					break
				case 'standbyMode':
					this.log.info('Waiting for a charge request')
					if(switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
						callback('error')
					}
					else{
						this.wallboxapi.remoteAction(this.platform.token,device.id,'resume').then(response=>{
							switch(response.status){
								case 403:
									this.log.warn('Wrong status showing in HomeKit, updating');
								case 200:
									switchService.getCharacteristic(Characteristic.On).updateValue(value)
									this.log.info('Charging resumed')
									break
								default:
									switchService.getCharacteristic(Characteristic.On).updateValue(!value)
									this.log.info('Failed to start charging')
									this.log.debug(response.data)
									break
							}
						})
					}
					callback()
					break
				case 'chargingMode':
					this.log.debug('toggle switch %s',switchService.getCharacteristic(Characteristic.Name).value)
					if(switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
						callback('error')
					}
					else{
						this.wallboxapi.remoteAction(this.platform.token,device.id,'pause').then(response=>{
							switch(response.status){
								case 403:
									this.log.warn('Wrong status showing in HomeKit, updating');
								case 200:
									switchService.getCharacteristic(Characteristic.On).updateValue(value)
									this.log.info('Charging paused')
									break
								default:
									switchService.getCharacteristic(Characteristic.On).updateValue(!value)
									this.log.info('Failed to stop charging')
									this.log.debug(response.data)
									break
							}
						})
					}
					callback()
					break
				case 'firmwareUpdate':
				case 'errorMode':
					this.log.info('This opertation cannot be completed at this time, status %s',statusCode)
					this.log.error('the charger %s has a fault condition with code=%s', device.name,statusCode)
					switchService.getCharacteristic(Characteristic.On).updateValue(!value)
					callback()
				default:
					this.log.info('This opertation cannot be completed at this time, status %s',statusCode)
					switchService.getCharacteristic(Characteristic.On).updateValue(!value)
					callback()
					break
			}
		})
  },

	getSwitchValue(switchService, callback){
		if(switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
			callback('error')
		}
		else{
			currentValue=switchService.getCharacteristic(Characteristic.On).value
			callback(null, currentValue)
		}
	}

}

module.exports = basicSwitch
