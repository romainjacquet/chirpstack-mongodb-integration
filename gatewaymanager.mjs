import { Metadata, credentials} from '@grpc/grpc-js';
import { GatewayServiceClient } from '@chirpstack/chirpstack-api/api/gateway_grpc_pb.js';
import gw_pb_pkg from '@chirpstack/chirpstack-api/api/gateway_pb.js';

/**
 * Retrieves the gateway using gRPC API of chirpstack.
 */
class GatewayManager {
    /**     
     * Set default value for the fields
     * Initialization is done after, with the initialize method.
     */
    constructor(){
        this.server = "";
        this.api_token = "";
        this.metadata = new Metadata();        
        this.gateways = {}; // will be filled during initialization
    }

    /**
     * Set default value
     * @param {string} server 
     * @param {string} api_token 
     */
    setServerInfo(server, api_token){
        this.api_token = api_token;
        this.server = server;
        this.metadata.set("authorization", "Bearer " + api_token);
        this.gateways = {}; // will be filled during initialization
    }

    /**
     * Wrap the gRPC call to wait for result
     * @returns Promise 
     */
    async _wrap_gRPCCall(){
        const gwDevices = new GatewayServiceClient(
            this.server, 
            credentials.createInsecure());
        
        // create the request
        let lstGWReq = new gw_pb_pkg.ListGatewaysRequest();
        lstGWReq.setLimit(20);
        lstGWReq.setOffset(0);
        
        
        // Create the Metadata object.
        const metadata = new Metadata();
        metadata.set("authorization", "Bearer " + this.api_token);
        
        
        let myPromise = new Promise(function(myResolve, myReject) {
            gwDevices.list(lstGWReq, metadata, (err, answer) => {
                if(err){                    
                    myReject(err)
                } else {
                    let gatewayInfo = {};
                    for(const gwItem of answer.getResultList() ){
                        console.log("euid:" + gwItem.getGatewayId());
                        gatewayInfo[gwItem.getGatewayId()] = {
                            "name": gwItem.getName(),
                            "desc": gwItem.getDescription(),
                            "lat": gwItem.getLocation().getLatitude(),
                            "lon":  gwItem.getLocation().getLongitude()
                        };
                    }                    
                    myResolve(gatewayInfo);
                }
            } );            
          });
        return myPromise;        
    }

    /**
     * 
     * @returns gateway list
     */
    async initialize(){
        try{
            this.gateways = await this._wrap_gRPCCall();
        }catch(error){
            console.log("Gateway manager initialization failure: "+error);
        }
        let gwCount = Object.keys(this.gateways).length;
        console.log(`${gwCount} gateway(s) have been discovered with gRPC call.`)
        return this.gateways;        
    }

    async writeStations(){
        
    }    
}

// export
const gatewayManager = new GatewayManager();
export default gatewayManager;