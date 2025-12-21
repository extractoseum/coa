#!/bin/bash
cd "/Users/bdelatorre8/COA Viewer 2.0/frontend"

echo "Building frontend..."
npm run build

echo "Removing remote dist..."
expect -c '
set timeout 30
spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "rm -rf /var/www/coa-viewer/dist"
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof
'

echo "Uploading fresh dist..."
expect -c '
set timeout 300
spawn scp -o StrictHostKeyChecking=no -r dist root@148.230.88.203:/var/www/coa-viewer/
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof
'

echo "Restarting Nginx..."
expect -c '
set timeout 30
spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "systemctl restart nginx"
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof
'

echo "Deployment v2 complete."
