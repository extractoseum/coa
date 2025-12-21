#!/bin/bash
echo "Correcting Deployment Path based on Nginx 'root' config..."

expect -c '
set timeout 60
spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "cd /var/www/coa-viewer && cp -r dist/* . && rm -rf dist && systemctl restart nginx"
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof
'
echo "Fix complete. Files moved from /dist to root."
