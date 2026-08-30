# Intrilex Multiplayer Deployment Guide

## Architecture

Intrilex uses a **split deployment architecture** on a DigitalOcean VPS:

```
                     INTERNET
                        │
            ┌───────────┴───────────┐
            │                       │
            ▼                       ▼

https://intrilex.cards        wss://match.intrilex.cards
       │                              │
       ▼                              ▼
   NEOCITIES                     DIGITALOCEAN VPS
   (static frontend)            67.205.161.16
                                      │
                                      ▼
                                 Caddy :443
                              (TLS termination)
                                      │
                                      ▼
                              127.0.0.1:3099
                                      │
                                      ▼
                             Intrilex Match Server
                              (systemd service)
                                      │
                                      ▼
                           Canonical Game Engine
                           (via @intrilex/match-authority)
```

**The browser application and the authoritative multiplayer service are separate deployable components.**

- **Frontend**: Static HTML/JS/CSS hosted on Neocities (`intrilex.cards` → `198.51.233.1`)
- **Backend**: Node.js WebSocket server on a DigitalOcean VPS (`match.intrilex.cards` → `67.205.161.16`)
- **Reverse proxy**: Caddy on the VPS terminates TLS and proxies to the loopback-only match server
- **Process manager**: systemd keeps the match server alive and starts it on boot

The frontend never assumes its static host also runs the match server. The match server URL is injected at build time via the `INTRILEX_MATCH_SERVER_URL` environment variable.

---

## DigitalOcean VPS Details

| Property | Value |
|----------|-------|
| **Public IP** | `67.205.161.16` |
| **OS** | Ubuntu 24.04 (OpenSSH_9.6p1 Ubuntu-3ubuntu13.18) |
| **Reverse proxy** | Caddy (already installed and running on :80/:443) |
| **Public ports** | 22 (SSH), 80 (HTTP→HTTPS redirect), 443 (HTTPS/WSS) |
| **Internal port** | 3099 (match server, loopback only — NOT public) |
| **Service user** | `intrilex` (system user, no shell) |
| **App directory** | `/opt/intrilex` |
| **Config directory** | `/etc/intrilex` |
| **Service name** | `intrilex-match-server` |
| **Environment file** | `/etc/intrilex/match-server.env` (chmod 640, root:intrilex) |

---

## Local Development

### Quick start (frontend + match server together)

```bash
pnpm run dev:network
```

This starts:
- Dev server on `http://127.0.0.1:4173` (frontend)
- Match server on `ws://127.0.0.1:3099` (backend)

The dev server automatically injects `ws://localhost:3099` as the match server URL into the browser config.

### Separate terminals

**Terminal A — match server:**
```bash
pnpm run match-server
```

**Terminal B — frontend dev server:**
```bash
pnpm run dev
```

### Custom port

```bash
PORT=8080 node apps/match-server/src/server.mjs
```

---

## Environment Variables

### Browser-safe (injected into frontend bundle)

These are visible in the browser. NEVER put secrets here.

| Variable | Purpose | Dev Default | Production Value |
|----------|---------|-------------|-------------------|
| `SUPABASE_URL` | Supabase project URL | (from .env) | `https://xczwhiqnvyxubywhpxiv.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key | (from .env) | `sb_publishable_...` |
| `INTRILEX_MATCH_SERVER_URL` | WebSocket match server URL | `ws://localhost:3099` | `wss://match.intrilex.cards` |

### Server-only (NEVER in frontend bundle)

| Variable | Purpose | Production Value |
|----------|---------|-------------------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server listen port | `3099` |
| `HOST` | Server bind address | `127.0.0.1` (loopback only — Caddy proxies public traffic) |
| `SUPABASE_SECRET_KEY` | Supabase service role key | `sb_secret_...` (in `/etc/intrilex/match-server.env`) |
| `INTRILEX_AUTH_MODE` | Auth mode | `required` |
| `INTRILEX_ALLOWED_ORIGINS` | Allowed WebSocket origins | `https://intrilex.cards` |
| `INTRILEX_TRUST_PROXY` | Trust x-forwarded-for from Caddy | `1` |
| `INTRILEX_PUBLIC_MATCHMAKING` | Enable public matchmaking | `1` |
| `INTRILEX_PUBLIC_HISTORY` | Enable public match history | `0` |
| `INTRILEX_LOG` | Structured logging | `1` |

