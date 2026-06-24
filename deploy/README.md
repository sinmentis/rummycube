# Deploying rummycube on the shunlyu.com VM

The game runs as a rootless Podman container behind the existing Cloudflare
Tunnel, following the same pattern as the other sites on this VM.

## 1. Build the image

```bash
podman build -t shunlyu-rummycube:latest ~/work/rummycube
```

## 2. Install and start the service (Quadlet)

The container persists matches and `/api/stats` counts to FlatFile under
`/app/data`, backed by a rootless named volume so a restart/redeploy no longer
wipes in-progress games. Create the volume once before first start:

```bash
podman volume create rummycube-data

cp deploy/shunlyu-rummycube.container ~/.config/containers/systemd/
systemctl --user daemon-reload
systemctl --user start shunlyu-rummycube.service
# verify: curl -s http://127.0.0.1:8093/games  -> ["RummyCube"]
```

The unit publishes the container (port 9119) on `127.0.0.1:8093`, injects the
public origin env, sets `FLATFILE_DIR=/app/data` with the `rummycube-data`
volume mounted there, and caps resources (`MemoryMax=512M`, `CPUQuota=100%`).

> Needs a real deploy to verify: the named volume mount, persistence across a
> container restart, and reconnect-across-restart can only be confirmed on the
> VM. After restarting, `podman volume inspect rummycube-data` should show the
> mountpoint populated with `*:metadata`, `*:initial`, and `*:log` files.

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
# lobby REST create/join through the edge
./scripts/smoke-rest.sh https://game.shunlyu.com

# headless browser checks. On this VM, point CHROMIUM_PATH at the cached
# Playwright chromium (the repo's own browser binary is not installed separately):
export CHROMIUM_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux/chrome
node scripts/smoke-frontend.mjs      # SPA loads through the edge, no console errors
node scripts/smoke-multiplayer.mjs   # two clients connect over WSS and receive state
```
