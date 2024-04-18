/*
 * Entry point the micro service 
 */

import { createClient, commandOptions } from 'redis';
import { program, Option } from 'commander';
import { assert } from 'console';

// local import
import mongoDBManager from './mongodbManager.mjs';
import gatewayManager from './gatewaymanager.mjs';
import ChirpstackEvent from './chirpstack-events.mjs';
import { UplinkEventAdapter } from './uplinkeventadapter.mjs';



// CLi parsing
program
  .description(`Chirp stack stream consumer. 
  Collect events from chirpstack and write to mongoDB
  It's not recommanded to use command line switches for passwords.`)
  .usage('CLI help')
  .option('-v, --verbose', 'verbose output to troubleshoot')
  .addOption(new Option('--redisHost <host>', 'redis hostname').env("REDIS_HOST").default('localhost', 'localhost'))
  .addOption(new Option('--redisPort <port>', 'redis port')
    .argParser(parseInt).env("REDIS_PORT").default('6379', 'standard redis port 6379'))  
  .addOption(new Option('--redisPassword <password>', 'redis password').env("REDIS_PASSWORD"))
  .addOption(new Option('--disableWrite', 'don\'t push to mongo DB').env('DISABLE_WRITE').default(false))
  .addOption(new Option('--cleanMongoDB', 'delete object from the chirpstack collections').env('MONGO_CLEAN').default(false))
  .addOption(new Option('--mongoDB <DB>', 'mongo db name').env('MONGO_DB_NAME').default('kano', 'kano database is used'))
  .addOption(new Option('--mongoUser <user>', 'mongo user name').env('MONGO_USER'))
  .addOption(new Option('--mongoPassword <password>', 'mongo password').env('MONGO_PASSWORD'))
  .addOption(new Option('--mongoPort <port>', 'mongo port')
    .env('MONGO_PORT').argParser(parseInt).default(27017, 'mongo DB default port 27017'))
  .addOption(new Option('--mongoHost <host>', 'mongo host ')
    .env('MONGO_HOST').default('localhost', 'localhost'))
  .addOption(new Option('--gRPCServer <host>', 'host for gRPC calls, 127.0.0.1:8080 ')
    .env('GRPC_SERVER').default('localhost', 'localhost'))
  .addOption(new Option('--apiToken <token>', 'token for gRPC calls ')
    .env('GRPC_TOKEN').makeOptionMandatory())        
  .parse(process.argv);

const options = program.opts();

if (options.verbose) {
  console.log('Debug mode enabled');
}


if (options.help) {
  program.outputHelp();
  process.exit(0);
}

// initialization of the managers: mongoDB, gateway with gRPC
mongoDBManager.setDBInfo(
  options.mongoHost,
  options.mongoDB,
  options.mongoPort,
  options.mongoUser,
  options.mongoPassword
);
gatewayManager.setServerInfo(options.gRPCServer, options.apiToken)
await gatewayManager.initialize();
await mongoDBManager.syncStations(gatewayManager.gateways);

if(options.cleanMongoDB){
  console.log("Clean existing observations in MongoDB");
  await mongoDBManager.deleteCollection(mongoDBManager.observationsCollection);
  await mongoDBManager.deleteCollection(mongoDBManager.stationsCollection);
}

assert(gatewayManager.gateways !== null); 
assert(Object.keys(gatewayManager.gateways).length > 0);
let adapter = new UplinkEventAdapter(gatewayManager.gateways);  

// connect to REDIS stream
console.log(`connect to ${options.redisHost}:${options.redisPort}`);

const client = await createClient(    
    {
        socket: {
          host: options.redisHost,
          port: Number.parseInt(options.redisPort)
        },        
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
        let features = adapter.getGeoJSONFeatures(newMessage);
        if(!options.disableWrite){
          await mongoDBManager.insertGeoJSONFeatures(features);
        }        
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



