#!/usr/bin/expect -f

set timeout -1

spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "cd /var/www/coa-viewer/backend && pm2 restart coa-backend"
expect {
    "password:" {
        send "Mv+7c#dQ4U9ALV4Lup#p\r"
        exp_continue
    }
    eof
}
