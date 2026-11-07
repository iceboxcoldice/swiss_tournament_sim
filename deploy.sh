#!/usr/bin/env bash
# ==============================================================================
# Deploy Script: Swiss Tournament Manager Backend
# ==============================================================================
# Usage:
#   ./deploy.sh                # Deploys to Google Cloud App Engine (default)
#   ./deploy.sh gcloud         # Explicit Google Cloud App Engine deploy
#   ./deploy.sh <target_host>  # Deploys Docker container to remote server (e.g. ./deploy.sh m2)
# ==============================================================================
set -euo pipefail

TARGET="${1:-gcloud}"
LOCAL_REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$TARGET" = "gcloud" ]; then
    echo "========================================================================"
    echo "🚀 Deploying Backend to Google Cloud App Engine (default)"
    echo "📁 Source directory: ${LOCAL_REPO_DIR}"
    echo "========================================================================"
    echo ""

    if ! command -v gcloud >/dev/null 2>&1; then
        echo "❌ ERROR: 'gcloud' CLI is not installed or not in PATH."
        exit 1
    fi

    ACTIVE_PROJECT="${GCLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || echo '')}"
    if [ -z "${ACTIVE_PROJECT}" ]; then
        echo "❌ ERROR: No active Google Cloud project found."
        echo "   Set GCLOUD_PROJECT=<project_id> or run 'gcloud config set project <project_id>'."
        exit 1
    fi
    echo "🔍 Active Google Cloud project: ${ACTIVE_PROJECT}"

    echo "📦 Deploying App Engine service using app.yaml..."
    gcloud app deploy "${LOCAL_REPO_DIR}/app.yaml" --quiet

    echo ""
    echo "🔍 Verifying deployed service health..."
    APP_HOSTNAME=$(gcloud app describe --format='value(defaultHostname)' 2>/dev/null || true)
    if [ -n "${APP_HOSTNAME}" ]; then
        HEALTH_URL="https://${APP_HOSTNAME}/api/health"
        echo "   Pinging ${HEALTH_URL}..."
        for i in {1..10}; do
            if curl -sf "${HEALTH_URL}" >/dev/null 2>&1; then
                echo "   ✅ Backend is responding healthy!"
                break
            fi
            sleep 2
        done

        echo ""
        echo "========================================================================"
        echo "🎉 Successfully deployed to Google Cloud App Engine!"
        echo "========================================================================"
        echo "🌐 Service URL: https://${APP_HOSTNAME}"
        echo "👉 In Tournament Manager (⚙️ Tools ▾ -> ☁️ Cloud Backend):"
        echo "   Enter: https://${APP_HOSTNAME}"
        echo "========================================================================"
    else
        echo "✅ Deployment finished."
    fi
    exit 0
fi

# ------------------------------------------------------------------------------
# Remote Docker Server Deployment (e.g. ./deploy.sh m2 or ./deploy.sh <target_host>)
# ------------------------------------------------------------------------------
TARGET_HOST="${TARGET}"
REMOTE_SUBDIR="${REMOTE_DIR:-docker/swiss_tournament_sim}"

echo "========================================================================"
echo "🚀 Deploying Tabroom Backend to Remote Server: ${TARGET_HOST}"
echo "📁 Source directory:  ${LOCAL_REPO_DIR}"
echo "📂 Remote directory:  ~/${REMOTE_SUBDIR}"
echo "========================================================================"
echo ""

# 1. Connectivity Check
echo "🔍 [1/5] Checking SSH connection to ${TARGET_HOST}..."
if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "${TARGET_HOST}" "echo 'Connected successfully'" >/dev/null 2>&1; then
    echo "❌ ERROR: Cannot reach '${TARGET_HOST}' via SSH. Please verify network/SSH connectivity."
    exit 1
fi
echo "   ✅ SSH connection verified."

# 2. Remote Preparation
echo "📁 [2/5] Preparing remote directories..."
ssh "${TARGET_HOST}" "mkdir -p ~/${REMOTE_SUBDIR}/local_storage ~/${REMOTE_SUBDIR}/users"