---

## Frontend Production Build (Neocities)

### Build with production match server URL

```bash
# On Windows (PowerShell):
$env:INTRILEX_MATCH_SERVER_URL="wss://match.intrilex.cards"; pnpm run build:neocities

# On Linux/macOS:
INTRILEX_MATCH_SERVER_URL=wss://match.intrilex.cards pnpm run build:neocities
```

This:
1. Builds the frontend (`pnpm run build`)
2. Injects `wss://match.intrilex.cards` into `__intrilex-config.js`
3. Adds `wss://match.intrilex.cards` to the CSP `connect-src` directive
4. Syncs the build to `neocities-deploy/`

### Upload to Neocities

```bash
pnpm run upload:neocities
```

Requires environment-only credentials:
- Preferred: `NEOCITIES_API_KEY`
- Compatibility: both `NEOCITIES_USERNAME` and `NEOCITIES_PASSWORD`

Never place credentials in repository files or command-line arguments. Rotate
the credential immediately if it has ever been committed or printed in logs.

Use `--dry-run` first to verify the file list:
```bash
node scripts/upload-neocities.mjs --dry-run
```

### What gets uploaded

Only static files from `neocities-deploy/`:
- `index.html`, `app.[hash].js`, `styles.[hash].css`
- Engine modules, data files, assets
- `__intrilex-config.js` (browser-safe config only — no secrets)

**Never uploaded**: `node_modules/`, `.env`, `match-server/`, server secrets.

### If `INTRILEX_MATCH_SERVER_URL` is not set

The frontend build will NOT include a match server URL. The Online Direct Duel lobby will show:

> **Online Duel Unavailable**
> The Intrilex match server is not configured for this deployment. Local play and other modes remain fully available.

This is intentional — production must fail visibly rather than silently fall back to localhost.

---

## Match Server Deployment (DigitalOcean VPS)

### Initial VPS setup (one-time)

The `deploy/setup-vps.sh` script automates the one-time setup:

```bash
# SSH into the VPS
ssh root@67.205.161.16

# Clone or copy the repo to /opt/intrilex, then run:
cd /opt/intrilex
sudo bash deploy/setup-vps.sh
```

This script:
1. Creates the `intrilex` service user (system user, no shell)
2. Creates `/opt/intrilex` and `/etc/intrilex` directories
3. Installs Node.js 22 if not present
4. Installs pnpm via corepack
5. Installs dependencies and builds the engine patch
6. Installs the systemd service unit
7. Installs the Caddy reverse proxy config
8. Installs the production environment file template
9. Configures UFW firewall (22, 80, 443 only — 3099 NOT exposed)
10. Enables the service to start on boot

### Post-setup: set the real Supabase secret

```bash
sudo nano /etc/intrilex/match-server.env
# Replace: SUPABASE_SECRET_KEY=REPLACE_WITH_ACTUAL_SUPABASE_SECRET_KEY
# With:   SUPABASE_SECRET_KEY=sb_secret_...  (your actual key)
sudo systemctl restart intrilex-match-server
```

### Subsequent deployments (updates)

```bash
cd /opt/intrilex
bash deploy/deploy-to-vps.sh
```

This script:
1. `git pull --ff-only`
2. `pnpm install --frozen-lockfile`
3. `pnpm run engine-patch:build`
4. `pnpm run version:generate`
5. `sudo systemctl restart intrilex-match-server`
6. Checks health endpoint

### Manual deployment (without the script)

```bash
cd /opt/intrilex
git pull --ff-only
pnpm install --frozen-lockfile
pnpm run engine-patch:build
pnpm run version:generate
sudo systemctl restart intrilex-match-server
curl -sf http://127.0.0.1:3099/health
```

---

## Reverse Proxy (Caddy)

