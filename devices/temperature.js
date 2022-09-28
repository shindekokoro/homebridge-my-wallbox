let wallboxAPI=require('../wallboxapi')

function temperature (platform,log){
	this.log=log
	this.platform=platform
	this.wallboxapi=new wallboxAPI(this,log)
}

temperature.prototype={

	createTemperatureService(device, name){
		this.log.debug("Create temperature status for %s",device.name );
		let temperatureSensor = new Service.TemperatureSensor(device.name+' Level', device.id);

		return temperatureSensor;
	},

  async configureTemperatureService(temperatureSensor,stateOfCharge){
    this.log.debug("Configured temperature service for %s",temperatureSensor.getCharacteristic(Characteristic.Name).value)
		stateOfCharge = ((stateOfCharge-32)/1.8)
		temperatureSensor
			.setCharacteristic(Characteristic.CurrentTemperature,stateOfCharge)
  },

	async updateTemperatureService(temperatureSensor){
    this.log.debug("Update temperature service for %s",temperatureSensor.getCharacteristic(Characteristic.Name).value)

		temperatureSensor.getCharacteristic(Characteristic.CurrentTemperature).updateValue(this.stateOfCharge);
  }

}

module.exports = temperature
