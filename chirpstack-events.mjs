/**
 * Managed the unmarshalling of Chirpstack events
 * This is mainly protobuf dealing.
 */

import pkg from 'protobufjs'
import { assert } from 'console'
const { Root, util } = pkg

// local imports
import application from './application.mjs'

class ChirpstackEvent {
  // a counter
  static stats =
    { up: 0, down: 0, ack: 0, txack: 0, log: 0, status: 0, location: 0, integration: 0 }

  /**
     * Initialize protobuf by reading the definition in proto folder
     */
  constructor () {
    this.root = new Root()
    // override function to resolve all file from proto folder
    // and not relative the import
    // cf. https://github.com/protobufjs/protobuf.js/issues/368
    this.root.resolvePath = function (origin, target) {
      const rootPath = 'proto'
      const resolvedPath = `${rootPath}/${target}`
      // console.debug("origin: " + origin + "target: " + target + "=>" + resolvedPath);
      // determine the path to load and return it (i.e. use a regex)
      return resolvedPath
    }
    this.root.loadSync('integration/integration.proto')
    this.root.resolveAll()
    this.eventMap = {
      up: this.root.lookupType('integration.UplinkEvent'),
      down: this.root.lookupType('integration.JoinEvent'),
      ack: this.root.lookupType('integration.AckEvent'),
      txack: this.root.lookupType('integration.TxAckEvent'),
      log: this.root.lookupType('integration.LogEvent'),
      status: this.root.lookupType('integration.StatusEvent'),
      location: this.root.lookupType('integration.LocationEvent'),
      integration: this.root.lookupType('integration.IntegrationEvent')
    }
    this.eventFilters = null
  }

  /**
     * Allow the user to filter event and keep only some events
     * For the filtered event, decode function will return null
     * Ex: filter(['up', 'log'])
     * @param {Array} eventsName
     */
  setFilter (eventsName) {
    this.eventFilters = eventsName
  }

  /**
     * decode a message from protobug, according to the filters
     * @param {object} streamMessage with id and event type key
     * @returns {object} with the chirpstack event
     */
  decodeStream (streamMessage) {
    // a message has two key id and the message
    // the message a one key per item transmitted
    application.logger.info('Read event: ' + streamMessage.id)
    let eventType = null
    for (const key in streamMessage.message) {
      if (key !== 'id') {
        eventType = key
        break
      }
    }
    if (eventType == null) {
      return null
    }
    application.logger.info('Event Type: ' + eventType)
    if (!(eventType in this.eventMap)) {
      application.logger.info('Received unknown event:' + eventType)
      return null
    }
    // check filter
    if (this.eventFilters.length > 0) {
      if (!this.eventFilters.includes(eventType)) {
        return null
      }
    }

    assert(Buffer.isBuffer(streamMessage.message[eventType]))
    try {
      const decodedMessage = this.eventMap[eventType].decode(streamMessage.message[eventType])
      // update stats
      ChirpstackEvent.stats[eventType] = ChirpstackEvent.stats[eventType] + 1

      return decodedMessage
    } catch (e) {
      if (e instanceof util.ProtocolError) {
        application.logger.warn('far decoded message with missing required fields')
      } else {
        application.logger.warn('wire format is invalid' + e)
        // throw e;
      }
    }
    return null
  }

  /**
       * Display a summary of all the event processed by the class
       */
  static printStats () {
    let total = 0
    for (const key in ChirpstackEvent.stats) {
      total += ChirpstackEvent.stats[key]
    }

    for (const key in ChirpstackEvent.stats) {
      application.logger.info(key + ' :\t\t' + ChirpstackEvent.stats[key])
    }
    application.logger.info(`${total} event received.`)
  }
}

export default ChirpstackEvent
