#!/bin/bash

# Configuration
VPS_USER="root"
VPS_HOST="148.230.88.203"
VPS_PASS="Mv+7c#dQ4U9ALV4Lup#p"
REMOTE_DIR="/var/www/coa-viewer/backend"

echo "Configuring SMTP on VPS..."

expect -c "
set timeout 30
spawn ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_HOST
expect \"password:\"
send \"$VPS_PASS\r\"
expect \"#\"

# Navigate to directory
send \"cd $REMOTE_DIR\r\"
expect \"#\"

# Backup .env
send \"cp .env .env.bak\r\"
expect \"#\"

# Remove existing SMTP config to avoid duplicates
send \"sed -i '/SMTP_/d' .env\r\"
expect \"#\"

# Append new SMTP config
send \"echo '' >> .env\r\"
send \"echo '# SMTP Configuration' >> .env\r\"
send \"echo 'SMTP_HOST=mail.extractoseum.com' >> .env\r\"
send \"echo 'SMTP_PORT=465' >> .env\r\"
send \"echo 'SMTP_SECURE=true' >> .env\r\"
send \"echo 'SMTP_USER=aut-o@extractoseum.com' >> .env\r\"
send \"echo 'SMTP_PASS=Rastreros4501*Z' >> .env\r\"
send \"echo 'SMTP_FROM_NAME=Autenticación EUM' >> .env\r\"
expect \"#\"

# Verify content
send \"tail -n 10 .env\r\"
expect \"#\"

# Restart Backend
send \"pm2 restart coa-backend\r\"
expect \"#\"

send \"exit\r\"
expect eof
"

echo "SMTP Configuration Complete & Backend Restarted."
