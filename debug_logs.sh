#!/usr/bin/expect -f

set timeout 10

spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "pm2 logs coa-backend --lines 50 --nostream"
expect {
    "password:" {
        send "Mv+7c#dQ4U9ALV4Lup#p\r"
        exp_continue
    }
    eof
}
