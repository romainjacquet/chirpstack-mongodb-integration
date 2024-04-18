import { assert } from 'console';

// TODO: put it in a dedicated class
export class UplinkEventAdapter {
  /**
   * Allow the transformation of JSon object coming from Chirpstack to GeoJSON
   * Allow to write to mongo
   * The constructor doesn't do anything except initialization variables
   * @param {object} gatewayMap gateway map (i.e stations)
   */
  constructor(gatewayMap) {
    this.GWMap = gatewayMap;
  }

  /**
   *
   * @param {object} jsChirpEvent decoded from the protobuf
   * @returns ${Array} of geoJSON object
   */
  getGeoJSONFeatures(jsChirpEvent) {
    // get location to check if the gateway is registered
    let gwEuid = jsChirpEvent.rxInfo[0].gatewayId;
    if (!gwEuid in this.GWMap) {
      console.log(`Unknown gateway ${gwEuid}.`);
      return null;
    }
    let lat = this.GWMap[gwEuid].lat;
    let lon = this.GWMap[gwEuid].lon;
    // read measures
    let euid = jsChirpEvent.deviceInfo.devEui;
    let ns_time_ms = jsChirpEvent.rxInfo[0].nsTime.seconds * 1000 + jsChirpEvent.rxInfo[0].nsTime.nanos / 1000;
    let gateway_id = jsChirpEvent.rxInfo[0].gatewayId;
    const observation_datetime = new Date(ns_time_ms);
    // create the geoJson, Kano require one feature per sensor
    let geoJSONArray = [];
    for (const key in jsChirpEvent.object.fields) {
      let geoJSON = {
        type: 'Feature',
        geometry: {
          type: "Point",
          coordinates: [lon, lat],
        },
        properties: {
          'euid': jsChirpEvent.deviceInfo.devEui,
          'name': jsChirpEvent.deviceInfo.deviceName,
          'gw_euid': gateway_id
        },
        time: observation_datetime
      };
      geoJSON['properties'][key] = this.getKindValue(jsChirpEvent.object.fields[key]);
      geoJSONArray.push(geoJSON);
    }
    return geoJSONArray;
  }

  /**
   * extract value from Value message (cf protobug struct.proto from google)
   * @param {*} protoMessage
   * @returns
   */
  getKindValue(protoMessage) {

    let properties = Object.getOwnPropertyNames(protoMessage);
    assert(properties.length == 1);
    let kind = properties[0];
    switch (kind) {
      case "numberValue":
      case "stringValue":
      case "boolValue":
      case "nullValue":
        return protoMessage[kind];
        break;
      case "structValue":
      case "listValue":
        console.log("Not currently supported");
        assert(false);
        break;
      default:
        console.log("Unsupported type:" + kind);
        assert(false);
    }
    return null;
  }
}
