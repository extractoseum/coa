#!/bin/bash
cd "/Users/bdelatorre8/COA Viewer 2.0/frontend"

# Build the project
npm run build

# EXPECT script for automated SCP with password
# distinct/. allows copying contents
expect -c '
set timeout -1
# 1. Ensure directory exists
spawn ssh -o StrictHostKeyChecking=no root@148.230.88.203 "mkdir -p /var/www/coa-viewer/dist"
expect {
    "password:" {
        send ")l2fyDHz60u,nTAd,@tD\r"
        exp_continue
    }
    eof
}

# 2. Upload files to Nginx Root
spawn scp -o StrictHostKeyChecking=no -r dist/. root@148.230.88.203:/var/www/coa-viewer/
# NOTE: This places 'dist' into '/var/www/coa-viewer/', creating '/var/www/coa-viewer/dist' (Correct Nginx Root)
expect {
    "password:" {
        send ")l2fyDHz60u,nTAd,@tD\r"
        exp_continue
    }
    eof
}


'
echo "Frontend deployment complete."
