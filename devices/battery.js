let wallboxAPI = require('../wallboxapi')

function battery(platform, log) {
	this.log = log
	this.platform = platform
	this.wallboxapi = new wallboxAPI(this, log)
}

battery.prototype = {

	createBatteryService(device) {
		this.log.info('Adding battery service for %s charger ', device.name)
		let batteryStatus = new Service.Battery(device.name, device.id)
		let stateOfCharge = device.stateOfCharge ? device.stateOfCharge : 0;
		batteryStatus
			.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
			.setCharacteristic(Characteristic.BatteryLevel, stateOfCharge)
			.setCharacteristic(Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGING)
			.setCharacteristic(Characteristic.ActiveIdentifier, device.maxAvailableCurrent)
		return batteryStatus
	},

	configureBatteryService(batteryStatus) {
		this.log.debug("Configured battery service for %s", batteryStatus.getCharacteristic(Characteristic.Name).value)
		if (batteryStatus.getCharacteristic(Characteristic.BatteryLevel).value < 30) {
			batteryStatus
				.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
		} else {
			batteryStatus
				.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
		}
		//.on('get', this.getStatusLowBattery.bind(this, batteryStatus))
	},
	updateBatteryService(batteryStatus, batteryChargeState, batteryPercent) {
		if (!batteryStatus) { return; }
		else {
			this.log.debug("Update battery service for %s", batteryStatus.getCharacteristic(Characteristic.Name).value)
			batteryStatus.getCharacteristic(Characteristic.ChargingState).updateValue(batteryChargeState)
			batteryStatus.getCharacteristic(Characteristic.BatteryLevel).updateValue(batteryPercent)
			if (batteryStatus.getCharacteristic(Characteristic.BatteryLevel).value < 10) {
				batteryStatus
					.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
			} else {
				batteryStatus
					.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
			}
		}
	},

	getStatusLowBattery(batteryStatus, callback) {
		let batteryValue = batteryStatus.getCharacteristic(Characteristic.BatteryLevel).value
		let currentValue = batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).value
		if (batteryValue <= 10) {
			this.log.warn('Battery Status Low %s%', batteryValue)
			batteryStatus.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
			currentValue = Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
		}
		callback(null, currentValue)
	}

}

module.exports = battery
