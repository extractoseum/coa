#!/usr/bin/expect -f

set timeout -1
set password "Mv+7c#dQ4U9ALV4Lup#p"
set pubkey [read [open "ops/keys/deploy_key.pub" r]]

spawn ssh root@148.230.88.203 "mkdir -p ~/.ssh && echo '$pubkey' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
expect {
    "password:" { send "$password\r"; exp_continue }
    eof
}
