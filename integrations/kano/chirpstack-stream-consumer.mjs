// A sample stream consumer using the blocking variant of XREAD.
// https://redis.io/commands/xread/
// This consumes entries from a stream created by stream-producer.js

import { createClient, commandOptions } from 'redis';
import pkg from 'protobufjs';
const { load, Root, util } = pkg;
import { program, Option } from 'commander';
import { assert } from 'console';
import { MongoClient } from 'mongodb';


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

// TODO: put it in a dedicated class
class UplinkEventAdapter {
  /**
   * Allow the transformation of JSon object coming from Chirpstack to GeoJSON
   * Allow to write to mongo
   * @param {string} user 
   * @param {string} password 
   * @param {string} host 
   * @param {number} port 
   * @param {string} mongoDB database name
   */
  constructor(user, password, host, port, database) {  
    // TODO : connexion to mongoDB
    // FIXME: hard-coded value for the moment, replace by API gPRC calls
    this.GWMap = {'24e124fffef460b4': {"lat": 43.600443297757835, "lon": 1.419038772583008}};
    this.devicesEUID = ['24e124136d490175', '	24e124743d429065'];
    this.mongoURI = `mongodb://${user}:${password}@${host}:${port}/${database}`
    this.mongoDB = database
  }

  /**
   * 
   * @param {object} jsChirpEvent decoded from the protobuf
   * @returns ${object} geoJSON object
   */
  getGeoJSON(jsChirpEvent){
    // get location
    let gwEuid = jsChirpEvent.rxInfo[0].gatewayId;
    if(! gwEuid in this.GWMap){
      console.log(`Unknown gateway ${gwEuid}.`);
      return null;
    }
    let lat = this.GWMap[gwEuid].lat;
    let lon = this.GWMap[gwEuid].lon;
    // read measures
    let euid = jsChirpEvent.deviceInfo.devEui ;    
    // create the geoJson and copy the properties    
    let geoJSON = {
      type: 'Point',
      coordinates: [lon, lat],
      properties: {} 
    };
    for (const key in jsChirpEvent.object.fields){
      geoJSON.properties[key] = this.getKindValue(jsChirpEvent.object.fields[key]);      
    }     
    return geoJSON;
  }

  /**
   * extract value from Value message (cf protobug struct.proto from google)
   * @param {*} protoMessage 
   * @returns 
   */
  getKindValue(protoMessage){
    
    let properties = Object.getOwnPropertyNames(protoMessage);
    assert(properties.length == 1)
    let kind = properties[0];
    switch(kind){
      case "numberValue":
      case "stringValue":
      case "boolValue":
      case "nullValue":
        return protoMessage[kind];
        break;
      case "structValue":
      case "listValue":
        console.log("Not currently supported");
        assert(false)
        break;
      default:
        console.log("Unsupported type:"+kind);
        assert(false)
    }
    return null;
  }
  
  /**
   * Insert object into mongoDB
   * @param {geojson object} geoJson 
   */
  async insertGeoJSON(geoJson) {
    const client = new MongoClient(this.mongoURI);
    const observationCollection = "chirpstack-observations";
    try {
        await client.connect();
        console.log(`Connected to MongoDB ${this.mongoDB} opened`);
        const db = client.db(this.mongoDB);                
        const collection = db.collection(observationCollection);
        
        // Insert GeoJSON object into collection
        await collection.insertOne(geoJson);
        console.log('GeoJSON inserted successfully');
    } catch (error) {
        console.error('Error inserting GeoJSON:', error);
    } finally {
        await client.close();
        console.log('MongoDB connection closed');
    }
  }
}


// CLi parsing
program
  .description(`Chirp stack stream consumer. 
  Collect events from chirpstack and write to mongoDB
  It's not recommanded to use command line switches for passwords.`)
  .option('-h, --help', 'display help')
  .option('-v, --verbose', 'verbose output to troubleshoot')
  .addOption(new Option('--redisHost <host>', 'redis hostname').env("REDIS_HOST"))
  .addOption(new Option('--redisPort <port>', 'redis port').argParser(parseInt).env("REDIS_PORT"))  
  .addOption(new Option('--redisPassword <password>', 'redis password').env("REDIS_PASSWORD"))
  .addOption(new Option('--mongoDB <DB>', 'mongo db name').env('MONGO_DB_NAME'))
  .addOption(new Option('--mongoUser <user>', 'mongo user name').env('MONGO_USER'))
  .addOption(new Option('--mongoPassword <password>', 'mongo password').env('MONGO_PASSWORD'))
  .addOption(new Option('--mongoPort <port>', 'mongo port').env('MONGO_PORT').argParser(parseInt))
  .addOption(new Option('--mongoHost <host>', 'mongo host ').env('MONGO_HOST'))
  .parse(process.argv);

const options = program.opts();

if (options.verbose) {
  console.log('Debug mode enabled');
}

if (options.help) {
  program.outputHelp();
  process.exit(0);
}
console.log(options.redisHost);

const client = await createClient(    
    {
        host: options.redisHost,
        port: Number.parseInt(options.redisPort),
        password: options.redisPassword
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
      chirpEvent.setFilter(["up"]);
      currentId = ""+response[0].messages[0].id;    
      let newMessage = chirpEvent.decodeStream(response[0].messages[0])
      if(newMessage !== null){
        let adapter = new UplinkEventAdapter(
          options.mongoUser, options.mongoPassword, options.mongoHost, options.mongoPort, options.mongoDB);
        let geojson = adapter.getGeoJSON(newMessage);
        adapter.insertGeoJSON(geojson);
        if(options.verbose){
          console.log( newMessage );
        }            
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



