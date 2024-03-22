// A sample stream consumer using the blocking variant of XREAD.
// https://redis.io/commands/xread/
// This consumes entries from a stream created by stream-producer.js

import { createClient, commandOptions } from 'redis';
import pkg from 'protobufjs';
const { load, Root, util } = pkg;

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



// protobuf initialisation
var root = new Root();
// override function to resolve all file from proto folder
// and not relative the import
// cf. https://github.com/protobufjs/protobuf.js/issues/368
root.resolvePath = function(origin, target) {
    let rootPath = "proto"
    let resolvedPath = `${rootPath}/${target}`
    console.debug("origin: " + origin + "target: " + target + "=>" + resolvedPath);    
    // determine the path to load and return it (i.e. use a regex)
    return resolvedPath
};
root.loadSync('integration/integration.proto');
root.resolveAll()
let upMessage = root.lookupType("integration.UplinkEvent");


while (true) {
  try {
    let response = await client.xRead(
      commandOptions({
        isolated: true,
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
        BLOCK: 5000
      }
    );

    if (response) {
      console.log(JSON.stringify(response));      
      let bufferValue = response[0].messages[0].message.up;
      console.log("id: " + response[0].messages[0].message.id);
      console.log("response: " + typeof(bufferValue) + " buffer: "  + Buffer.isBuffer(bufferValue));

      try {        
        let formattedPayload = new Uint8Array (bufferValue);
        let decodedMessage = upMessage.decode(formattedPayload);        
        console.log( decodedMessage );
      } catch (e) {
        if (e instanceof util.ProtocolError) {
          console.log("far decoded message with missing required fields");
        } else {
          console.log("wire format is invalid" + e);
          //throw e; 
        }
      } 
      // Get the ID of the first (only) entry returned.
      currentId = response[0].messages[0].id;
      console.log(currentId);
    } else {      
      console.log('No new stream entries.');
    }
  } catch (err) {
    console.error(err);
  }
}
