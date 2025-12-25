#!/bin/bash
set -e

# Configuration
KEY="../ops/keys/deploy_key"
REMOTE="root@148.230.88.203"
REMOTE_DIR="/var/www/coa-viewer/backend"

# Run Diagnostics first (Health Gate)
echo "🔍 Running System Diagnostics..."
node "$(dirname "$0")/scripts/system-diagnostics.js"
if [ $? -ne 0 ]; then
    echo "❌ Deployment Aborted: checks failed."
    exit 1
fi

cd "$(dirname "$0")/backend"

echo "🔨 [1/6] Building backend..."
npm run build

echo "🧹 [2/6] Cleaning remote dist..."
ssh -i "$KEY" -o StrictHostKeyChecking=no "$REMOTE" "rm -rf $REMOTE_DIR/dist"

echo "🚀 [3/6] Uploading new build..."
scp -i "$KEY" -o StrictHostKeyChecking=no -r dist/ "$REMOTE":$REMOTE_DIR/
scp -i "$KEY" -o StrictHostKeyChecking=no package.json "$REMOTE":$REMOTE_DIR/

echo "🧠 [4/6] Uploading AI Knowledge Base..."
ssh -i "$KEY" -o StrictHostKeyChecking=no "$REMOTE" "mkdir -p $REMOTE_DIR/dist/data"
scp -i "$KEY" -o StrictHostKeyChecking=no -r data/ai_knowledge_base/ "$REMOTE":$REMOTE_DIR/dist/data/

echo "📦 [5/6] Installing production dependencies (Safety Check)..."
ssh -i "$KEY" -o StrictHostKeyChecking=no "$REMOTE" "cd $REMOTE_DIR && npm install --omit=dev"

echo "🔄 [6/6] Restarting service..."
ssh -i "$KEY" -o StrictHostKeyChecking=no "$REMOTE" "pm2 restart coa-backend"

echo "✅ Backend deployment complete. Secured with SSH Key."
