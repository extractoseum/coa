#!/bin/bash

# Configuration
SERVER_IP="148.230.88.203"
REMOTE_DIR="/var/www/coa-viewer"
PASSWORD="Mv+7c#dQ4U9ALV4Lup#p"
CSV_FILE="ASSETS_BRAND/d4ac021e-7b7d-406e-808a-4ec13494087d-export-contacts-eum-1766164251380.csv"

echo "🚀 Starting Remote Schema Debug..."

expect -c "
set timeout -1
set password \"$PASSWORD\"

# 2. Upload Script
spawn scp -o StrictHostKeyChecking=no backend/scripts/import_crm.js root@$SERVER_IP:$REMOTE_DIR/backend/scripts/
spawn scp -o StrictHostKeyChecking=no backend/scripts/import_crm.js root@$SERVER_IP:$REMOTE_DIR/backend/scripts/
expect {
    \"password:\" { send \"\$password\r\"; exp_continue }
    eof
}

# 4. Run Debug
spawn ssh root@$SERVER_IP \"cd $REMOTE_DIR/backend && npm install csv-parser && node scripts/import_crm.js\"
expect {
    \"password:\" { send \"\$password\r\"; exp_continue }
    eof
}
"
