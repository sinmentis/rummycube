# Deploying rummycube on the shunlyu.com VM

The game runs as a rootless Podman container behind the existing Cloudflare
Tunnel, following the same pattern as the other sites on this VM.

## 1. Build the image

```bash
podman build -t shunlyu-rummycube:latest ~/work/rummycube
```

## 2. Install and start the service (Quadlet)

```bash
cp deploy/shunlyu-rummycube.container ~/.config/containers/systemd/
systemctl --user daemon-reload
systemctl --user start shunlyu-rummycube.service
# verify: curl -s http://127.0.0.1:8093/games  -> ["RummyCube"]
```

The unit publishes the container (port 9119) on `127.0.0.1:8093`, injects the
public origin env, and caps resources (`MemoryMax=512M`, `CPUQuota=100%`).

## 3. Wire up Cloudflare

Add the ingress rule from `cloudflared-ingress-snippet.yml` to
`~/.cloudflared/config.yml` (above the `http_status:404` catch-all), create the
proxied DNS CNAME `game.shunlyu.com -> <TUNNEL_ID>.cfargotunnel.com`, then:

```bash
cloudflared tunnel ingress validate
systemctl --user restart cloudflared
# verify: curl -s https://game.shunlyu.com/games  -> ["RummyCube"]
```

## 4. Redeploy after code changes

```bash
podman build -t shunlyu-rummycube:latest ~/work/rummycube \
  && systemctl --user restart shunlyu-rummycube.service
```

## Smoke tests

```bash
./scripts/smoke-rest.sh https://game.shunlyu.com   # lobby REST create/join
node scripts/smoke-frontend.mjs                    # headless SPA load check
```
