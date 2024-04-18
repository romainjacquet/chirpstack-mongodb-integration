import { Metadata, credentials } from '@grpc/grpc-js'
import { GatewayServiceClient } from '@chirpstack/chirpstack-api/api/gateway_grpc_pb.js'
import gwProtobufPkg from '@chirpstack/chirpstack-api/api/gateway_pb.js'

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
            console.log('euid:' + gwItem.getGatewayId())
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
     *
     * @returns gateway list
     */
  async initialize () {
    try {
      this.gateways = await this._wrap_gRPCCall()
    } catch (error) {
      console.log('Gateway manager initialization failure: ' + error)
    }
    const gwCount = Object.keys(this.gateways).length
    console.log(`${gwCount} gateway(s) have been discovered with gRPC call.`)
    return this.gateways
  }
}

// export
const gatewayManager = new GatewayManager()
export default gatewayManager
