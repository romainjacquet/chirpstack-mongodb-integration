# MongoDB integration for Chirpstack

This is a chirpstack integration for MongoDB, written in nodejs.
It has been written to connect [Kano](https://kalisio.github.io/kano/) to [Chirpstack](https://github.com/chirpstack/). But it
can be used in more general purpose (without Kano) because it is finally "just" an chirpstack integration that write GeoJSON in the mongDB.

## Description

The microservice has a main loop and the following steps are performed:

  * connect to redis stream `device:stream:event` and listen for new events emitted by the chirpstack network server.
  * unmarshall events using chirpstack protobuf definition
  * convert this events to geojson
  * write to mongo DB in a collection called `chirpstack-observations`

![Chripstack](/schemas/chirpstack-mongodb-integration.drawio.png)

> [!IMPORTANT]
> For the moment only event with type `up` are handled. Event like `log`, `join` and other are not handled.

## installation

It's possible to use the docker image: `kalisio/chirpstack-mongodb-integration:latest`.
> [!NOTE]
> Latest is a rotating image, so update could occured.

```console
docker run -it harbor.portal.kalisio.com/kalisio/chirpstack-mongodb-integration:latest /app/chirpstack-stream-consumer.mjs --help
```

It's also possible to install from source easily.
```shell
npm install package.json
node ./chirpstack-stream-consumer.mjs
```

## usage 

```
Usage: chirpstack-stream-consumer CLI help

Chirp stack stream consumer. 
  Collect events from chirpstack and write to mongoDB
  It's not recommanded to use command line switches for passwords.

Options:
  -v, --verbose               verbose output to troubleshoot
  --redisHost <host>          redis hostname (default: localhost, env: REDIS_HOST)
  --redisPort <port>          redis port (default: standard redis port 6379, env: REDIS_PORT)
  --redisPassword <password>  redis password (env: REDIS_PASSWORD)
  --disableWrite              don't push to mongo DB (default: false, env: DISABLE_WRITE)
  --cleanMongoDB              delete object from the chirpstack collections (default: false, env: MONGO_CLEAN)
  --mongoDB <DB>              mongo db name (default: kano database is used, env: MONGO_DB_NAME)
  --mongoUser <user>          mongo user name (env: MONGO_USER)
  --mongoPassword <password>  mongo password (env: MONGO_PASSWORD)
  --mongoPort <port>          mongo port (default: mongo DB default port 27017, env: MONGO_PORT)
  --mongoHost <host>          mongo host  (default: localhost, env: MONGO_HOST)
  --gRPCServer <host>         host for gRPC calls, 127.0.0.1:8080  (default: localhost, env: GRPC_SERVER)
  --apiToken <token>          token for gRPC calls  (env: GRPC_TOKEN)
  -h, --help                  display help for command

```

### detailled description

| File                           | Description                                                                                                                                            |
|--------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| chirpstack-stream-consumer.mjs | main entry point   * read configuration from command line and environment variable  * instanciate objects  * main loop waiting for read stream events  |
| chirpstack-events.mjs          | decode event from protobuf                                                                                                                             |
| gatewaymanager.mjs             | fetch info about gateways from gRPC API                                                                                                                |
| mongodbManager.mjs             | common operation to mongodo; delete, insert, synchronize                                                                                               |
| uplinkeventadapter.mjs         | create the geosjon feature                                                                                                                             |

The folder proto contains the protobuf description coming from the official chirstack repo.

## Data model

The micro service **doesn't convert all the protobuf messages** to geoJSON. This is a conscious choice to keep only
what is interesting to display in Kano.

Data are written as GeoJSON features in two collections:

  * `chirpstack-stations`: contains all the stations (i.e gateway in the LoRa jargon), with position latitude, longitude.
  * `chirpstack-observations`: contains all the observations. An observations is one measure in the LoRa protocol. So
  one message in LoRa will result in many observations.

The link between the two collections is done using the attributes `properties.gw_euid` which is close to the gateway id in the
lora protocol. 

> [!NOTE]
> For the `chirpstack-observations` an extra field time is needed to have varying-time data. 

This is an example of a station, a MileSight gateway:
```json
{   "type": "Feature",
    "geometry": {
      "type": "Point",
      "coordinates": [ 1.419038772583008, 43.600443297757835 ]
    },
    "properties": {
      "euid": "24e124fffef460b4",
      "gw_euid": "24e124fffef460b4",
      "name": "MileSight GW"
    }
}
```

Below is an example of an observation for a sound sensor. Note the additionnal time field
and the `laeq` value returned by the sensor.
```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [ 1.419038772583008, 43.600443297757835 ]
  },
  "properties": {
    "euid": "24e124743d429065",
    "name": "ABP-soundSensor",
    "gw_euid": "24e124fffef460b4",
    "laeq": 42.9
  },
  "time": "2024-04-09T16:42:28.382Z"
}
```

## build docker images

A shell script `build.sh` is provided to aggregate command to build and push on the kalisio Harbor.

```shell
./build.sh
```

## roadmap

As the micro-service is in its early stages, some point can be improved.
Consider the following list as potential futures evolutions:

  * use a logging service like [winston](https://github.com/winstonjs/winston) 
  * use a JSON config file to replace too many command line opions. Probable use of [config](https://www.npmjs.com/package/config)
  * add a support for tenant. The idea behind is to separate the storage of the different data in different database. To isolate data that can come from different users.
  * add a TTL support for the observations collection
  * have a more complete support for events. `Join` and `Status`are interesting
  * add tests for the project
  * add CI and fix version image

## context

This chart has been written to display LoraWAN data in [Kano](https://github.com/kalisio/kano), a data explorer in 2D/3D.
Data management is done with [Chirpstack](https://www.chirpstack.io/), a popular LoraWAN network server.

![Chirpstack](/pictures/chirpstack-temperature.png)

This is part of R&D of Kalisio.
