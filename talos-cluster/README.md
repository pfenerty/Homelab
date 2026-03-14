# talos-cluster

A three-node Kubernetes cluster running on Raspberry Pi 4s, managed with [Talos Linux](https://www.talos.dev/) and [Flux CD](https://fluxcd.io/).

## Hardware

| Node | IP | Role |
|------|----|------|
| rpi-01 | 192.168.1.101 | Control plane |
| rpi-02 | 192.168.1.102 | Control plane |
| rpi-03 | 192.168.1.103 | Control plane |
| VIP | 192.168.1.100 | Kubernetes API (floating) |

All nodes run as control planes with `allowSchedulingOnControlPlanes: true`.

## Stack

| Component | Details |
|-----------|---------|
| OS | Talos Linux v1.12.5 |
| CNI | Cilium 1.19.1 (kube-proxy replacement, WireGuard encryption, VXLAN routing) |
| GitOps | Flux CD |
| Secrets | SOPS + age |
| VPN | Tailscale operator |
| CI | Tekton Pipelines + Dashboard |

## Repository Layout

```
talos-cluster/
├── Makefile                  # All cluster operations
├── talos/                    # Talos machine configs
│   ├── patches/              # Config patches (applied at generate time)
│   ├── clusterconfig/        # Generated node configs (gitignored secrets baked in)
│   └── secrets.yaml          # SOPS-encrypted cluster PKI + bootstrap tokens
└── flux/                     # Flux GitOps manifests
    ├── flux-system/          # Flux bootstrap components
    ├── cilium.kustomization.yaml
    ├── apps.kustomization.yaml
    └── apps/                 # Application workloads
```

## Common Operations

All operations are driven by `make`. Run `make <target>` from the `talos-cluster/` directory.

### Generate and apply config changes

```bash
# Regenerate all node configs from patches + secrets (SOPS decrypt is automatic)
make generate

# Apply configs to all running nodes
make apply-all

# Re-apply only the patches to existing configs (no secrets needed)
make repatch-all
make repatch-rpi-01   # single node
```

### Cluster lifecycle

```bash
# First-time node setup (node must be at DHCP IP)
make apply-rpi-01 NODE_DHCP_IP=192.168.1.x

# Bootstrap etcd (first install only)
make bootstrap

# Fetch kubeconfig
make kubeconfig

# Check cluster health
make health
```

### Upgrades

```bash
make upgrade-all          # upgrade all nodes (103 → 102 → 101)
make upgrade-101          # upgrade single node by last octet
```

## Prerequisites

- `talosctl`
- `kubectl`
- `sops`
- `helm` (for manual Helm operations)
- `flux` CLI
- age key at `../age.key` relative to this directory

## Known Issues / Architecture Notes

See [`docs/`](docs/) for detailed write-ups on non-obvious configuration decisions.
