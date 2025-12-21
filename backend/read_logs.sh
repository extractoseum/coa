#!/bin/bash
expect -c '
set timeout 30
spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "pm2 logs coa-backend --lines 100 --nostream"
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof
'
