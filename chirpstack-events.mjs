/**
 * Managed the unmarshalling of Chirpstack events
 * This is mainly protobuf dealing.
 */

import pkg from 'protobufjs';
const { Root, util } = pkg;
import { assert } from 'console';

class ChirpstackEvent {
    // a counter
    static stats = 
      {"up":0, "down":0, "ack":0, "txack": 0, "log": 0, "status": 0, "location": 0, "integration": 0};
    /**
     * Initialize protobuf by reading the definition in proto folder
     */
    constructor() {            
        this.root = new Root();
        // override function to resolve all file from proto folder
        // and not relative the import
        // cf. https://github.com/protobufjs/protobuf.js/issues/368
        this.root.resolvePath = function(origin, target) {
            let rootPath = "proto"
            let resolvedPath = `${rootPath}/${target}`
            //console.debug("origin: " + origin + "target: " + target + "=>" + resolvedPath);    
            // determine the path to load and return it (i.e. use a regex)
            return resolvedPath
        };
        this.root.loadSync('integration/integration.proto');
        this.root.resolveAll()
        this.eventMap = {
          "up": this.root.lookupType("integration.UplinkEvent"),
          "down": this.root.lookupType("integration.JoinEvent"),
          "ack": this.root.lookupType("integration.AckEvent"),
          "txack": this.root.lookupType("integration.TxAckEvent"),
          "log": this.root.lookupType("integration.LogEvent"), 
          "status": this.root.lookupType("integration.StatusEvent"), 
          "location": this.root.lookupType("integration.LocationEvent"), 
          "integration": this.root.lookupType("integration.IntegrationEvent")
      };
      this.eventFilters;
    }
  
    /**
     * Allow the user to filter event and keep only some events
     * For the filtered event, decode function will return null
     * Ex: filter(['up', 'log'])
     * @param {Array} eventsName 
     */
    setFilter(eventsName){
      this.eventFilters = eventsName;
    }
  
    /**
     * decode a message from protobug, according to the filters
     * @param {object} streamMessage with id and event type key 
     * @returns {object} with the chirpstack event
     */
    decodeStream(streamMessage) {
        // a message has two key id and the message
        // the message a one key per item transmitted
        console.log("Read event: " + streamMessage.id)
        let eventType = null;
        for (let key in streamMessage.message) {
          if(key != "id"){
            eventType = key;
            break;
          }
        }
        if (eventType == null){
          return null;
        }
        console.log("Event Type: " + eventType)
        if(! eventType in this.eventMap) {
          console.log("Received unknown event:" + eventType);
          return null;
        }
        // check filter
        if(this.eventFilters.length > 0){
          if(!this.eventFilters.includes(eventType)){
            return null;
          }
        }
  
        assert(Buffer.isBuffer(streamMessage.message[eventType])) 
        try {
          let decodedMessage = this.eventMap[eventType].decode(streamMessage.message[eventType]);             
          // update stats
          ChirpstackEvent.stats[eventType] = ChirpstackEvent.stats[eventType] + 1;
          
          return decodedMessage;
        } catch (e) {
          if (e instanceof util.ProtocolError) {
            console.log("far decoded message with missing required fields");
          } else {
            console.log("wire format is invalid" + e);
            //throw e; 
          }
        }  
        return null;
      }
  
      /**
       * Display a summary of all the event processed by the class
       */
      static printStats(){
        let total = 0;
        for (let key in ChirpstackEvent.stats) {
          total += ChirpstackEvent.stats[key]
        }
        
        for (let key in ChirpstackEvent.stats) {
          console.log( key+ " :\t\t" + ChirpstackEvent.stats[key]);
        }
        console.log(`${total} event received.`)
      }
    }

export default ChirpstackEvent;