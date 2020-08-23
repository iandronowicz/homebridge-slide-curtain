/* eslint-disable max-len */
/* eslint-disable comma-dangle */
/* eslint-disable quotes */
import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
} from "homebridge";

import request from "request";
import poll from "poll";

/*
 * IMPORTANT NOTICE
 *
 * One thing you need to take care of is, that you never ever ever import anything directly from the "homebridge" module (or the "hap-nodejs" module).
 * The above import block may seem like, that we do exactly that, but actually those imports are only used for types and interfaces
 * and will disappear once the code is compiled to Javascript.
 * In fact you can check that by running `npm run build` and opening the compiled Javascript file in the `dist` folder.
 * You will notice that the file does not contain a `... = require("homebridge");` statement anywhere in the code.
 *
 * The contents of the above import statement MUST ONLY be used for type annotation or accessing things like CONST ENUMS,
 * which is a special case as they get replaced by the actual value and do not remain as a reference in the compiled code.
 * Meaning normal enums are bad, const enums can be used.
 *
 * You MUST NOT import anything else which remains as a reference in the code, as this will result in
 * a `... = require("homebridge");` to be compiled into the final Javascript code.
 * This typically leads to unexpected behavior at runtime, as in many cases it won't be able to find the module
 * or will import another instance of homebridge causing collisions.
 *
 * To mitigate this the {@link API | Homebridge API} exposes the whole suite of HAP-NodeJS inside the `hap` property
 * of the api object, which can be acquired for example in the initializer function. This reference can be stored
 * like this for example and used to access all exported variables and classes from HAP-NodeJS.
 */
let hap: HAP;

/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
  hap = api.hap;
  api.registerAccessory(
    "HomebridgeSlideCurtain",
    ExampleWindowCoveringAccessory
  );
};

class ExampleWindowCoveringAccessory implements AccessoryPlugin {
  private readonly log: Logging;
  private readonly config: AccessoryConfig;
  private readonly api: API;

  private readonly name: string;

  private readonly service: Service;
  private readonly informationService: Service;
  private readonly characteristic;

  private isLikelyMoving;
  private calibrationTime;
  private tolerance;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.characteristic = api.hap.Characteristic;

    // extract name from config
    this.name = config.name;
    this.tolerance = config.tolerance || 7;
    this.isLikelyMoving = false;
    this.calibrationTime = (config.closing_time || 40) * 1000; // 40 seconds
    // create a new Window Covering service
    this.service = new hap.Service.WindowCovering(this.name, "asd");

    // create handlers for required characteristics
    this.service
      .getCharacteristic(this.characteristic.CurrentPosition)
      .on("get", this.handleCurrentPositionGet.bind(this));

    this.service
      .getCharacteristic(this.characteristic.TargetPosition)
      .on("get", this.handleTargetPositionGet.bind(this))
      .on("set", this.handleTargetPositionSet.bind(this));

