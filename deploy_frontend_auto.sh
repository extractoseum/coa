#!/bin/bash
cd "/Users/bdelatorre8/COA Viewer 2.0/frontend"

# Build the project
npm run build

# EXPECT script for automated SCP with password
# distinct/. allows copying contents
expect -c '
set timeout -1
spawn scp -o StrictHostKeyChecking=no -r dist/. root@148.230.88.203:/var/www/coa-viewer/dist/
# NOTE: This places 'dist' into '/var/www/coa-viewer/', creating '/var/www/coa-viewer/dist' (Correct Nginx Root)
expect {
    "password:" {
        send "Mv+7c#dQ4U9ALV4Lup#p\r"
        exp_continue
    }
    eof
}


'
echo "Frontend deployment complete."
