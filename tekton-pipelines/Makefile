.PHONY: install synth deploy

## Install Node.js dependencies
install:
	flox activate -- npm install

## Synthesize Kubernetes manifests into synth-output/
synth:
	flox activate -- npm run synth

## Copy synthesized manifests to the Flux app directory
HOMELAB_TEKTON_OCIDEX ?= ../talos-cluster/flux/apps/tekton-ocidex
deploy: synth
	cp synth-output/*.yaml $(HOMELAB_TEKTON_OCIDEX)/
