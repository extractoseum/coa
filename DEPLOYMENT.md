# COA Viewer 2.0 - Deployment Guide

## VPS Information
- **IP**: See `.env.production` or password manager
- **Host**: srv937346.hstgr.cloud
- **SSH User**: root
- **SSH Password**: See password manager (NEVER commit to repo)
- **Panel**: https://hpanel.hostinger.com/vps/937346/overview

## Production URLs
- **Frontend**: https://coa.extractoseum.com
- **API**: https://coa.extractoseum.com/api/v1

## Supabase (Production VPS)
- **URL**: See `SUPABASE_URL` in backend/.env
- **Service Role Key**: See `SUPABASE_SERVICE_ROLE_KEY` in backend/.env (NEVER commit)

## Directory Structure (VPS)
```
/var/www/coa-viewer/           <- Nginx root (frontend static files)
  ├── index.html               <- Main HTML
  ├── assets/                  <- JS/CSS bundles
  │   ├── index-*.js
  │   └── index-*.css
  ├── vite.svg
  ├── backend/                 <- Node.js backend
  │   ├── dist/                <- Compiled TypeScript
  │   ├── node_modules/
  │   └── package.json
  └── frontend/                <- (not used by nginx)
      └── dist/                <- (not used by nginx)
```

## Nginx Configuration
- **Config file**: `/etc/nginx/sites-available/coa-viewer`
- **Enabled link**: `/etc/nginx/sites-enabled/coa-viewer`
- **Frontend root**: `/var/www/coa-viewer` (NOT /var/www/coa-viewer/frontend/dist)

## Deployment Commands

### Deploy Frontend
```bash
# Build locally
cd "/Users/bdelatorre8/COA Viewer 2.0/frontend"
npm run build

# Deploy to VPS (IMPORTANT: copy content of dist/ to nginx root)
scp -r dist/* root@148.230.88.203:/var/www/coa-viewer/

# Alternative with expect (for automation)
expect -c '
spawn scp -o StrictHostKeyChecking=no -r dist/* root@148.230.88.203:/var/www/coa-viewer/
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof
'
```

### Deploy Backend
```bash
# Build locally
cd "/Users/bdelatorre8/COA Viewer 2.0/backend"
npm run build

# Deploy to VPS
scp -r dist/* root@148.230.88.203:/var/www/coa-viewer/backend/dist/

# Restart backend on VPS
ssh root@148.230.88.203 "cd /var/www/coa-viewer/backend && pm2 restart coa-backend"
```

### SSH Access
```bash
ssh root@148.230.88.203
# Password: Mv+7c#dQ4U9ALV4Lup#p
```

### Useful VPS Commands
```bash
# Check nginx status
systemctl status nginx

# Reload nginx (after config changes)
nginx -t && systemctl reload nginx

# Check backend logs
pm2 logs coa-backend

# Restart backend
pm2 restart coa-backend

# List running processes
pm2 list
```

## Common Issues

### 1. Frontend changes not appearing
- **Cause**: Deploying to wrong directory
- **Fix**: Deploy to `/var/www/coa-viewer/` NOT `/var/www/coa-viewer/frontend/dist/`
- **Also**: Hard refresh browser (Cmd+Shift+R) or use incognito

### 2. API 502 Bad Gateway
- **Cause**: Backend not running
- **Fix**: `pm2 restart coa-backend` on VPS

### 3. Different Supabase in dev vs prod
- **Dev (local)**: kcsvwplmosrvmexxedhe.supabase.co
- **Prod (VPS)**: vbnpcospodhwuzvxejui.supabase.co
- **Fix**: Use correct credentials for each environment

### 4. Permission denied on SCP
- **Cause**: SSH key not configured
- **Fix**: Use `expect` command or enter password manually

## Quick Deploy Script
```bash
#!/bin/bash
# deploy-frontend.sh

cd "/Users/bdelatorre8/COA Viewer 2.0/frontend"
npm run build

expect -c '
spawn scp -o StrictHostKeyChecking=no -r dist/* root@148.230.88.203:/var/www/coa-viewer/
expect "password:"
send "Mv+7c#dQ4U9ALV4Lup#p\r"
expect eof
'

echo "Frontend deployed! Hard refresh browser to see changes."
```

## Environment Variables (Backend)
Located in `/var/www/coa-viewer/backend/.env`:
```
SUPABASE_URL=https://vbnpcospodhwuzvxejui.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PORT=3000
```

## SSL Certificates
- Managed by Certbot/Let's Encrypt
- Auto-renewal configured
- Certs location: `/etc/letsencrypt/live/coa.extractoseum.com/`
