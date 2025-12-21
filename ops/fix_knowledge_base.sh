#!/bin/bash

# Configuration
SERVER_IP="148.230.88.203"
REMOTE_PARENT_DIR="/var/www/coa-viewer/backend/dist"
LOCAL_DIR="backend/src/ai_knowledge_base"
PASSWORD="Mv+7c#dQ4U9ALV4Lup#p"

echo "🚀 Uploading AI Knowledge Base to Production..."

expect -c "
set timeout -1
set password \"$PASSWORD\"

# Create parent directory if it doesn't exist
spawn ssh root@$SERVER_IP \"mkdir -p $REMOTE_PARENT_DIR\"
expect {
    \"password:\" { send \"\$password\r\"; exp_continue }
    eof
}

# Upload the entire folder 'ai_knowledge_base' into 'dist'
spawn scp -r -o StrictHostKeyChecking=no $LOCAL_DIR root@$SERVER_IP:$REMOTE_PARENT_DIR/
expect {
    \"password:\" { send \"\$password\r\"; exp_continue }
    eof
}
"

echo "✅ Upload Complete."