Caddy is already installed on the VPS and serving on ports 80/443. The site configuration is in `deploy/Caddyfile.match.intrilex`:

```caddy
match.intrilex.cards {
    reverse_proxy 127.0.0.1:3099 {
        health_uri /health
        health_timeout 5s
    }
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }
    log {
        output file /var/log/caddy/match.intrilex.cards.log {
            roll_size 100mb
            roll_keep 5
        }
    }
}
```

Caddy automatically:
- Obtains TLS certificates from Let's Encrypt
- Renews certificates before expiry
- Proxies WebSocket upgrade traffic (no special headers needed)
- Redirects HTTP → HTTPS

### Reload Caddy after config changes

```bash
sudo caddy reload --config /etc/caddy/Caddyfile
# or:
sudo systemctl reload caddy
```

---

## DNS Configuration

Create an A record pointing `match.intrilex.cards` to the VPS:

```
Type:  A
Host:  match
Value: 67.205.161.16
TTL:   Auto/default
```

This must be done at the DNS provider managing `intrilex.cards` (likely the domain registrar or a DNS service).

**Current state**: `match.intrilex.cards` does NOT resolve yet. `intrilex.cards` and `www.intrilex.cards` point to Neocities (`198.51.233.1`).

Once the A record is added, Caddy will automatically obtain a TLS certificate for `match.intrilex.cards` within minutes.

### Verify DNS

```bash
dig match.intrilex.cards +short
# Should return: 67.205.161.16

nslookup match.intrilex.cards
# Should resolve to 67.205.161.16
```

---

## TLS

TLS is handled automatically by Caddy. No manual certificate management is needed.

- Caddy obtains certificates from Let's Encrypt via the HTTP-01 challenge
- Certificates are renewed automatically before expiry
- The match server itself runs plain `ws://` on loopback — TLS is terminated by Caddy

**Never expose the raw `ws://` port (3099) directly to the internet.** The firewall blocks external access to 3099.

### Verify TLS

```bash
curl -sI https://match.intrilex.cards/health
# Should return: HTTP/2 200 with valid TLS certificate
```

---

## Firewall

UFW is configured to allow only:

| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | SSH |
| 80 | TCP | HTTP (redirects to HTTPS) |
| 443 | TCP | HTTPS / WSS |

**Port 3099 is NOT exposed.** The match server binds to `127.0.0.1:3099` and Caddy proxies public traffic to it locally.

### Verify firewall

```bash
sudo ufw status
# Expected: 22/tcp, 80/tcp, 443/tcp ALLOW
```

---

## Health Verification

### Check if the server is running (from the VPS)

```bash
curl http://127.0.0.1:3099/health
```

### Check from the public internet

```bash
curl https://match.intrilex.cards/health
```

Expected response:
```json
{
  "server": "Intrilex Match Authority",
  "version": "0.27.0",
  "protocolVersion": 2,
  "uptime": 12345,
  "activeMatches": 0,
  "activeConnections": 0,
  ...
}
```

### Check from the browser

1. Open `https://intrilex.cards/#/play/online`
2. The lobby should show "Online" status
3. The authority server URL should display `wss://match.intrilex.cards`

---

## Operations Cheat Sheet

```bash
# ── Service status ──
sudo systemctl status intrilex-match-server

# ── Start the service ──
sudo systemctl start intrilex-match-server

# ── Stop the service ──
sudo systemctl stop intrilex-match-server

# ── Restart the service ──
sudo systemctl restart intrilex-match-server

# ── View logs (live) ──
sudo journalctl -u intrilex-match-server -f

# ── View recent logs ──
sudo journalctl -u intrilex-match-server --since "1 hour ago"

# ── Health check (local) ──
curl http://127.0.0.1:3099/health

# ── Health check (public) ──
curl https://match.intrilex.cards/health

# ── Deploy an update ──
cd /opt/intrilex && bash deploy/deploy-to-vps.sh

# ── Reload Caddy after config change ──
sudo caddy reload --config /etc/caddy/Caddyfile

# ── View Caddy logs ──
sudo journalctl -u caddy -f

# ── Edit production environment ──
sudo nano /etc/intrilex/match-server.env
sudo systemctl restart intrilex-match-server

# ── Check firewall ──
sudo ufw status
```

