#!/usr/bin/env bash
# Turns a fresh Ubuntu 22.04/24.04 machine (Oracle Cloud Always Free, or any VPS) into the 24/7 My PA server.
# Run once over SSH:
#   curl -fsSL https://raw.githubusercontent.com/Adeltaha123/Adel-Taha/main/deploy/server/setup.sh | bash
# It installs Node.js and Caddy, runs the API as a service, serves it over HTTPS at <ip>.sslip.io, pulls new
# versions from GitHub every 5 minutes, and backs up the database daily. Running it again is safe.
set -euo pipefail
REPO=https://github.com/Adeltaha123/Adel-Taha.git
APP=/opt/mypa
WEBSITE=https://adeltaha123.github.io
step() { printf '\n==> %s\n' "$1"; }

step 'Installing system packages'
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl ca-certificates gnupg sqlite3 iptables-persistent debian-keyring debian-archive-keyring apt-transport-https >/dev/null
if ! node --version 2>/dev/null | grep -q '^v2[2-9]'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  sudo apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -qq && sudo apt-get install -y -qq caddy >/dev/null
fi
echo "Node $(node --version), $(caddy version | cut -d' ' -f1)"

step 'Getting My PA'
id mypa >/dev/null 2>&1 || sudo useradd --system --create-home --home-dir /var/lib/mypa --shell /usr/sbin/nologin mypa
if [ ! -d "$APP/.git" ]; then sudo git clone -q "$REPO" "$APP"; fi
sudo mkdir -p "$APP/data" "$APP/backups"
sudo chown -R mypa:mypa "$APP"

step 'Server settings'
if [ ! -f "$APP/.env" ]; then
  # Read from the terminal, because this script itself arrives on stdin when piped from curl.
  read -r -s -p 'OpenAI API key for voice and the assistant (Enter to skip): ' OPENAI_KEY < /dev/tty; echo
  read -r -p 'Who people contact to subscribe, e.g. "WhatsApp 01xxxxxxxxx" (Enter to skip): ' CONTACT < /dev/tty
  sudo tee "$APP/.env" >/dev/null <<EOF
API_HOST=127.0.0.1
API_PORT=3001
API_DB=$APP/data/my-pa.sqlite
API_ORIGINS=$WEBSITE,http://localhost:8081,http://127.0.0.1:8081
OPENAI_API_KEY=$OPENAI_KEY
OPENAI_MODEL=gpt-6-luna
OPENAI_TRANSCRIBE_MODEL=gpt-transcribe
SUBSCRIBE_CONTACT=$CONTACT
EOF
  sudo chown mypa:mypa "$APP/.env"; sudo chmod 600 "$APP/.env"
else
  echo "Keeping the existing $APP/.env"
fi

