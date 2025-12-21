#!/usr/bin/expect -f

set timeout -1

# 1. Delete existing dist
spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "rm -rf /var/www/coa-viewer/backend/dist"
expect {
    "password:" {
        send "Mv+7c#dQ4U9ALV4Lup#p\r"
        exp_continue
    }
    eof
}

# 2. Upload new dist
spawn scp -o StrictHostKeyChecking=no -r backend/dist root@148.230.88.203:/var/www/coa-viewer/backend/
expect {
    "password:" {
        send "Mv+7c#dQ4U9ALV4Lup#p\r"
        exp_continue
    }
    eof
}

# 3. Restart PM2
spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "cd /var/www/coa-viewer/backend && pm2 restart coa-backend"
expect {
    "password:" {
        send "3xtr2ct0sEUM_24!\r"
        exp_continue
    }
    eof
}
