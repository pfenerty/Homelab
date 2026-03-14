# Tailscale + Cilium: Why Services Use Ingress Instead of Annotations

## Summary

The Tailscale Kubernetes operator offers two ways to expose a service on the Tailscale network:

1. **Service annotation** (`tailscale.com/expose: "true"`) — L4 kernel proxy using nftables DNAT
2. **Kubernetes Ingress** (`ingressClassName: tailscale`) — L7 application proxy using `tailscale serve`

On a cluster running Cilium with kube-proxy replacement, the **Service annotation approach silently fails**: connections to the Tailscale proxy time out even though the proxy pod appears healthy. The Ingress approach works correctly.

## Background

This cluster runs Cilium in kube-proxy replacement mode (`kubeProxyReplacement: true`). Cilium takes over all service load-balancing using eBPF programs attached to the TC (traffic control) hook on each network interface. There is no kube-proxy, no iptables service rules — Cilium's eBPF programs are solely responsible for translating ClusterIP destinations to pod IPs.

## How the Service Annotation Works (L4 Proxy)

When a service is annotated with `tailscale.com/expose: "true"`, the Tailscale operator creates a proxy `StatefulSet`. Each proxy pod runs with:

```
TS_DEST_IP=<service ClusterIP>    # e.g. 10.96.45.200
TS_USERSPACE=false                 # kernel networking mode
```

The `tailscale` container installs **nftables rules** in the pod's network namespace:

```
# PREROUTING: DNAT all incoming traffic to the ClusterIP
nftables PREROUTING DNAT → 10.96.45.200:9097

# POSTROUTING: MASQUERADE so replies come back to this pod
nftables POSTROUTING MASQUERADE
```

When a Tailscale client connects, packets arrive at the proxy pod. The nftables PREROUTING chain DNATs them to `10.96.45.200` before they reach any socket, then routes them out to the cluster network.

## Why This Fails with Cilium

### The conntrack collision

When the nftables PREROUTING DNAT fires, the **Linux kernel conntrack** subsystem records the connection translation:

```
conntrack: src=tailscale_ip:port → dst=proxy_pod_ip:port
           becomes src=tailscale_ip:port → dst=10.96.45.200:9097
```

This conntrack entry is created **in the kernel networking stack** (zone 0) before the packet reaches Cilium's TC hook.

### Cilium's self-protection against double-NAT

Cilium's TC hook checks whether a packet already has a conntrack entry before applying service load-balancing. If conntrack already tracks the connection, Cilium skips service DNAT to avoid creating a **double-NAT** situation (applying ClusterIP→pod DNAT on top of an existing DNAT).

As a result, Cilium forwards the packet `to-stack` with `dst=10.96.45.200` still intact, treating it as a plain routed packet destined for that IP — not as a service access.

### What actually happens to the packet

The packet leaves the proxy pod with `dst=10.96.45.200` and is encapsulated in VXLAN and forwarded to the node where the tekton pod actually runs. On that remote node, Cilium's eBPF **does** handle the ClusterIP and successfully delivers the packet to the tekton pod.

The tekton pod receives the connection and sends a reply with `src=pod_IP`.

### Why the reply fails

The reply packet (`src=pod_IP`) travels back to the proxy pod's node. But the proxy pod's nftables conntrack expects replies from `src=10.96.45.200` (the ClusterIP it DNAT'd to). The reply with `src=pod_IP` doesn't match the conntrack entry and is **not de-NAT'd** — it gets dropped or returned to sender with the wrong source.

The connection never completes. The Tailscale client sees a timeout.

### Hubble evidence

This was confirmed via `hubble observe`:

```
# On the proxy node — packet leaves WITHOUT Cilium LB:
proxy-pod → VXLAN: dst=10.96.45.200  [to-stack FORWARDED (world)]

# On the tekton node — Cilium LB kicks in normally:
10.96.45.200 → tekton-pod: [service LB applied, connection established]

# Return path — reply never de-NAT'd on proxy node:
tekton-pod → proxy-pod: src=pod_IP  [conntrack miss, no de-NAT]
```

The `bpf-lb-external-clusterip` Cilium config option was tested but did not resolve this — the fundamental issue is the conntrack state created by nftables before Cilium sees the packet, not the ClusterIP reachability setting.

## The Fix: Kubernetes Ingress (L7 Proxy)

The Ingress approach uses `tailscale serve` — an **application-level HTTP reverse proxy** running inside the proxy pod. It:

1. Accepts HTTPS connections from Tailscale clients at the application layer
2. Makes a **fresh outbound TCP connection** to the ClusterIP using Go's `net.Dial()`
3. Proxies the HTTP request/response between the two connections

Because `tailscale serve` opens a new TCP connection using normal socket APIs, **there is no nftables DNAT and no prior conntrack state**. The packet arrives at Cilium's TC hook clean, and Cilium applies its normal eBPF service load-balancing to resolve `ClusterIP → pod_IP` correctly. The full connection succeeds.

## Configuration

```yaml
# flux/apps/tekton/tailscale-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tekton-dashboard
  namespace: tekton-pipelines
spec:
  ingressClassName: tailscale
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: tekton-dashboard
                port:
                  number: 9097
  tls:
    - hosts:
        - tekton-dashboard
```

The service is accessible at `https://tekton-dashboard.<tailnet-name>.ts.net`.

## General Rule

On any cluster using **Cilium kube-proxy replacement**, use the Kubernetes Ingress method (`ingressClassName: tailscale`) for all Tailscale service exposure. The Service annotation approach (`tailscale.com/expose: "true"`) relies on kernel-level DNAT that conflicts with Cilium's eBPF conntrack management.

| Method | Works with Cilium kube-proxy replacement? |
|--------|------------------------------------------|
| `tailscale.com/expose: "true"` (Service annotation) | No — nftables DNAT conflicts with Cilium eBPF conntrack |
| `ingressClassName: tailscale` (Kubernetes Ingress) | Yes — application-layer proxy, no kernel DNAT |

## Additional Notes

### PodSecurity

The `tailscale-operator` namespace must have `pod-security.kubernetes.io/enforce: privileged`. Proxy pods run with `privileged: true` for the `sysctler` init container (sets IP forwarding sysctls). Without this label, Kubernetes admission control rejects the proxy pods.

See `flux/apps/tailscale/namespace.yaml`.

### `TS_USERSPACE=true` is not a workaround

Setting `TS_USERSPACE=true` via a ProxyClass does not help. The operator always sets `TS_DEST_IP` for Service proxies, and `TS_DEST_IP` is explicitly unsupported in userspace mode — the proxy exits immediately with:

```
invalid configuration: TS_DEST_IP is not supported with TS_USERSPACE
```
