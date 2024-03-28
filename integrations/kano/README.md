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

```shell
docker build -t kalisio/chirpstack-kano-integration .
IMAGE_ID=$(docker images --format '{{ .Repository }}:{{ .Tag }}:{{ .ID }}' | grep kalisio/chirpstack-kano-integration:latest | cut -d ':' -f 3)
docker tag $IMAGE_ID kalisio/chirpstack-kano-integration:1.0
docker save -o /tmp/image.tar  kalisio/chirpstack-kano-integration
minikube image load /tmp/image.tar
```

The command `docker save` is required due to a docker regression in docker 25 (cf. [minikube/issues/18021](https://github.com/kubernetes/minikube/issues/18021) ).
