#!/usr/bin/env bash
#
# Intrilex Match Server — VPS Deployment Script
#
# This script deploys the Intrilex match server to a DigitalOcean VPS.
# It is designed to be run FROM the VPS (or via SSH) after the initial
# server setup has been completed.
#
# Usage:
#   ./deploy-to-vps.sh                    # Full deploy (git pull + build + restart)
#   ./deploy-to-vps.sh --restart-only     # Just restart the service
#   ./deploy-to-vps.sh --health           # Just check health
#
# Prerequisites:
#   - Node.js >= 22 installed
#   - pnpm installed (corepack enable pnpm)
#   - Git repo cloned to /opt/intrilex
#   - systemd service installed
#   - Caddy configured
#   - /etc/intrilex/match-server.env configured with real secrets
#
set -euo pipefail

REPO_DIR="/opt/intrilex"
SERVICE_NAME="intrilex-match-server"
HEALTH_URL="https://match.intrilex.cards/health"
HEALTH_URL_LOCAL="http://127.0.0.1:3099/health"

log() { echo "[deploy] $*"; }
fail() { echo "[deploy] ERROR: $*" >&2; exit 1; }

# ── Health check ──
check_health() {
    log "Checking local health endpoint..."
    if curl -sf "$HEALTH_URL_LOCAL" > /dev/null 2>&1; then
        log "Local health: PASS"
        curl -s "$HEALTH_URL_LOCAL" | python3 -m json.tool 2>/dev/null || curl -s "$HEALTH_URL_LOCAL"
        return 0
    else
        log "Local health: FAIL"
        return 1
    fi
}

check_health_public() {
    log "Checking public health endpoint..."
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
        log "Public health: PASS"
        return 0
    else
        log "Public health: FAIL (may be DNS/TLS propagation)"
        return 1
    fi
}

# ── Restart only ──
if [[ "${1:-}" == "--restart-only" ]]; then
    log "Restarting $SERVICE_NAME..."
    sudo systemctl restart "$SERVICE_NAME"
    sleep 3
    check_health || fail "Service did not become healthy"
    log "Restart complete."
    exit 0
fi

# ── Health only ──
if [[ "${1:-}" == "--health" ]]; then
    check_health
    check_health_public || true
    exit 0
fi

# ── Full deploy ──
cd "$REPO_DIR" || fail "Repository not found at $REPO_DIR"

log "Pulling latest code..."
git pull --ff-only

log "Installing dependencies..."
corepack enable pnpm 2>/dev/null || true
pnpm install --frozen-lockfile

log "Building engine patch..."
pnpm run engine-patch:build

log "Generating version files..."
pnpm run version:generate

log "Restarting service..."
sudo systemctl restart "$SERVICE_NAME"

log "Waiting for service to start..."
sleep 3

check_health || fail "Service did not become healthy after restart"
check_health_public || log "Public health not yet available (DNS/TLS may still be propagating)"

log "Deployment complete."
log "  Service:  sudo systemctl status $SERVICE_NAME"
log "  Logs:     sudo journalctl -u $SERVICE_NAME -f"
log "  Health:   curl $HEALTH_URL"
