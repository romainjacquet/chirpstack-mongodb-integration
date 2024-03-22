// A sample stream consumer using the blocking variant of XREAD.
// https://redis.io/commands/xread/
// This consumes entries from a stream created by stream-producer.js

import { createClient, commandOptions } from 'redis';
import pkg from 'protobufjs';
const { load, Root, util } = pkg;
import { program } from 'commander';
import { assert } from 'console';

// TODO: put it in a dedicated class
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

  }

  /**
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


// CLi parsing
program
  .description('Chirp stack stream consumer')
  .option('-h, --help', 'Collect the event from chirpstack and write to mongoDB')
  .option('-v, --verbose', 'More verbose output to troubleshoot')
  .parse(process.argv);

const options = program.opts();

if (options.verbose) {
  console.log('Debug mode enabled');
}

if (options.help) {
  program.outputHelp();
  process.exit(0);
}


// Replace these values with your actual Redis server configuration
const redisHost = 'localhost';
const redisPort = '6379';
const redisPassword = 'TheRedisPwd!';


const client = await createClient(    
    {
        host: redisHost,
        port: redisPort,
        password: redisPassword
    }
)
  .on('error', err => console.log('Redis Client Error', err))
  .connect();

let currentId = '0-0'; // Start at lowest possible stream ID
let streamName = 'device:stream:event';


process.on('SIGINT', () => {  
  console.log('Received SIGINT signal. Shutting down...');  
  ChirpstackEvent.printStats();
  process.exit();
});

// main loop waiting for events
while (true) {
  try {
    let response = await client.xRead(
      commandOptions({        
        returnBuffers: true
      }), [
        // XREAD can read from multiple streams, starting at a
        // different ID for each...
        {
          key: streamName,
          id: currentId
        }
      ], {
        // Read 1 entry at a time, block for 5 seconds if there are none.
        COUNT: 1,
        BLOCK: 10000
      }
    );

    if (response) {      
      let chirpEvent = new ChirpstackEvent();  
      currentId = ""+response[0].messages[0].id;    
      let newMessage = chirpEvent.decodeStream(response[0].messages[0])
      if(options.verbose){
        console.log( newMessage );
      }            
    } else {
      if(options.verbose) {
        console.log('No new stream entries.');
      }            
    }
  } catch (err) {
    console.error(err);
  }
}



