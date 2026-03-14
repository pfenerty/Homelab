# talos/

Talos Linux machine configuration for the cluster. Configs are generated from patches + a SOPS-encrypted secrets bundle, then applied to nodes with `talosctl`.

## Structure

```
talos/
├── secrets.yaml          # SOPS-encrypted: cluster CA, etcd certs, bootstrap tokens
├── patches/
│   ├── all-nodes.yaml        # Applied to every node
│   ├── controlplane.yaml     # Applied to control plane nodes only
│   ├── rpi-01-network.yaml   # Per-node static IP + VIP
│   ├── rpi-02-network.yaml
│   └── rpi-03-network.yaml
└── clusterconfig/
    ├── controlplane.yaml     # Base control plane config (secrets baked in)
    ├── rpi-01.yaml           # Per-node config (controlplane + network patch)
    ├── rpi-02.yaml
    ├── rpi-03.yaml
    ├── worker.yaml           # Generated but unused (no worker nodes)
    └── talosconfig           # Client config for talosctl
```

## Config Generation

Configs in `clusterconfig/` are generated — do not edit them directly. Change the patches and regenerate.

```
secrets.yaml  ──┐
all-nodes.yaml  ├──► talosctl gen config ──► clusterconfig/controlplane.yaml
controlplane.yaml ┘                                   │
                                                       ▼
rpi-XX-network.yaml ──────────────────────► talosctl machineconfig patch ──► rpi-XX.yaml
```

The `make generate` target runs this pipeline. `secrets.yaml` is SOPS-encrypted; the Makefile decrypts it on the fly using `sops exec-file` with the age key at `../../age.key`.

## Patches

### `all-nodes.yaml`
- NTP servers (Cloudflare + Google IPs hardcoded to avoid bootstrap DNS dependency)
- DNS nameservers (1.1.1.1, 8.8.8.8)
- VM dirty writeback tuning for SD card / flash storage longevity
- kubelet `rotate-server-certificates: true`

### `controlplane.yaml`
- Disables the built-in CNI (`name: none`) — Cilium is installed via Flux instead
- Disables kube-proxy — Cilium's eBPF replaces it
- Enables scheduling on control plane nodes (no dedicated workers)

### `rpi-XX-network.yaml`
- Static IP assignment via `deviceSelector: driver: bcmgenet` (RPi built-in NIC)
- Default route
- VIP (`192.168.1.100`) on rpi-01 only — floats between nodes for API HA

## Applying Changes

**Full regeneration** (requires decrypting `secrets.yaml` — rotates all PKI):
```bash
make generate
make apply-all
```

**Patch-only update** (no secrets needed, idempotent):
```bash
make repatch-all
```

Use `repatch-all` when you only changed a patch file and don't need to touch the PKI material. Use `generate` + `apply-all` when adding a new node or after any change that needs fresh secrets.

## Adding a New Node

1. Add its IP to the `NODE_IP_*` variables in the Makefile
2. Create `patches/rpi-XX-network.yaml` with its static IP
3. Run `make generate` to produce `clusterconfig/rpi-XX.yaml`
4. Boot the node from a Talos image and run `make apply-rpi-XX NODE_DHCP_IP=<dhcp-ip>`
5. Run `make bootstrap` if this is the first node, otherwise the node joins automatically
