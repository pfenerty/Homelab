.PHONY: install synth deploy

## Install Node.js dependencies
install:
	flox activate -- npm install

## Synthesize Kubernetes manifests into synth-output/
synth:
	flox activate -- npm run synth
	@printf 'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources:\n' > synth-output/kustomization.yaml
	@for f in synth-output/*.k8s.yaml; do printf '  - %s\n' "$$(basename $$f)"; done >> synth-output/kustomization.yaml
## Copy synthesized manifests to the Flux app directory
HOMELAB_TEKTON_OCIDEX ?= ../talos-cluster/flux/apps/tekton-ocidex
deploy: synth
	cp synth-output/*.yaml $(HOMELAB_TEKTON_OCIDEX)/
