#!/bin/bash
expect -c '
set timeout 30
spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "ls -la /var/www/coa-viewer/dist/ && ls -la /var/www/coa-viewer/dist/assets/logo_full*"
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof
'
