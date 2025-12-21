#!/bin/bash
expect -c '
set timeout 30
spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "sed -i \"s|root /var/www/coa-viewer;|root /var/www/coa-viewer/dist;|g\" /etc/nginx/sites-enabled/coa-viewer && nginx -t && systemctl reload nginx"
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof
'
