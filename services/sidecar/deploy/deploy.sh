#!/usr/bin/env bash
# Deploy the sidecar to the shared VM. Usage: services/sidecar/deploy/deploy.sh
# Idempotent. Never edits the existing VPN site in the Caddyfile; it appends one
# import line the first time and keeps a timestamped backup.
set -euo pipefail
HOST=${HOST:-freevm}
HERE="$(cd "$(dirname "$0")/.." && pwd)"

rsync -az --delete --exclude .venv --exclude __pycache__ --exclude .env "$HERE/" "$HOST:/tmp/nk-sidecar/"

ssh "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
# Fonts for rendering synthetic scans (the VM has none by default).
dpkg -s fonts-dejavu-core fonts-liberation2 >/dev/null 2>&1 || { sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fonts-dejavu-core fonts-liberation2 >/dev/null 2>&1 || true; }
id nidhikavach >/dev/null 2>&1 || sudo useradd --system --home /opt/nidhikavach --shell /usr/sbin/nologin nidhikavach
sudo mkdir -p /opt/nidhikavach/sidecar /var/lib/nidhikavach/files /etc/nidhikavach
sudo rsync -a --delete --exclude .venv /tmp/nk-sidecar/ /opt/nidhikavach/sidecar/
sudo chown -R nidhikavach:nidhikavach /opt/nidhikavach /var/lib/nidhikavach
if [ ! -x /opt/nidhikavach/sidecar/.venv/bin/uvicorn ] || [ /opt/nidhikavach/sidecar/requirements.txt -nt /opt/nidhikavach/sidecar/.venv/.stamp ]; then
  sudo -u nidhikavach python3 -m venv /opt/nidhikavach/sidecar/.venv
  sudo -u nidhikavach /opt/nidhikavach/sidecar/.venv/bin/pip install -q --upgrade pip
  sudo -u nidhikavach /opt/nidhikavach/sidecar/.venv/bin/pip install -q -r /opt/nidhikavach/sidecar/requirements.txt
  sudo -u nidhikavach touch /opt/nidhikavach/sidecar/.venv/.stamp
fi
if [ ! -f /etc/nidhikavach/sidecar.env ]; then
  printf 'SIDECAR_API_KEY=%s\nSIDECAR_URL_SIGNING_KEY=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" | sudo tee /etc/nidhikavach/sidecar.env >/dev/null
  sudo chmod 600 /etc/nidhikavach/sidecar.env
fi
sudo cp /opt/nidhikavach/sidecar/deploy/nidhikavach-sidecar.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nidhikavach-sidecar >/dev/null 2>&1
sudo systemctl restart nidhikavach-sidecar

sudo cp /opt/nidhikavach/sidecar/deploy/Caddyfile.nidhikavach /etc/caddy/nidhikavach.caddy
if ! sudo grep -q '^import /etc/caddy/nidhikavach.caddy' /etc/caddy/Caddyfile; then
  sudo cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%s)"
  printf '\nimport /etc/caddy/nidhikavach.caddy\n' | sudo tee -a /etc/caddy/Caddyfile >/dev/null
fi
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 && sudo systemctl reload caddy
sleep 2
curl -fsS http://127.0.0.1:8300/health
REMOTE
