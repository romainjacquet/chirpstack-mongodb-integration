# Chirpstack integration for Kano

[Kano](https://kalisio.github.io/kano/) is integrated in [Chirpstack](https://github.com/chirpstack/) with a microservice written in nodejs.
The behaviour of the micro service is:

  * connect to redis stream `device:stream:event` and listen for new events.
  * unmarshall event using chirpstack protobuf definition
  * convert this events to geojson
  * write to mongo DB in a collection called `chirpstack-observations`

> [!WARNING]
> For the moment only event with type Up are handled. Event like log, join and other are not handled.

## build

A shell script `build.sh` is provided to aggregate command to build and push in the minikube cluster.

```shell
./build.sh
```

The command `docker save` is required due to a docker regression in docker 25 (cf. [minikube/issues/18021](https://github.com/kubernetes/minikube/issues/18021) ).
