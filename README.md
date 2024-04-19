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
   

## build

A shell script `build.sh` is provided to aggregate command to build and push on the kalisio Harbor.

```shell
./build.sh
```

## debugging

To debug the microservice, it could be run directly on the cluster just using two port forwards.
The following command will redirect Redis and Mongodb ports, so you can run locally in your debugger
the microservice as it was running in k8s cluster.

```shell
kubectl port-forward svc/redis-master 6379:6379
kubectl port-forward svc/mongodb 27017:27017
```

