# flux/

Flux CD GitOps manifests for the cluster. Flux reconciles this directory from the `main` branch continuously.

## Structure

```
flux/
├── flux-system/              # Flux bootstrap components (managed by flux bootstrap)
│   ├── gotk-components.yaml  # Flux controllers
│   ├── gotk-sync.yaml        # GitRepository + root Kustomization
│   └── kustomization.yaml
├── kustomization.yaml        # Root: references cilium + apps kustomizations
├── cilium.kustomization.yaml # Flux Kustomization for Cilium (early bootstrap)
├── apps.kustomization.yaml   # Flux Kustomization for all apps
├── cilium/                   # Cilium CNI HelmRelease
│   ├── helmrepository.yaml
│   ├── helmrelease.yaml
│   └── kustomization.yaml
└── apps/
    ├── kustomization.yaml    # References all app subdirectories
    ├── metrics-server/
    ├── tailscale/            # Tailscale operator
    └── tekton/               # Tekton Pipelines + Dashboard
```

## Reconciliation Order

Cilium is bootstrapped in its own `Kustomization` (`cilium.kustomization.yaml`) separate from `apps.kustomization.yaml`. This ensures the CNI is ready before workloads are scheduled.

```
flux-system  ──► cilium  ──► (CNI ready)
                                  │
                                  ▼
             apps ──► metrics-server
                  ──► tailscale
                  ──► tekton
```

## Apps

### Cilium (`cilium/`)
CNI with full kube-proxy replacement, WireGuard node-to-node encryption, VXLAN cross-node routing, and Hubble observability. Installed before any workloads.

### Tailscale (`apps/tailscale/`)
Tailscale Kubernetes operator for exposing in-cluster services on the Tailscale network. OAuth credentials are SOPS-encrypted in `credentials.secret.yaml`.

The `namespace.yaml` sets `pod-security.kubernetes.io/enforce: privileged` on the `tailscale-operator` namespace. This is required because proxy pods use privileged containers for nftables/WireGuard setup.

See [`../docs/tailscale-cilium.md`](../docs/tailscale-cilium.md) for why services are exposed via Kubernetes `Ingress` rather than the simpler `tailscale.com/expose: "true"` Service annotation.

### Tekton (`apps/tekton/`)
Tekton Pipelines, Triggers, and Dashboard. The dashboard is exposed on the Tailscale network via a Kubernetes `Ingress` with `ingressClassName: tailscale` (`tailscale-ingress.yaml`).

### Metrics Server (`apps/metrics-server/`)
Standard metrics-server for `kubectl top` and HPA support.

## Secrets

Secrets encrypted with SOPS are decrypted by Flux automatically. The SOPS age private key must be present in the cluster as a Kubernetes secret:

```bash
kubectl create secret generic sops-age \
  --namespace=flux-system \
  --from-file=age.agekey=age.key
```

The `apps` Flux Kustomization references this via `spec.decryption.provider: sops`.

## Making Changes

Push to `main` — Flux reconciles every 10 minutes, or force it immediately:

```bash
flux reconcile kustomization apps --with-source
flux reconcile kustomization cilium --with-source
```

To temporarily prevent Flux from overwriting a manual change:

```bash
flux suspend kustomization apps
# ... make manual changes ...
flux resume kustomization apps
```