---

## Ranked Season Provisioning

Ranked admission in `classifyMatch()` fails **closed** when no `ACTIVE` season
row exists in `ranked_seasons` for the `ranked` queue — the player sees a
rejection with no obvious cause. Before opening ranked play, an operator must
provision and activate a season. The `ranked_seasons_one_active` unique index
permits exactly one `ACTIVE` season per queue.

The `scripts/provision-season.mjs` CLI manages the season lifecycle using the
Supabase service-role key (set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in the
environment, e.g. source `deploy/match-server.env`).

```bash
# ── List all seasons ──
node scripts/provision-season.mjs list

# ── Show the currently-active ranked season (or "none") ──
node scripts/provision-season.mjs current

# ── Provision Season 1 and activate it immediately ──
node scripts/provision-season.mjs provision --ordinal 1 --activate --rules-version 4.3.1

# ── Provision a future season (UPCOMING, 90-day default duration) ──
node scripts/provision-season.mjs provision --ordinal 2 --name "Season 2" --starts-at 2026-04-01T00:00:00Z

# ── Activate an existing season (archives any currently-active season first) ──
node scripts/provision-season.mjs activate --season-id season-2

# ── Finalize (archive) a season and activate the next one ──
node scripts/provision-season.mjs finalize --season-id season-1 --activate-next season-2

# ── Atomic rollover: finalize active + activate next upcoming ──
# Automatically finds the ACTIVE season, archives it, and activates the
# lowest-ordinal UPCOMING season. Use --auto-provision to create the next
# season if none exists yet.
node scripts/provision-season.mjs rollover
node scripts/provision-season.mjs rollover --auto-provision --duration-days 90
```

### Season 0 launch checklist

1. Apply migrations `0001`–`0019` to the Supabase project.
2. Set `INTRILEX_AUTH_MODE=required`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` on
   the match server (production mode fails closed without a durable persistor
   and `RatingService`).
3. Run `provision --ordinal 1 --activate --rules-version 4.3.1`.
4. Verify with `current` — it must print an `ACTIVE` season.
5. Confirm `classifyMatch` ranked admission: a queued match should classify as
   `matchMode: 'ranked'`, not be downgraded to casual.

### Rollover runbook

Season transitions use the canonical Glicko-2 **soft reset** (increase RD via
`SEASON_SOFT_RESET_RD_MULTIPLIER`) — never a destructive hard reset. To roll
over:

1. `provision --ordinal N+1` the next season (UPCOMING).
2. `rollover` — atomically archives the active season and activates the next
   UPCOMING season. Use `--auto-provision` to create the next season if none
   exists yet: `rollover --auto-provision --duration-days 90`.
3. Alternatively, `finalize --season-id season-N --activate-next season-(N+1)`
   archives the old season and activates the new one in one step.
4. The `SeasonService.finalizeSeason()` path (server-side) snapshots standings
   and processes pending matches before archiving; the CLI is the operator
   escape hatch for direct DB control.

---

## Ranked Admission Reason Codes

`classifyMatch()` in `apps/match-server/src/server.mjs` is the server-owned
gate for ranked admission. It fails **closed** — an unadmitted match is
downgraded to `private` or rejected entirely. The following reason codes are
returned in the `reason` field of the classification result:

| Reason Code | Trigger | Effect |
|---|---|---|
| `RANKED_REQUIRES_AUTH` | Auth mode is not `REQUIRED` (dev mode) | Match downgraded to private |
| `RANKED_REQUIRES_DURABLE_PERSISTENCE` | No persistor or `FakeMatchResultPersistor` in production | Match downgraded to private |
| `RANKED_REQUIRES_RATING_SERVICE` | `RatingService` not configured | Match downgraded to private |
| `RANKED_REQUIRES_SEASON_AUTHORITY` | No season persistor/authority available | Match downgraded to private |
| `UNKNOWN_QUEUE` | `queueId` is not `ranked`, `casual`, or `private` | Match rejected |
| `RANKED_REQUIRES_TWO_PLAYERS` | `validateRankedParticipants`: not exactly 2 participants | Match rejected |
| `RANKED_REQUIRES_AUTHENTICATED_PLAYERS` | A participant has no `accountId` | Match rejected |
| `RANKED_REQUIRES_DISTINCT_ACCOUNTS` | Both participants share the same account | Match rejected |

When ranked admission fails, the match is classified as `private` (for the
first five codes) or rejected (for the last three, which are checked at
`validateRankedParticipants` after match creation). The client sees a
human-readable rejection message; the server logs the reason code.

**Operator checklist for ranked readiness:**
1. `INTRILEX_AUTH_MODE=required` (not `optional`)
2. `SUPABASE_URL` + `SUPABASE_SECRET_KEY` set (durable persistor + identity verifier)
3. `RatingService` configured (requires the above)
4. An `ACTIVE` season exists in `ranked_seasons` (see Season Provisioning above)

---

## Troubleshooting

### Browser says "WebSocket connection failed"

Check:
1. **Backend running**: `curl https://match.intrilex.cards/health` returns 200
2. **URL correct**: `INTRILEX_MATCH_SERVER_URL` was set during frontend build
3. **TLS valid**: Certificate is valid for `match.intrilex.cards`
4. **DNS correct**: `match.intrilex.cards` resolves to `67.205.161.16`
5. **Origin allowed**: `INTRILEX_ALLOWED_ORIGINS` includes `https://intrilex.cards`
6. **Caddy running**: `sudo systemctl status caddy`
7. **Service running**: `sudo systemctl status intrilex-match-server`

