#!/bin/bash
set -e

# Configuration
REMOTE="root@148.230.88.203"
REMOTE_DIR="/var/www/coa-viewer/backend"

cd "$(dirname "$0")/backend"

echo "🔨 [1/6] Building backend..."
npm run build

echo "🚀 Deploying Backend with Password..."

expect -c '
set timeout -1

# 1. Clean remote dist
spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "rm -rf /var/www/coa-viewer/backend/dist"
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof

# 2. Upload new build
spawn scp -o StrictHostKeyChecking=no -r dist/ root@148.230.88.203:/var/www/coa-viewer/backend/
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof

# 3. Upload package.json
spawn scp -o StrictHostKeyChecking=no package.json root@148.230.88.203:/var/www/coa-viewer/backend/
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof

# 4. Install dependencies
spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "cd /var/www/coa-viewer/backend && npm install --omit=dev"
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof

# 5. Restart service
spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "pm2 restart coa-backend"
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof

'

echo "✅ Backend deployment complete."
