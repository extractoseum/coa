#!/bin/bash

# Configuration
VPS_USER="root"
VPS_HOST="148.230.88.203"
VPS_PASS="Mv+7c#dQ4U9ALV4Lup#p"
REMOTE_DIR="/var/www/coa-viewer/dist"

echo "Executing NUCLEAR frontend deployment..."

# 1. DELETE remote dist
expect -c "
set timeout 30
spawn ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_HOST \"rm -rf $REMOTE_DIR/*\"
expect \"password:\"
send \"$VPS_PASS\r\"
expect eof
"

# 2. Upload fresh dist
cd "/Users/bdelatorre8/COA Viewer 2.0/frontend"
expect -c "
set timeout 60
spawn scp -o StrictHostKeyChecking=no -r dist/* $VPS_USER@$VPS_HOST:$REMOTE_DIR/
expect \"password:\"
send \"$VPS_PASS\r\"
expect eof
"

# 3. Restart Nginx to force flush
expect -c "
set timeout 30
spawn ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_HOST \"systemctl restart nginx\"
expect \"password:\"
send \"$VPS_PASS\r\"
expect eof
"

echo "Nuclear deployment complete."