### Works locally but not in production

Check:
1. **Production env var**: `INTRILEX_MATCH_SERVER_URL=wss://match.intrilex.cards` was set during `pnpm run build:neocities`
2. **WSS vs WS**: Production uses `wss://` (not `ws://`)
3. **Mixed content**: HTTPS page cannot connect to `ws://` — must use `wss://`
4. **CSP**: The build pipeline automatically adds the WSS URL to CSP `connect-src`
5. **Caddy config**: `match.intrilex.cards` block exists in `/etc/caddy/Caddyfile`
6. **DNS propagation**: `dig match.intrilex.cards +short` returns `67.205.161.16`

### Server immediately exits

Check:
1. **Start command**: `node apps/match-server/src/server.mjs`
2. **Build output**: Engine patch built (`pnpm run engine-patch:build`)
3. **Environment**: `NODE_ENV`, `PORT`, `SUPABASE_*` set correctly in `/etc/intrilex/match-server.env`
4. **Node version**: Must be >= 22 (uses `node:sqlite`)
5. **Logs**: `sudo journalctl -u intrilex-match-server --since "5 min ago"`

### Connection receives 403/rejection

Check `INTRILEX_ALLOWED_ORIGINS` in `/etc/intrilex/match-server.env` — it must include the exact origin of your frontend (e.g., `https://intrilex.cards`).

### Lobby shows "Online Duel Unavailable"

This means `INTRILEX_MATCH_SERVER_URL` was not set during the frontend build. Rebuild with:
```bash
$env:INTRILEX_MATCH_SERVER_URL="wss://match.intrilex.cards"; pnpm run build:neocities
```

### Caddy certificate fails to obtain

Check:
1. **DNS resolves**: `dig match.intrilex.cards +short` must return `67.205.161.16`
2. **Port 80 open**: Caddy needs port 80 for the HTTP-01 challenge
3. **Caddy logs**: `sudo journalctl -u caddy --since "10 min ago"`

---

## Server State Model

### In-memory matches

Active matches live in the server process memory (with SQLite persistence for match metadata). If the server restarts:

- **Active matches are lost** (the authoritative game engine state is in-memory)
- **Match metadata survives** (SQLite store persists match IDs, participants, and snapshots)
- **Players can reconnect** within the 30-minute TTL if the server comes back up

### Scaling

The current architecture assumes a **single match-server instance**. Running multiple independent replicas will break matchmaking and session affinity because match state is process-local.

