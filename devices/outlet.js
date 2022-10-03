let packageJson=require('../package.json')
let wallboxAPI=require('../wallboxapi')
let enumeration=require('../enumerations')

function basicOutlet (platform,log,config){
	this.log=log
	this.platform=platform
	this.wallboxapi=new wallboxAPI(this,log)
	this.enumeration=enumeration
}

basicOutlet.prototype={

  createOutletService(device, type){
    this.log.debug('adding new outlet')
		let outletService=new Service.Outlet(type, device.id)
		let outletOn=false
		if(device.statusDescription=="Charging"){outletOn=true}
    outletService
      .setCharacteristic(Characteristic.On, outletOn)
      .setCharacteristic(Characteristic.Name, type)
      .setCharacteristic(Characteristic.StatusFault,false)
    return outletService
  },

  configureOutletService(device, outletService){
    this.log.info("Configured %s outlet for %s" , outletService.getCharacteristic(Characteristic.Name).value, device.name)
    outletService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getOutletValue.bind(this, outletService))
      .on('set', this.setOutletValue.bind(this, device, outletService))
  },

  setOutletValue(device, outletService, value, callback){
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
					outletService.getCharacteristic(Characteristic.On).updateValue(!value)
					callback()
					break
				case 'standbyMode':
					this.log.info('Waiting for a charge request')
					if(outletService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
						callback('error')
					}
					else{
						this.wallboxapi.remoteAction(this.platform.token,device.id,'resume').then(response=>{
							switch(response.status){
								case 200:
									outletService.getCharacteristic(Characteristic.On).updateValue(value)
									this.log.info('Charging resumed')
									break
								default:
									outletService.getCharacteristic(Characteristic.On).updateValue(!value)
									this.log.info('Failed to start charging')
									this.log.debug(response.data)
									break
							}
						})
					}
					callback()
					break
				case 'chargingMode':
					this.log.debug('toggle outlet %s',outletService.getCharacteristic(Characteristic.Name).value)
					if(outletService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
						callback('error')
					}
					else{
						this.wallboxapi.remoteAction(this.platform.token,device.id,'pause').then(response=>{
							switch(response.status){
								case 200:
									outletService.getCharacteristic(Characteristic.On).updateValue(value)
									this.log.info('Charging paused')
									break
								default:
									outletService.getCharacteristic(Characteristic.On).updateValue(!value)
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
					outletService.getCharacteristic(Characteristic.On).updateValue(!value)
					callback()
				default:
					this.log.info('This opertation cannot be completed at this time, status %s',statusCode)
					outletService.getCharacteristic(Characteristic.On).updateValue(!value)
					callback()
					break
			}
		})
  },

	getOutletValue(outletService, callback){
		if(outletService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
			callback('error')
		}
		else{
			currentValue=outletService.getCharacteristic(Characteristic.On).value
			callback(null, currentValue)
		}
	}

}

module.exports = basicOutlet
