#!/bin/bash
cd "/Users/bdelatorre8/COA Viewer 2.0/frontend"

echo "1. Building frontend..."
npm run build

echo "2. Compressing dist..."
tar -czf dist.tar.gz dist

echo "3. Uploading archive..."
expect -c '
set timeout 300
spawn scp -o StrictHostKeyChecking=no dist.tar.gz root@148.230.88.203:/var/www/coa-viewer/
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof
'

echo "4. PURGING and Deploying to DIST (User Requested Fix)..."
expect -c '
set timeout 60
spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "cd /var/www/coa-viewer && rm -rf dist && tar -xzf dist.tar.gz && rm dist.tar.gz && systemctl restart nginx"
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof
'

echo "5. Verifying Nginx Config..."
expect -c '
set timeout 30
spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "grep root /etc/nginx/sites-enabled/*"
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof
'

echo "Purge & Deploy complete."
