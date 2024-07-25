// external import
import { createClient, commandOptions } from 'redis'
import { Command, Option } from 'commander'
import { assert } from 'console'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// local imports
import mongoDBManager from './mongodbManager.mjs'
import gatewayManager from './gatewaymanager.mjs'
import ChirpstackEvent from './chirpstack-events.mjs'
import { UplinkEventAdapter } from './uplinkeventadapter.mjs'

/**
 * Encapsulate all global parameters, singleton class
 */
class Application {
  /**
     * Set default value for the fields
     * Initialization is done after, with the initialize method.
     */
  constructor () {
    this.options = ''
    this.program_options = {}
    this.logger = ''
  }

  /**
     * main function
     * listen for redis stream
     */
  async run () {
    const adapter = new UplinkEventAdapter(gatewayManager.gateways)

    // connect to REDIS stream
    console.log(`connect to ${this.options.redisHost}:${this.options.redisPort}`)

    const client = await createClient(
      {
        socket: {
          host: this.options.redisHost,
          port: Number.parseInt(this.options.redisPort)
        },
        password: this.options.redisPassword
      }
    )
      .on('error', err => console.log('Redis Client Error', err))
      .connect()

    let currentId = '0-0' // Start at lowest possible stream ID
    const streamName = 'device:stream:event'

    process.on('SIGINT', () => {
      console.log('Received SIGINT signal. Shutting down...')
      ChirpstackEvent.printStats()
      process.exit()
    })

    // main loop waiting for events
    while (true) {
      try {
        const response = await client.xRead(
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
        )

        if (response) {
          const chirpEvent = new ChirpstackEvent()
          chirpEvent.setFilter(['up'])
          currentId = '' + response[0].messages[0].id
          const newMessage = chirpEvent.decodeStream(response[0].messages[0])
          if (newMessage !== null) {
            const features = adapter.getGeoJSONFeatures(newMessage)
            if (!this.options.disableWrite) {
              await mongoDBManager.insertGeoJSONFeatures(features)
            }
            if (this.options.verbose) {
              console.log(newMessage)
            }
          }
        } else {
          if (this.options.verbose) {
            console.log('No new stream entries.')
          }
        }
      } catch (err) {
        console.error(err)
      }
    }
  }

  /**
   * Initialize command line and logger
   */
  async initialize () {
    // CLi parsing
    const program = new Command()
    program
    .description(`Chirp stack stream consumer.
    Collect events from chirpstack and write to mongoDB.`)
    .usage('CLI help')
    .addOption(new Option('-c, --config <config>', 'path to a JSON config file. ').env('MICROSERVICE_CONFIG_FILE').default( './config.json', 'default config file'))
    .parse(process.argv)

    this.program_options = program.opts()
    this.options = JSON.parse(readFileSync(this.program_options.config, 'utf8'));

    if (this.options.verbose) {
      console.log('Debug mode enabled')
    }

    // display help
    if (this.options.help) {
      program.outputHelp()
      this.finalize()
    }
    // logger
    // TODO

    // initialization of the managers: mongoDB, gateway with gRPC
    mongoDBManager.setDBInfo(
      this.options.mongoHost,
      this.options.mongoDB,
      this.options.mongoPort,
      this.options.mongoUser,
      this.options.mongoPassword
    )
    gatewayManager.setServerInfo(this.options.gRPCServer, this.options.apiToken)
    await gatewayManager.initialize()
    await mongoDBManager.syncStations(gatewayManager.gateways)

    if (this.options.cleanMongoDB) {
      console.log('Clean existing observations and stations in MongoDB')
      await mongoDBManager.deleteCollection(mongoDBManager.observationsCollection)
      await mongoDBManager.deleteCollection(mongoDBManager.stationsCollection)
    }

    assert(gatewayManager.gateways !== null)
    assert(Object.keys(gatewayManager.gateways).length > 0)
    console.log('End of initialization.')
  }

  finalize () {
      process.exit(0)
  }

}

// export
const application = new Application()
export default application
