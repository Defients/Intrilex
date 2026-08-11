#!/usr/bin/env bash
#
# Intrilex Match Server — VPS Initial Setup Script
#
# This script performs the ONE-TIME setup of the VPS for hosting the
# Intrilex match server. Run this ONCE on a fresh Ubuntu/Debian VPS.
#
# Usage (as root or with sudo):
#   sudo bash setup-vps.sh
#
# What this does:
#   1. Creates the 'intrilex' service user
#   2. Creates /opt/intrilex directory structure
#   3. Clones the repository (or copies from local)
#   4. Installs Node.js 22 if not present
#   5. Installs pnpm via corepack
#   6. Builds the engine patch and version files
#   7. Installs the systemd service
#   8. Installs the Caddy reverse proxy config
#   9. Installs the production environment file
#  10. Configures the firewall (ufw)
#  11. Enables the service to start on boot
#
# What this does NOT do:
#   - DNS configuration (must be done at the registrar/DigitalOcean dashboard)
#   - TLS certificate acquisition (Caddy does this automatically once DNS resolves)
#   - Frontend deployment to Neocities (done from the development machine)
#
set -euo pipefail

log() { echo "[setup] $*"; }
fail() { echo "[setup] ERROR: $*" >&2; exit 1; }

# Must be root or sudo
if [[ $EUID -ne 0 ]]; then
    fail "This script must be run as root or with sudo"
fi

# ── Configuration ──
SERVICE_USER="intrilex"
REPO_DIR="/opt/intrilex"
ENV_DIR="/etc/intrilex"
SERVICE_NAME="intrilex-match-server"
GIT_REPO="${GIT_REPO:-}"  # Set this env var if cloning from git

# ── 1. Create service user ──
if ! id "$SERVICE_USER" &>/dev/null; then
    log "Creating service user: $SERVICE_USER"
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
else
    log "Service user $SERVICE_USER already exists"
fi

# ── 2. Create directories ──
log "Creating directory structure..."
mkdir -p "$REPO_DIR"
mkdir -p "$REPO_DIR/runtime"
mkdir -p "$ENV_DIR"

# ── 3. Get the code ──
if [[ -n "$GIT_REPO" ]]; then
    log "Cloning repository from $GIT_REPO..."
    if [[ -d "$REPO_DIR/.git" ]]; then
        cd "$REPO_DIR"
        git pull --ff-only
    else
        git clone "$GIT_REPO" "$REPO_DIR"
    fi
elif [[ -d "$REPO_DIR/apps/match-server" ]]; then
    log "Repository already present at $REPO_DIR"
else
    fail "No repository found at $REPO_DIR and GIT_REPO not set.
        Either:
          1. Set GIT_REPO=https://github.com/... and re-run, or
          2. Copy the repository to $REPO_DIR manually, or
          3. Run this script from within the repo and pass --local"
fi

# ── 4. Install Node.js 22 ──
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]]; then
    log "Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
else
    log "Node.js $(node -v) already installed"
fi

# ── 5. Install pnpm ──
log "Enabling pnpm via corepack..."
corepack enable
corepack prepare pnpm@10.11.0 --activate 2>/dev/null || npm install -g pnpm@10.11.0

# ── 6. Install dependencies and build ──
cd "$REPO_DIR"
log "Installing dependencies..."
pnpm install --frozen-lockfile

log "Building engine patch..."
pnpm run engine-patch:build

log "Generating version files..."
pnpm run version:generate

# ── 7. Set ownership ──
log "Setting ownership..."
chown -R "$SERVICE_USER:$SERVICE_USER" "$REPO_DIR"

# ── 8. Install systemd service ──
log "Installing systemd service..."
if [[ -f "deploy/intrilex-match-server.service" ]]; then
    cp "deploy/intrilex-match-server.service" "/etc/systemd/system/"
else
    log "WARNING: systemd unit not found in deploy/ — create it manually"
fi
systemctl daemon-reload

# ── 9. Install environment file ──
log "Installing environment file..."
if [[ -f "deploy/match-server.env" ]]; then
    cp "deploy/match-server.env" "$ENV_DIR/match-server.env"
    chmod 640 "$ENV_DIR/match-server.env"
    chown root:"$SERVICE_USER" "$ENV_DIR/match-server.env"
    log "Environment file installed at $ENV_DIR/match-server.env"
    log "IMPORTANT: Edit this file to set the real SUPABASE_SECRET_KEY"
else
    log "WARNING: env template not found in deploy/ — create $ENV_DIR/match-server.env manually"
fi

# ── 10. Install Caddy config ──
if command -v caddy &>/dev/null; then
    log "Caddy is installed — installing site config..."
    if [[ -f "deploy/Caddyfile.match.intrilex" ]]; then
        # Append to existing Caddyfile or create new one
        CADDYFILE="/etc/caddy/Caddyfile"
        if ! grep -q "match.intrilex.cards" "$CADDYFILE" 2>/dev/null; then
            cat "deploy/Caddyfile.match.intrilex" >> "$CADDYFILE"
            log "Added match.intrilex.cards to Caddyfile"
        else
            log "match.intrilex.cards already in Caddyfile"
        fi
        caddy reload --config "$CADDYFILE" 2>/dev/null || systemctl reload caddy
    fi
else
    log "Caddy not installed — installing..."
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy
    if [[ -f "deploy/Caddyfile.match.intrilex" ]]; then
        cat "deploy/Caddyfile.match.intrilex" >> /etc/caddy/Caddyfile
        systemctl reload caddy || systemctl restart caddy
    fi
fi

# ── 11. Configure firewall ──
if command -v ufw &>/dev/null; then
    log "Configuring UFW firewall..."
    ufw allow 22/tcp comment 'SSH'
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS/WSS'
    # Do NOT expose port 3099 — it's loopback only behind Caddy
    ufw --force enable
    log "Firewall configured: 22, 80, 443 open; 3099 NOT exposed"
else
    log "UFW not installed — configure firewall manually (allow 22, 80, 443 only)"
fi

# ── 12. Enable and start the service ──
log "Enabling service to start on boot..."
systemctl enable "$SERVICE_NAME"

log "Starting service..."
systemctl start "$SERVICE_NAME" || true
sleep 3

if systemctl is-active --quiet "$SERVICE_NAME"; then
    log "Service is running"
else
    log "WARNING: Service did not start — check: journalctl -u $SERVICE_NAME"
fi

# ── Done ──
log ""
log "══════════════════════════════════════════════════════════════"
log "  VPS SETUP COMPLETE"
log "══════════════════════════════════════════════════════════════"
log ""
log "  Remaining steps:"
log "    1. Edit $ENV_DIR/match-server.env — set real SUPABASE_SECRET_KEY"
log "    2. Add DNS A record: match.intrilex.cards → $(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_VPS_IP')"
log "    3. Wait for DNS propagation"
log "    4. Caddy will auto-obtain TLS certificate once DNS resolves"
log "    5. Verify: curl https://match.intrilex.cards/health"
log "    6. Restart service after editing env: sudo systemctl restart $SERVICE_NAME"
log ""
log "  Service commands:"
log "    sudo systemctl status $SERVICE_NAME"
log "    sudo systemctl restart $SERVICE_NAME"
log "    sudo journalctl -u $SERVICE_NAME -f"
log ""