# 3. Rsync Codebase
echo "📦 [3/5] Syncing codebase to ${TARGET_HOST}:~/${REMOTE_SUBDIR}..."
rsync -avz --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.DS_Store' \
    --exclude='local_storage' \
    --exclude='users' \
    --exclude='.agent' \
    "${LOCAL_REPO_DIR}/" "${TARGET_HOST}:~/${REMOTE_SUBDIR}/"

# 4. Build and Restart Container
echo "🐳 [4/5] Building and launching Docker container on ${TARGET_HOST}..."
ssh "${TARGET_HOST}" "bash -s" <<EOF
set -euo pipefail
cd ~/${REMOTE_SUBDIR}

echo "   Stopping old container (if any)..."
docker compose down --remove-orphans 2>/dev/null || true

echo "   Building Docker image..."
docker compose build --pull

echo "   Starting container..."
docker compose up -d

echo "   Waiting for backend to become healthy..."
for i in {1..20}; do
    if curl -sf http://127.0.0.1:8081/api/health >/dev/null 2>&1; then
        echo "   Backend is responding healthy on port 8081!"
        exit 0
    fi
    sleep 1
done

echo "   ⚠️ Backend health check timed out. Checking container logs:"
docker compose logs --tail=30
exit 1
EOF

# 5. Tailscale Serve / HTTPS Setup & Verification
echo "🛡️  [5/5] Checking Tailscale HTTPS configuration on ${TARGET_HOST}..."
REMOTE_TS_DNS=$(ssh "${TARGET_HOST}" "tailscale status --json 2>/dev/null | grep -i 'DNSName' | head -n 1 | awk -F'\"' '{print \$4}' | sed 's/\.$//' || true")
REMOTE_IP=$(ssh "${TARGET_HOST}" "tailscale ip -4 2>/dev/null || hostname -I 2>/dev/null | awk '{print \$1}' || true")

SERVE_ACTIVE=false
if [ -n "${REMOTE_TS_DNS}" ]; then
    echo "   Detected Tailscale MagicDNS: ${REMOTE_TS_DNS}"
    SERVE_OUT=$(ssh "${TARGET_HOST}" "python3 -c '
import subprocess
try:
    p = subprocess.run([\"tailscale\", \"serve\", \"--yes\", \"--bg\", \"8081\"], capture_output=True, text=True, timeout=3)
    print(p.stdout + p.stderr)
except subprocess.TimeoutExpired:
    print(\"Tailscale Serve timed out or requires web approval\")
' 2>/dev/null || true")
    
    if curl -sf -m 3 "https://${REMOTE_TS_DNS}/api/health" >/dev/null 2>&1; then
        SERVE_ACTIVE=true
    fi
fi

echo ""
echo "========================================================================"
echo "🎉 Tabroom Backend successfully deployed to ${TARGET_HOST}!"
echo "========================================================================"

if [ "${SERVE_ACTIVE}" = "true" ]; then
    echo "🌐 Tailscale HTTPS URL (Active with SSL):"
    echo "   https://${REMOTE_TS_DNS}"
    echo ""
    echo "👉 In Tournament Manager (⚙️ Tools ▾ -> ☁️ Cloud Backend):"
    echo "   Enter: https://${REMOTE_TS_DNS}"
else
    echo "🔗 Direct HTTP URL:"
    echo "   http://${TARGET_HOST}:8081"
    if [ -n "${REMOTE_IP}" ]; then
        echo "   (or http://${REMOTE_IP}:8081)"
    fi
    echo ""
    if [ -n "${REMOTE_TS_DNS}" ]; then
        echo "💡 Note for HTTPS (GitHub Pages):"
        echo "   To enable free HTTPS on Tailscale so GitHub Pages doesn't block HTTP,"
        echo "   visit your Tailscale admin console to enable Serve on this node, then re-run this script."
    fi
    echo ""
    echo "👉 In Tournament Manager (if served locally or over HTTP):"
    echo "   Enter: http://${TARGET_HOST}:8081"
fi
echo "========================================================================"
