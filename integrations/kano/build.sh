#!/bin/bash
# build the image and push to minikube cluster
# definitions
IMAGE_NAME="kalisio/chirpstack-kano-integration"
IMAGE_TAG=1.0
IMAGE_TMP_TARBALL="/tmp/image.tar"

# commands to builds
docker build -t "$IMAGE_NAME:$IMAGE_TAG" .
docker save -o "${IMAGE_TMP_TARBALL}"  "$IMAGE_NAME:$IMAGE_TAG"
minikube image load "${IMAGE_TMP_TARBALL}"

rm $IMAGE_TMP_TARBALL
echo "Image $IMAGE_NAME:$IMAGE_TAG pushed to minikube."