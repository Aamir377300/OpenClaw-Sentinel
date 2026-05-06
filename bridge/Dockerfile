# =============================================================================
# OpenClaw Bridge — Dockerfile
#
# Security:
#   - Runs as non-root "node" user (UID 1000)
#   - Multi-stage build to minimize image size
#   - No secrets in image layers
# =============================================================================

# ---- Build stage ----
FROM node:20-slim AS builder

WORKDIR /build

# Copy package files first for layer caching
COPY package.json tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install --frozen-lockfile

# Copy source
COPY src/ ./src/

# Compile TypeScript
RUN npm run build

# ---- Runtime stage ----
FROM node:20-slim AS runtime

# Install wget for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/node/app

# Copy only production dependencies
COPY package.json ./
RUN npm install --frozen-lockfile --omit=dev

# Copy compiled output from builder
COPY --from=builder /build/dist ./dist

# Create workspace and audit log directories
RUN mkdir -p /home/node/app/workspace \
    && touch /home/node/app/audit_log.json \
    && echo "[]" > /home/node/app/audit_log.json \
    && chown -R node:node /home/node/app

# Switch to non-root user
USER node

EXPOSE 4000

CMD ["node", "dist/server.js"]
