#!/bin/bash
# build the image and push to minikube cluster
# definitions
IMAGE_REPOSITORY="harbor.portal.kalisio.com"
IMAGE_NAME="kalisio/chirpstack-kano-integration"
IMAGE_TAG=latest
IMAGE_TMP_TARBALL="/tmp/image.tar"

# commands to builds
docker build -t "$IMAGE_REPOSITORY/$IMAGE_NAME:$IMAGE_TAG" .
docker push "$IMAGE_REPOSITORY/$IMAGE_NAME:$IMAGE_TAG"

echo "Image $IMAGE_NAME:$IMAGE_TAG pushed to $IMAGE_REPOSITORY."