#!/bin/bash

# Ara Smart Deploy & Checkpoint Script
# Automates validation, git tagging, and deployment.

set -e

REPO_DIR="/Users/bdelatorre8/COA Viewer 2.0"
BACKEND_DIR="$REPO_DIR/backend"
FRONTEND_DIR="$REPO_DIR/frontend"
TIMESTAMP=$(date +"%Y%m%d-%H%M")
TAG_NAME="deploy-$TIMESTAMP"

echo "🚀 Starting Smart Deploy [$TAG_NAME]..."

# 1. PRE-FLIGHT CHECKS & STAGING
echo "🔍 Staging changes and running pre-flight checks..."
git add .

# Validate tools registry schema (simple grep for now)
if [ -f "$BACKEND_DIR/data/ai_knowledge_base/core/tools_registry.json" ] || [ -f "$BACKEND_DIR/data/ucvt/tools/tools_registry.json" ]; then
    echo "✅ Tools Registry found. Validating JSON..."
    REG_PATH="$BACKEND_DIR/data/ucvt/tools/tools_registry.json"
    [ ! -f "$REG_PATH" ] && REG_PATH="$BACKEND_DIR/data/ai_knowledge_base/core/tools_registry.json"
    node -e "JSON.parse(require('fs').readFileSync('$REG_PATH'))" || (echo "❌ Invalid JSON in Tools Registry!" && exit 1)
fi

# 2. CREATE CHECKPOINT
echo "🔖 Creating Git Checkpoint..."
git tag -a "$TAG_NAME" -m "Deployment checkpoint at $TIMESTAMP"
echo "✅ Tag $TAG_NAME created."

# 3. BUILD VALIDATION
echo "🏗️  Validating Frontend Build..."
cd "$FRONTEND_DIR"
npm run build > /dev/null

echo "🏗️  Validating Backend Build..."
cd "$BACKEND_DIR"
npm run build > /dev/null

# 4. DEPLOYMENT (Git Push Smart Deploy)
echo "📦 Pushing changes to trigger GitHub Actions..."

# Check if there are changes to commit
if ! git diff-index --quiet HEAD -- || [ -n "$(git status --short)" ]; then
    echo "📝 Committing changes..."
    git commit -m "🚀 Smart Deploy: $TAG_NAME"
fi

echo "📤 Pushing to main..."
git push origin main
echo "📤 Pushing checkpoint tag..."
git push origin "$TAG_NAME"

echo "✅ Smart Deploy Complete! You can now monitor the progress in GitHub Actions."
echo "Checkpoints: git tag -l | tail -n 5"
