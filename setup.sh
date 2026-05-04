#!/usr/bin/env bash
# =============================================================================
# OpenClaw Custom Extension — Setup Script
#
# This script:
#   1. Verifies prerequisites (Node.js, Docker, npm)
#   2. Installs dependencies for all custom skills and the bridge
#   3. Builds TypeScript for all packages
#   4. Initializes the .env file from .env.example
#   5. Creates required directories
#   6. Copies the provider config to ~/.openclaw/config.json
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[setup]${NC} $*"; }
log_success() { echo -e "${GREEN}[setup]${NC} ✓ $*"; }
log_warn()    { echo -e "${YELLOW}[setup]${NC} ⚠ $*"; }
log_error()   { echo -e "${RED}[setup]${NC} ✗ $*"; }

# =============================================================================
# Step 1: Check prerequisites
# =============================================================================

log_info "Checking prerequisites..."

check_command() {
  if ! command -v "$1" &>/dev/null; then
    log_error "$1 is not installed. Please install it and re-run this script."
    exit 1
  fi
  log_success "$1 found: $(command -v "$1")"
}

check_command node
check_command npm
check_command docker
check_command git

# Check Node.js version >= 20
NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  log_error "Node.js 20+ is required. Found: $(node --version)"
  exit 1
fi
log_success "Node.js version: $(node --version)"

# Check Docker Compose (v2 plugin or standalone)
if docker compose version &>/dev/null 2>&1; then
  log_success "Docker Compose v2 found"
elif command -v docker-compose &>/dev/null; then
  log_success "Docker Compose (standalone) found"
else
  log_warn "Docker Compose not found. You can still run skills locally."
fi

# =============================================================================
# Step 2: Initialize .env
# =============================================================================

log_info "Initializing environment configuration..."

if [ ! -f "${ROOT_DIR}/.env" ]; then
  cp "${ROOT_DIR}/.env.example" "${ROOT_DIR}/.env"
  log_success "Created .env from .env.example"
  log_warn "IMPORTANT: Edit .env and fill in all REQUIRED values before starting."
else
  log_info ".env already exists — skipping copy"
fi

# =============================================================================
# Step 3: Create required directories
# =============================================================================

log_info "Creating required directories..."

mkdir -p "${ROOT_DIR}/workspace"
mkdir -p "${ROOT_DIR}/workspace/screenshots"

# Create audit log if it doesn't exist
if [ ! -f "${ROOT_DIR}/audit_log.json" ]; then
  echo "[]" > "${ROOT_DIR}/audit_log.json"
  log_success "Created audit_log.json"
fi

log_success "Directories ready"

# =============================================================================
# Step 4: Copy provider config to ~/.openclaw/
# =============================================================================

log_info "Setting up OpenClaw provider config..."

OPENCLAW_CONFIG_DIR="${HOME}/.openclaw"
mkdir -p "${OPENCLAW_CONFIG_DIR}"

if [ ! -f "${OPENCLAW_CONFIG_DIR}/config.json" ]; then
  cp "${ROOT_DIR}/openclaw-config.json" "${OPENCLAW_CONFIG_DIR}/config.json"
  log_success "Copied openclaw-config.json to ~/.openclaw/config.json"
else
  log_info "~/.openclaw/config.json already exists — skipping"
fi

# =============================================================================
# Step 5: Install and build custom skills
# =============================================================================

SKILLS=("email-skill" "browser-skill" "workspace-skill")

for skill in "${SKILLS[@]}"; do
  SKILL_DIR="${ROOT_DIR}/custom-skills/${skill}"
  log_info "Installing ${skill}..."

  if [ ! -d "${SKILL_DIR}" ]; then
    log_error "Skill directory not found: ${SKILL_DIR}"
    exit 1
  fi

  (
    cd "${SKILL_DIR}"
    npm install --silent
    npm run build
  )

  log_success "${skill} built successfully"
done

# Install Playwright browsers for browser-skill
log_info "Installing Playwright browsers (Chromium)..."
(
  cd "${ROOT_DIR}/custom-skills/browser-skill"
  npx playwright install chromium --with-deps 2>/dev/null || \
    log_warn "Playwright browser install failed — run manually: cd custom-skills/browser-skill && npx playwright install chromium"
)

# =============================================================================
# Step 6: Install and build the bridge
# =============================================================================

log_info "Installing bridge dependencies..."
(
  cd "${ROOT_DIR}/bridge"
  npm install --silent
  npm run build
)
log_success "Bridge built successfully"

# =============================================================================
# Step 7: Verify openclaw-core was cloned
# =============================================================================

if [ ! -d "${ROOT_DIR}/openclaw-core" ]; then
  log_warn "openclaw-core not found. Cloning..."
  git clone https://github.com/openclaw/openclaw "${ROOT_DIR}/openclaw-core"
  log_success "openclaw-core cloned"
else
  log_success "openclaw-core already present"
fi

# =============================================================================
# Done
# =============================================================================

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit .env and fill in all REQUIRED values"
echo "     (GROQ_API_KEY, OPENCLAW_GATEWAY_TOKEN, SHARED_SECRET,"
echo "      TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_IDS)"
echo ""
echo "  2. Start the stack:"
echo "     docker compose up --build -d"
echo ""
echo "  3. Check health:"
echo "     curl http://localhost:4000/health"
echo "     curl http://localhost:3000/health"
echo ""
echo "  4. View logs:"
echo "     docker compose logs -f"
echo ""
