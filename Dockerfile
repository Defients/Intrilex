# ─────────────────────────────────────────────────────────────────
# Intrilex Match Authority Server — Production Dockerfile
#
# Builds a minimal container image for the WebSocket match server.
# The frontend (Neocities static site) is deployed separately.
#
# Build:   docker build -t intrilex-match-server .
# Run:     docker run -p 3099:3099 --env-file .env.production intrilex-match-server
#
# The container respects the PORT env var (defaults to 3099).
# Production env vars (SUPABASE_SECRET_KEY, INTRILEX_ALLOWED_ORIGINS, etc.)
# must be provided via --env-file or -e flags.
# ─────────────────────────────────────────────────────────────────

FROM node:22-slim AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

WORKDIR /app

# Copy workspace configuration and package manifests first for layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/ ./packages/
COPY apps/match-server/ ./apps/match-server/
COPY apps/lab-web/ ./apps/lab-web/
COPY runtime/ ./runtime/
COPY scripts/ ./scripts/
COPY config/ ./config/

# Install production dependencies (workspace packages resolved from local source)
RUN pnpm install --frozen-lockfile --filter @intrilex/match-server... --filter @intrilex/shared...

# Build the engine patch (required by engine-adapter at runtime)
RUN pnpm run engine-patch:build

# Build shared version files
RUN pnpm run version:generate

ENV NODE_ENV=production
ENV PORT=3099
ENV HOST=0.0.0.0

# Expose the default port (can be overridden by PORT env var)
EXPOSE 3099

# Health check — verifies the HTTP /health endpoint responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3099)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Run as a non-root user for security
RUN groupadd -r intrilex && useradd -r -g intrilex intrilex
RUN chown -R intrilex:intrilex /app
USER intrilex

# Start the match server
CMD ["node", "apps/match-server/src/server.mjs"]
