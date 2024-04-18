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
     * @param {*} server 
     * @param {*} api_token 
     */
    GatewayManager(server, api_token){
        this.server = server;
        this.api_token = apiToken;
        this.metadata = new Metadata();
        this.metadata.set("authorization", "Bearer " + apiToken);
        this.gateways = {}; // will be filled during initialization
    }

    /**
     * Wrap the gRPC call to wait for result
     * @returns Promise 
     */
    async _wrap_gRPCCall(){
        const gwDevices = new GatewayServiceClient(
            server, 
            credentials.createInsecure());
        
        // create the request
        let lstGWReq = new gw_pb_pkg.ListGatewaysRequest();
        lstGWReq.setLimit(20);
        lstGWReq.setOffset(0);
        
        
        // Create the Metadata object.
        const metadata = new Metadata();
        metadata.set("authorization", "Bearer " + apiToken);
        
        
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
            console.log("Failed to initialized."+error);
        }
        
        return this.gateways;        
    }

    
}

// This must point to the ChirpStack API interface.
const server = "192.168.59.101:31102";
const apiToken = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJjaGlycHN0YWNrIiwiaXNzIjoiY2hpcnBzdGFjayIsInN1YiI6IjhhNjVjYmRhLTgyYzMtNGQ1MS05YzQ2LTBiN2NiMjU2MDRjOCIsInR5cCI6ImtleSJ9.JFal9wQB20pORaO8-ANffM1J8q-hozoj1r6pskohAKo";
let gwManager = new GatewayManager(server, apiToken);
await gwManager.initialize();
console.log(JSON.stringify(gwManager.gateways));
console.log("End.");
