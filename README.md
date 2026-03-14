# homelab

Personal infrastructure managed as code. Two projects live here:

| Directory | What it is |
|-----------|-----------|
| `talos-cluster/` | Three-node Kubernetes cluster running on Raspberry Pi 4s |
| `nix-dev-server/` | NixOS remote development server (GPU workstation) |

## Secrets

All secrets are encrypted with [SOPS](https://github.com/getsops/sops) using an age key. The key lives at `age.key` in the repo root (gitignored). Encryption rules are defined in `.sops.yaml`.

## Renovate

Dependency updates are automated via [Renovate](https://docs.renovatebot.com/), configured in `renovate.json`. Covers Nix flake inputs, Helm chart versions, and container image tags.
