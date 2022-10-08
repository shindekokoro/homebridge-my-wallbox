# Changes

## 1.1.2
Update
- Refresh token based off of TTL, no need for crazy calculations. Currently appears to be 15 minutes.

## 1.1.1
Update
- Added update__Service functions to control devices
- Cleanup code

## 1.1.0
Update
- Changed API endpoint for status updates.
-	Refactored code for status updates.
- Added support for additional status messages.
- Refactored code for battery status
-	Added status descriptions to logging after being dropped from API response.
- Bumped dependencies.
-	Code cleanup.
- Updated Readme
- Fixed some typos in logging output.
- Bug fixes for some error handling.

## 1.0.15
Update
-Code Cleaned up (Extra spaces removed, NL add to EOF)
-403 Return Code ("Wrong current status to start charging action") This error code is more of a warning that intended action is already in place.
-Wallbox error 14 code handling.

## 1.0.14
Update
- Improved/updated some error messaging
- Fixed bug with Start/Pause control
- Refactored code for better polling behavior
- Added outlet option for Start/Pause function
- Removed option for light control for amperage due to confusing percentage
- Added support for devices using Celsius


## 1.0.13
Update
-	Correct error handling on start and include retry logic.
- Cleaned up some error messaging
-	Bumped dependencies

## 1.0.12

Update
-	Added support for new status message.
- Cleaned up some error messaging

## 1.0.11
Test

## 1.0.10
Fix
-	Fix bug preventing successful start with default settings.

## 1.0.9
Update
-	Code cleanup
- Bumped dependencies
- Corrected benign unknown device warning message.

## 1.0.8 -beta
Update
-	Code cleanup
- bumped dependencies
- corrected benign unknown device warning message.

## 1.0.7
Update
-	Tied battery service option to having a car defined.

## 1.0.6
Update
- Estimate battery charge added.
- Added support for Start/Stop and Amps
- Added location support
- Code cleanup
- Fix bug with "waiting' message

## 1.0.5
Update
- Improved status updates.
- Improved error logging.
- Removed Null warning condition.

## 1.0.4
Update
- Added additional detail for battery state and cable connected in HomeKit.
- Added verified badge.

## 1.0.3
Update
- Cleanup Code.
- Updated Readme.

## 1.0.2
Fix
- Address bug when status update did not match expected response.

## 1.0.1
Initial
- HomeKit support for Wallbox Charger locking.