step 'Installing the update, backup and import commands'
sudo tee /usr/local/bin/mypa-update >/dev/null <<'EOF'
#!/usr/bin/env bash
# Pulls main from GitHub and restarts the API when it changed. `mypa-update --force` rebuilds anyway.
set -euo pipefail
cd /opt/mypa
sudo -u mypa git fetch -q origin main
if [ "$(sudo -u mypa git rev-parse HEAD)" = "$(sudo -u mypa git rev-parse origin/main)" ] && [ "${1:-}" != "--force" ]; then exit 0; fi
sudo -u mypa git reset -q --hard origin/main
sudo -u mypa npm ci --no-audit --no-fund --loglevel=error
sudo -u mypa npm run -s api:build
systemctl restart mypa
echo "My PA updated to $(sudo -u mypa git log -1 --format='%h %s')"
EOF
sudo tee /usr/local/bin/mypa-backup >/dev/null <<'EOF'
#!/usr/bin/env bash
# Daily copy of the database; keeps 14 days.
set -euo pipefail
cd /opt/mypa
[ -f data/my-pa.sqlite ] || exit 0
sudo -u mypa sqlite3 data/my-pa.sqlite ".backup 'backups/my-pa-$(date +%F).sqlite'"
find backups -name 'my-pa-*.sqlite' -mtime +14 -delete
EOF
sudo tee /usr/local/bin/mypa-import >/dev/null <<'EOF'
#!/usr/bin/env bash
# Replaces the server's database with a copy from your PC: sudo mypa-import /tmp/my-pa.sqlite
set -euo pipefail
[ -f "${1:-}" ] || { echo 'Usage: sudo mypa-import /path/to/my-pa.sqlite'; exit 1; }
sqlite3 "$1" 'PRAGMA integrity_check;' | grep -qx ok || { echo 'That file is not a healthy SQLite database.'; exit 1; }
systemctl stop mypa
[ -f /opt/mypa/data/my-pa.sqlite ] && cp /opt/mypa/data/my-pa.sqlite "/opt/mypa/backups/before-import-$(date +%F-%H%M).sqlite"
rm -f /opt/mypa/data/my-pa.sqlite-wal /opt/mypa/data/my-pa.sqlite-shm
install -o mypa -g mypa -m 600 "$1" /opt/mypa/data/my-pa.sqlite
systemctl start mypa
echo 'Imported. The previous database was kept in /opt/mypa/backups.'
EOF
sudo chmod 755 /usr/local/bin/mypa-update /usr/local/bin/mypa-backup /usr/local/bin/mypa-import

step 'Building the API'
cd "$APP"
sudo -u mypa npm ci --no-audit --no-fund --loglevel=error
sudo -u mypa npm run -s api:build

step 'Running it as a service'
sudo tee /etc/systemd/system/mypa.service >/dev/null <<EOF
[Unit]
Description=My PA API
After=network-online.target
Wants=network-online.target

[Service]
User=mypa
WorkingDirectory=$APP
ExecStart=/usr/bin/node --env-file-if-exists=.env build-api/server/index.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
for job in update backup; do
  sudo tee "/etc/systemd/system/mypa-$job.service" >/dev/null <<EOF
[Unit]
Description=My PA $job

[Service]
Type=oneshot
ExecStart=/usr/local/bin/mypa-$job
EOF
done
sudo tee /etc/systemd/system/mypa-update.timer >/dev/null <<'EOF'
[Unit]
Description=Check GitHub for a new My PA version every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF
sudo tee /etc/systemd/system/mypa-backup.timer >/dev/null <<'EOF'
[Unit]
Description=Back up the My PA database daily

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable -q --now mypa mypa-update.timer mypa-backup.timer
sudo systemctl restart mypa

step 'Opening the web ports and setting up HTTPS'
# Oracle's Ubuntu images block everything except SSH in iptables; the cloud firewall is opened separately.
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
done
sudo netfilter-persistent save >/dev/null 2>&1 || true
IP=$(curl -4 -fsS https://ifconfig.me)
HOST="${IP//./-}.sslip.io"
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
# sslip.io turns the server's IP into a free hostname, so Caddy can get a real HTTPS certificate without a domain.
$HOST {
  encode gzip
  reverse_proxy 127.0.0.1:3001
}
EOF
sudo systemctl reload caddy || sudo systemctl restart caddy

step 'Checking HTTPS'
# Caddy only gets a valid certificate when Let's Encrypt can reach ports 80/443, so a verified local request
# through Caddy proves the server is reachable from the internet (some clouds don't route a VM to its own public IP).
for _ in $(seq 1 30); do
  if curl -fsS --resolve "$HOST:443:127.0.0.1" "https://$HOST/api/health" >/dev/null 2>&1; then
    printf '\nMy PA server is running 24/7 at:\n\n    https://%s\n\nSend this address to Claude, or run on your PC: npm run server:address -- https://%s\n' "$HOST" "$HOST"
    exit 0
  fi
  sleep 4
done
printf '\nThe API runs, but https://%s does not answer from the internet yet.\n' "$HOST"
echo 'Open ports 80 and 443 in the Oracle console (see docs/SERVER.md, step 3), then run this script again.'
exit 1
