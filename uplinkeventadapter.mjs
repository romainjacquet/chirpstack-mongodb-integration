import { assert } from 'console'

// TODO: put it in a dedicated class
export class UplinkEventAdapter {
  /**
   * Allow the transformation of JSon object coming from Chirpstack to GeoJSON
   * Allow to write to mongo
   * The constructor doesn't do anything except initialization variables
   * @param {object} gatewayMap gateway map (i.e stations)
   */
  constructor (gatewayMap) {
    this.GWMap = gatewayMap
  }

  /**
   *
   * @param {object} jsChirpEvent decoded from the protobuf
   * @returns ${Array} of geoJSON object
   */
  getGeoJSONFeatures (jsChirpEvent) {
    // get location to check if the gateway is registered
    const gwEuid = jsChirpEvent.rxInfo[0].gatewayId
    if (!(gwEuid in this.GWMap)) {
      application.logger.error(`Unknown gateway ${gwEuid}.`)
      return null
    }
    const lat = this.GWMap[gwEuid].lat
    const lon = this.GWMap[gwEuid].lon
    // read measures
    const nsTimeMs = jsChirpEvent.rxInfo[0].nsTime.seconds * 1000 + jsChirpEvent.rxInfo[0].nsTime.nanos / 1000
    const gatewayId = jsChirpEvent.rxInfo[0].gatewayId
    const observationDatetime = new Date(nsTimeMs)
    // create the geoJson, Kano require one feature per sensor
    const geoJSONArray = []
    for (const key in jsChirpEvent.object.fields) {
      const geoJSON = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lon, lat]
        },
        properties: {
          euid: jsChirpEvent.deviceInfo.devEui,
          name: jsChirpEvent.deviceInfo.deviceName,
          app_id: jsChirpEvent.deviceInfo.applicationId,
          app_name: jsChirpEvent.deviceInfo.applicationName,
          tenant_id: jsChirpEvent.deviceInfo.tenantId,
          tenant_name: jsChirpEvent.deviceInfo.tenantName,
          gw_euid: gatewayId
        },
        time: observationDatetime
      }
      geoJSON.properties[key] = this.getKindValue(jsChirpEvent.object.fields[key])
      geoJSONArray.push(geoJSON)
    }
    return geoJSONArray
  }

  /**
   * extract value from Value message (cf protobug struct.proto from google)
   * @param {*} protoMessage
   * @returns
   */
  getKindValue (protoMessage) {
    const properties = Object.getOwnPropertyNames(protoMessage)
    assert(properties.length === 1)
    const kind = properties[0]
    switch (kind) {
      case 'numberValue':
      case 'stringValue':
      case 'boolValue':
      case 'nullValue':
        return protoMessage[kind]
      case 'structValue':
      case 'listValue':
        application.logger.warn('Not currently supported')
        assert(false)
        break
      default:
        application.logger.warn('Unsupported type:' + kind)
        assert(false)
    }
    return null
  }
}
