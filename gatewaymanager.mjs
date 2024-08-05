import { Metadata, credentials } from '@grpc/grpc-js'
import { GatewayServiceClient } from '@chirpstack/chirpstack-api/api/gateway_grpc_pb.js'
import gwProtobufPkg from '@chirpstack/chirpstack-api/api/gateway_pb.js'

import application from './application.mjs'

/**
 * Retrieves the gateway using gRPC API of chirpstack.
 */
class GatewayManager {
  /**
     * Set default value for the fields
     * Initialization is done after, with the initialize method.
     */
  constructor () {
    this.server = ''
    this.apiToken = ''
    this.metadata = new Metadata()
    this.gateways = {} // will be filled during initialization
    this.initial_backoff = 10 // value in seconds
    this.maximum_backoff = 100 // values in seconds
  }

  /**
     * Set default value
     * @param {string} server
     * @param {string} apiToken
     */
  setServerInfo (server, apiToken) {
    this.apiToken = apiToken
    this.server = server
    this.metadata.set('authorization', 'Bearer ' + apiToken)
    this.gateways = {} // will be filled during initialization
  }

  /**
     * Wrap the gRPC call to wait for result
     * @returns Promise
     */
  async _wrap_gRPCCall () {
    const gwDevices = new GatewayServiceClient(
      this.server,
      credentials.createInsecure())

    // create the request
    const lstGWReq = new gwProtobufPkg.ListGatewaysRequest()
    lstGWReq.setLimit(20)
    lstGWReq.setOffset(0)

    // Create the Metadata object.
    const metadata = new Metadata()
    metadata.set('authorization', 'Bearer ' + this.apiToken)

    const myPromise = new Promise(function (resolve, reject) {
      gwDevices.list(lstGWReq, metadata, (err, answer) => {
        if (err) {
          reject(err)
        } else {
          const gatewayInfo = {}
          for (const gwItem of answer.getResultList()) {
            application.logger.info('euid:' + gwItem.getGatewayId())
            gatewayInfo[gwItem.getGatewayId()] = {
              name: gwItem.getName(),
              desc: gwItem.getDescription(),
              lat: gwItem.getLocation().getLatitude(),
              lon: gwItem.getLocation().getLongitude()
            }
          }
          resolve(gatewayInfo)
        }
      })
    })
    return myPromise
  }

  /**
     * Try to get the gateway list from gRPC
     * If failed sleep and retry until the maximum backoff time is reached.
     * @returns gateway list
     */
  async initialize () {
    let sleep_time = this.initial_backoff
    while(sleep_time < this.maximum_backoff){
      try {
        this.gateways = await this._wrap_gRPCCall()
      } catch (error) {
        application.logger.error('Gateway manager initialization failure: ' + error)
      }
      const gwCount = Object.keys(this.gateways).length
      if(gwCount > 0){
        application.logger.info(`${gwCount} gateway(s) have been discovered with gRPC call.`)
        return this.gateways
      } else {
        const sleep = (ms) => {
          return new Promise(resolve => setTimeout(resolve, ms));
        };
        await sleep(sleep_time * 1000);
        sleep_time = sleep_time * 2
        application.logger.info(`Time before next retry to gRPC ${sleep_time} seconds.`)
      }
    }
    application.logger.error('No gateway has been discovered. Stopping the service.')
    process.exit(1)
  }
}

// export
const gatewayManager = new GatewayManager()
export default gatewayManager
