# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal infrastructure managed as code. Two sub-projects:

| Directory | What |
|-----------|------|
| `talos-cluster/` | Three-node Kubernetes cluster on Raspberry Pi 4s (Talos Linux + Flux CD) |
| `nix-dev-server/` | NixOS remote development server (GPU workstation) |

## Secrets

All secrets are SOPS-encrypted with an age key at `age.key` (repo root, gitignored). Encryption rules are in `.sops.yaml`. Never commit decrypted secrets.

## Talos Cluster

Three RPi4 control-plane nodes (192.168.1.101-103) with a floating VIP at 192.168.1.100. Stack: Talos Linux, Cilium CNI, Flux CD GitOps, Tailscale, Tekton CI.

All operations run from `talos-cluster/`:

```bash
make generate        # Regenerate node configs from patches + SOPS secrets
make validate        # Validate all generated configs
make apply-all       # Apply configs to all running nodes
make repatch-all     # Re-apply patches without touching secrets
make repatch-rpi-01  # Re-apply patches to single node
make health          # Check cluster health
make upgrade-all     # Upgrade all nodes (103 → 102 → 101)
make upgrade-101     # Upgrade single node by last IP octet
make bootstrap       # First-time etcd bootstrap
make kubeconfig      # Fetch kubeconfig to ~/.kube/config
```

### Flux GitOps Layout

```
talos-cluster/flux/
├── flux-system/     # Flux bootstrap components
├── apps/            # Application workloads
└── *.kustomization.yaml  # Top-level kustomizations (cilium, apps)
```

## NixOS Dev Server

Flake-based NixOS configuration. Modules live in `nix-dev-server/modules/`, host configs in `nix-dev-server/hosts/`.

## Dependency Updates

Automated via [Renovate](https://docs.renovatebot.com/) — covers Nix flake inputs, Helm chart versions, and container image tags.

## Prerequisites

talosctl, kubectl, sops, helm, flux CLI, Tailscale