Future scaling options (not currently implemented):
- Redis for shared session state
- Pub/sub for multi-instance coordination
- Sticky routing via load balancer

Do not deploy multiple replicas without implementing shared state.

---

## Security

### Origin validation

`INTRILEX_ALLOWED_ORIGINS=https://intrilex.cards` restricts WebSocket connections to only the production frontend. The server logs a warning at startup if this is not set in production.

### Secrets

- `SUPABASE_SECRET_KEY` is server-only — stored in `/etc/intrilex/match-server.env` (chmod 640)
- `SUPABASE_PUBLISHABLE_KEY` is browser-safe — injected via `__intrilex-config.js`
- `.env` is gitignored and never committed
- The Dockerfile does not bake secrets into the image — provide them via env vars at runtime
- The production env file is NOT in the repository — it lives only on the VPS

### CSP (Content Security Policy)

The frontend CSP `connect-src` directive is automatically updated at build time to include `wss://match.intrilex.cards`. This prevents mixed-content blocking without loosening the policy.

### Authority model

The browser is never authoritative for game state. The match server:
- Owns the engine, RNG, and command vault
- Validates all actions server-side
- Broadcasts only authorized views (no seed, RNG, opponent hand, or raw commands)
- Uses `@intrilex/match-authority` for server-neutral authority
- Uses `@intrilex/engine-adapter` for canonical game rules (shared with the simulation engine)

### Proxy IP handling

`INTRILEX_TRUST_PROXY=1` is set so the server trusts `X-Forwarded-For` headers from Caddy. This ensures rate limiting and IP-based security use the real client IP, not the proxy's loopback address. This is safe because Caddy is the only reverse proxy and it runs on the same host.

---

## Protocol Versioning

The wire protocol uses version 2 (defined in `packages/network-protocol/src/validation.mjs`). Every message envelope includes `protocolVersion: 2`. The server rejects mismatched versions with `PROTOCOL_VERSION_UNSUPPORTED`.

The health endpoint reports the protocol version, allowing deployment verification:

```bash
curl https://match.intrilex.cards/health | jq .protocolVersion
# → 2
```

---

## Graceful Shutdown

The match server handles `SIGTERM` and `SIGINT` (sent by systemd on stop/restart):
1. Stops accepting new connections
2. Terminates all active WebSocket connections
3. Drains the terminal outbox (flushes pending match results)
4. Closes the SQLite store
5. Exits cleanly

systemd waits up to 15 seconds (`TimeoutStopSec=15`) for graceful shutdown before sending SIGKILL.

---

## Rollback Plan

### Roll back the match server

```bash
cd /opt/intrilex
git log --oneline -5                    # Find the previous good commit
git checkout <previous-commit-hash>
pnpm install --frozen-lockfile
pnpm run engine-patch:build
pnpm run version:generate
sudo systemctl restart intrilex-match-server
curl http://127.0.0.1:3099/health       # Verify
```

### Roll back Caddy config

```bash
# Caddy config backups are in /etc/caddy/
sudo cp /etc/caddy/Caddyfile.bak /etc/caddy/Caddyfile
sudo caddy reload --config /etc/caddy/Caddyfile
```

### Roll back the frontend

Rebuild and re-upload to Neocities with the previous frontend code:
```bash
git checkout <previous-commit-hash>
$env:INTRILEX_MATCH_SERVER_URL="wss://match.intrilex.cards"; pnpm run build:neocities
pnpm run upload:neocities
```

---

## Deployment Files

All deployment configuration files are in the `deploy/` directory:

| File | Purpose |
|------|---------|
| `deploy/setup-vps.sh` | One-time VPS bootstrap script |
| `deploy/deploy-to-vps.sh` | Repeatable deployment/update script |
| `deploy/intrilex-match-server.service` | systemd unit file |
| `deploy/Caddyfile.match.intrilex` | Caddy reverse proxy config |
| `deploy/match-server.env` | Production environment template (no real secrets) |
| `Dockerfile` | Alternative Docker deployment (at repo root) |
| `.dockerignore` | Docker build exclusptions |