    this.service
      .getCharacteristic(this.characteristic.PositionState)
      .on("get", this.handlePositionStateGet.bind(this));

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, "Custom Manufacturer")
      .setCharacteristic(hap.Characteristic.Model, "Custom Model");

    log.info("WindowCovering finished initializing!");

    //setting initial position
    request
      .post(
        "http://" + this.config.ip + "/rpc/Slide.GetInfo",
        (error, response, body) => {
          if (error) {
            this.log.info("error:", error); // Print the error if one occurred
          }
          this.log.info("statusCode:", response && response.statusCode); // Print the response status code if a response was received
          this.log.info("body:", body);
          let position = this.SlideAPIPositionToHomekit(JSON.parse(body).pos);

          if (this.CalculateDifference(position, 100) <= this.tolerance) {
            position = 100;
          } else if (this.CalculateDifference(position, 0) <= this.tolerance) {
            position = 0;
          }
          this.service
            .getCharacteristic(this.characteristic.TargetPosition)
            .updateValue(position);

          this.service
            .getCharacteristic(this.characteristic.CurrentPosition)
            .updateValue(position);
        }
      )
      .auth("user", this.config.code, false);

    const pollInterval = config.poll_interval || 5;
    poll(this.updateSlideInfo.bind(this), pollInterval * 1000);
  }

  updateSlideInfo() {
    this.log.debug("Triggered update slide info from poll");
    request
      .post(
        "http://" + this.config.ip + "/rpc/Slide.GetInfo",
        (error, response, body) => {
          if (error) {
            this.log.info("error:", error); // Print the error if one occurred
          }
          this.log.info("statusCode:", response && response.statusCode); // Print the response status code if a response was received
          this.log.info("body:", body);

          let targetPosition;
          let position = this.SlideAPIPositionToHomekit(JSON.parse(body).pos);

          if (!this.isLikelyMoving) {
            targetPosition = position;
            if (this.CalculateDifference(position, 100) <= this.tolerance) {
              targetPosition = 100;
            } else if (
              this.CalculateDifference(position, 0) <= this.tolerance
            ) {
              targetPosition = 0;
            }
            this.service
              .getCharacteristic(this.characteristic.TargetPosition)
              .updateValue(targetPosition);
          }

          targetPosition = this.service.getCharacteristic(
            this.characteristic.TargetPosition
          ).value;

          const difference = this.CalculateDifference(targetPosition, position);
          this.log.debug(
            "Difference between position and target position: " + difference
          );
          this.log.debug("Current target position: " + targetPosition);
          this.log.debug("Position from API: " + position);

          if (difference <= this.tolerance) {
            position = targetPosition;
          }

          this.service
            .getCharacteristic(this.characteristic.CurrentPosition)
            .updateValue(position);

          if (targetPosition == position) {
            this.service
              .getCharacteristic(this.characteristic.PositionState)
              .updateValue(this.characteristic.PositionState.STOPPED);
            // We have stopped so set the likely moving to false
            this.isLikelyMoving = false;
          } else if (targetPosition < position) {
            this.service
              .getCharacteristic(this.characteristic.PositionState)
              .updateValue(this.characteristic.PositionState.DECREASING);
          } else {
            this.service
              .getCharacteristic(this.characteristic.PositionState)
              .updateValue(this.characteristic.PositionState.INCREASING);
          }
        }
      )
      .auth("user", this.config.code, false);
  }

  /**
   * Handle requests to get the current value of the "Current Position" characteristic
   */
  handleCurrentPositionGet(callback) {
    this.log.debug("Triggered GET CurrentPosition");
    request
      .post(
        "http://" + this.config.ip + "/rpc/Slide.GetInfo",
        (error, response, body) => {
          if (error) {
            this.log.info("error:", error); // Print the error if one occurred
          }
          this.log.info("statusCode:", response && response.statusCode); // Print the response status code if a response was received
          this.log.info("body:", body);
          let position = this.SlideAPIPositionToHomekit(JSON.parse(body).pos);
          let targetPosition;

          if (!this.isLikelyMoving) {
            targetPosition = position;
            if (this.CalculateDifference(position, 100) <= this.tolerance) {
              targetPosition = 100;
            } else if (
              this.CalculateDifference(position, 0) <= this.tolerance
            ) {
              targetPosition = 0;
            }
            this.service
              .getCharacteristic(this.characteristic.TargetPosition)
              .updateValue(targetPosition);
          }
          targetPosition = this.service.getCharacteristic(
            this.characteristic.TargetPosition
          ).value;

          const difference = this.CalculateDifference(targetPosition, position);
          if (difference <= this.tolerance) {
            position = targetPosition;
          }
          this.service
            .getCharacteristic(this.characteristic.CurrentPosition)
            .updateValue(position);

          callback(null, position);
        }
      )
      .auth("user", this.config.code, false);
  }

  /**
   * Handle requests to get the current value of the "Target Position" characteristic
   */
  handleTargetPositionGet(callback) {
    this.log.debug("Triggered GET TargetPosition");
    request
      .post(
        "http://" + this.config.ip + "/rpc/Slide.GetInfo",
        (error, response, body) => {
          if (error) {
            this.log.info("error:", error); // Print the error if one occurred
          }
          this.log.info("statusCode:", response && response.statusCode); // Print the response status code if a response was received
          this.log.info("body:", body);
          const data = JSON.parse(body);
          let position = this.SlideAPIPositionToHomekit(data.pos);
          if (this.CalculateDifference(position, 100) <= this.tolerance) {
            position = 100;
          } else if (this.CalculateDifference(position, 0) <= this.tolerance) {
            position = 0;
          }
          callback(null, position);
        }
      )
      .auth("user", this.config.code, false);
  }

  /**
   * Handle requests to set the "Target Position" characteristic
   */
  handleTargetPositionSet(targetPosition, callback) {
    this.log.debug("Triggered SET TargetPosition:" + targetPosition);

    const setPos = this.HomekitPositionToSlideAPI(targetPosition);

    request(
      {
        method: "POST",
        url: "http://" + this.config.ip + "/rpc/Slide.SetPos",
        json: true,
        body: {
          pos: setPos,
        },
      },
      (error, response, body) => {
        if (error) {
          this.log.info("error:", error); // Print the error if one occurred
        }
        this.log.info("statusCode:", response && response.statusCode); // Print the response status code if a response was received
        this.log.info("body:", body);

        const currentPosition =
          this.service.getCharacteristic(this.characteristic.CurrentPosition)
            .value || targetPosition;

        if (targetPosition == currentPosition) {
          this.service
            .getCharacteristic(this.characteristic.PositionState)
            .updateValue(this.characteristic.PositionState.STOPPED);
        } else if (targetPosition < currentPosition) {
          this.service
            .getCharacteristic(this.characteristic.PositionState)
            .updateValue(this.characteristic.PositionState.DECREASING);
        } else {
          this.service
            .getCharacteristic(this.characteristic.PositionState)
            .updateValue(this.characteristic.PositionState.INCREASING);
        }
        this.service
          .getCharacteristic(this.characteristic.TargetPosition)
          .updateValue(targetPosition);
        this.isLikelyMoving = true;
        setTimeout(() => {
          this.log.debug("Stopping the move from time-out");
          this.isLikelyMoving = false;
        }, this.calibrationTime + 1000);
        poll(this.updateSlideInfo.bind(this), 3000, () => {
          if (!this.isLikelyMoving) {
            this.log.debug("Stopping the increased poll rate");
          }
          return !this.isLikelyMoving;
        });
        callback(null, targetPosition);
      }
    ).auth("user", this.config.code, false);

    //callback(null);
  }

  /**
   * Handle requests to get the current value of the "Position State" characteristic
   */
  handlePositionStateGet(callback) {
    this.log.debug("Triggered GET PositionState");
    //Por ahora que nunca diga abriendo/cerrando que vaya de una al target position
    callback(null, this.characteristic.PositionState.STOPPED);
  }

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log("Identify!");
  }

  /*
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
  getServices(): Service[] {
    return [this.informationService, this.service];
  }

  // The slide API uses 1.0 for fully closed, homekit uses 0 for fully closed.
  // The slide API uses 0 for fully open and HomeKit uses 100 for fully open.
  // This function converts the HomeKit position to a Slide API allowed position.
  HomekitPositionToSlideAPI(position) {
    let newPosition = 100 - position;
    newPosition = newPosition / 100;
    return Math.min(Math.max(newPosition, 0), 1);
  }

  // The slide API uses 1.0 for fully closed, homekit uses 0 for fully closed.
  // The slide API uses 0 for fully open and HomeKit uses 100 for fully open.
  // This function converts the slide API position to a HomeKit allowed position.
  SlideAPIPositionToHomekit(position) {
    let newPosition = position * 100;
    newPosition = 100 - newPosition;
    return Math.min(Math.max(newPosition, 0), 100);
  }

  CalculateDifference(first, second) {
    let difference = first - second;
    if (difference < 0) {
      difference = difference * -1;
    }
    return difference;
  }
}
