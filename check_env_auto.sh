#!/bin/bash
cd "/Users/bdelatorre8/COA Viewer 2.0/backend"

# 1. Upload check_env.js
expect -c '
set timeout -1
spawn scp -o StrictHostKeyChecking=no check_env.js root@148.230.88.203:/var/www/coa-viewer/backend/
expect {
    "password:" {
        send "Mv+7c#dQ4U9ALV4Lup#p\r"
        exp_continue
    }
    eof
}
'

# 2. Run it
expect -c '
set timeout -1
spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "cd /var/www/coa-viewer/backend && node check_env.js"
expect {
    "password:" {
        send "Mv+7c#dQ4U9ALV4Lup#p\r"
        exp_continue
    }
    eof
}
'
