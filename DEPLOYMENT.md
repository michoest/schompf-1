# Schompf Deployment Guide

This guide covers both local network sharing and production deployment.

## Table of Contents
1. [Local Network Development](#local-network-development)
2. [Production Deployment](#production-deployment)
3. [Database Management](#database-management)

---

## Local Network Development

### Current Setup
Your app is configured to run on your local network at `192.168.178.150`.

### Running Locally
```bash
# From the project root
npm run dev
```

This starts both:
- **Frontend (Vite)**: `http://192.168.178.150:5173` (or next available port)
- **Backend (Express)**: `http://0.0.0.0:3000`

### Access Points
- **On your MacBook**: `http://localhost:5173` or `http://192.168.178.150:5173`
- **From other devices on network**: `http://192.168.178.150:5173`

### Database Persistence
All data is automatically persisted to: `/api/data/db.json`

The database uses [lowdb](https://github.com/typicode/lowdb) and automatically:
- Creates the data directory if it doesn't exist
- Saves changes immediately to disk
- Loads existing data on startup

---

## Production Deployment

### Architecture
- **Frontend**: GitHub Pages at `schompf.michoest.com`
- **Backend**: Raspberry Pi at `schompf.server.michoest.com`

### Prerequisites

#### DNS Configuration
Set up these CNAME records:
```
schompf.michoest.com → [your-github-username].github.io
schompf.server.michoest.com → [your-raspberry-pi-ip]
```

#### GitHub Repository Setup
1. Ensure your repository is public (required for GitHub Pages on free tier)
2. Go to Settings → Pages
3. Source: Deploy from a branch
4. Branch: `gh-pages` (will be created automatically)

---

### Frontend Deployment (GitHub Pages)

#### 1. Verify Configuration

The frontend is already configured with:
- **[app/public/CNAME](app/public/CNAME)**: Contains `schompf.michoest.com`
- **[app/.env.production](app/.env.production)**: Points to production API

#### 2. Deploy to GitHub Pages

```bash
cd app
npm run deploy
```

This command:
1. Builds the production frontend (`npm run build`)
2. Deploys to GitHub Pages (`gh-pages -d dist`)

#### 3. Verify Deployment

Wait 1-2 minutes, then visit: `https://schompf.michoest.com`

---

### Backend Deployment (Raspberry Pi)

#### 1. Prepare Raspberry Pi

SSH into your Raspberry Pi:
```bash
ssh pi@schompf.server.michoest.com
```

Install Node.js (if not already installed):
```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should be v20.x or higher
npm --version
```

#### 2. Clone Repository

```bash
cd ~
git clone https://github.com/[your-username]/schompf.git
cd schompf/api
```

#### 3. Install Dependencies

```bash
npm install --production
```

#### 4. Configure Environment

Create production environment file:
```bash
nano .env
```

Add the following configuration:
```env
# Server Configuration
PORT=3000
HOST=0.0.0.0

# CORS - Frontend URL(s), comma-separated
CORS_ORIGINS=https://schompf.michoest.com

# Database
DB_PATH=./data/db.json
```

#### 5. Set Up Systemd Service

Create a systemd service file:
```bash
sudo nano /etc/systemd/system/schompf-api.service
```

Add the following content:
```ini
[Unit]
Description=Schompf API Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/schompf/api
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=schompf-api

# Environment
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable schompf-api
sudo systemctl start schompf-api
```

Check service status:
```bash
sudo systemctl status schompf-api
```

View logs:
```bash
sudo journalctl -u schompf-api -f
```

#### 6. Set Up Reverse Proxy (Nginx)

Install Nginx:
```bash
sudo apt-get update
sudo apt-get install nginx
```

Create Nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/schompf-api
```

Add the following:
```nginx
server {
    listen 80;
    server_name schompf.server.michoest.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/schompf-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 7. Set Up SSL with Let's Encrypt

Install Certbot:
```bash
sudo apt-get install certbot python3-certbot-nginx
```

Obtain SSL certificate:
```bash
sudo certbot --nginx -d schompf.server.michoest.com
```

Follow the prompts. Certbot will automatically:
- Obtain the certificate
- Configure Nginx for HTTPS
- Set up automatic renewal

Verify renewal:
```bash
sudo certbot renew --dry-run
```

#### 8. Update Firewall

If using UFW:
```bash
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

### Updating the Deployment

#### Frontend Updates

```bash
cd app
npm run deploy
```

#### Backend Updates

SSH into your Raspberry Pi:
```bash
ssh pi@schompf.server.michoest.com
cd ~/schompf
git pull
cd api
npm install --production
sudo systemctl restart schompf-api
```

---

## Database Management

### Backup

Create a backup script on your Raspberry Pi:
```bash
nano ~/backup-schompf.sh
```

Add:
```bash
#!/bin/bash
BACKUP_DIR="$HOME/schompf-backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
cp ~/schompf/api/data/db.json "$BACKUP_DIR/db_$DATE.json"
# Keep only last 30 backups
ls -t "$BACKUP_DIR"/db_*.json | tail -n +31 | xargs -r rm
```

Make executable:
```bash
chmod +x ~/backup-schompf.sh
```

Add to crontab (daily backup at 3 AM):
```bash
crontab -e
```

Add line:
```
0 3 * * * /home/pi/backup-schompf.sh
```

### Restore

```bash
# Stop the service
sudo systemctl stop schompf-api

# Restore backup
cp ~/schompf-backups/db_[timestamp].json ~/schompf/api/data/db.json

# Start the service
sudo systemctl start schompf-api
```

### Database Location

- **Development**: `/Users/michoest/dev/schompf/schompf-1/api/data/db.json`
- **Production**: `/home/pi/schompf/api/data/db.json`

---

## Troubleshooting

### Frontend Issues

Check build output:
```bash
cd app
npm run build
```

### Backend Issues

Check service status:
```bash
sudo systemctl status schompf-api
sudo journalctl -u schompf-api -n 50
```

Check Nginx:
```bash
sudo nginx -t
sudo systemctl status nginx
```

### CORS Issues

Ensure [api/.env](api/.env) includes your frontend URL:
```env
CORS_ORIGINS=https://schompf.michoest.com
```

Then restart:
```bash
sudo systemctl restart schompf-api
```

### SSL Certificate Issues

Check certificate status:
```bash
sudo certbot certificates
```

Renew manually:
```bash
sudo certbot renew
sudo systemctl restart nginx
```

---

## Quick Reference

### Development Commands
```bash
npm run dev          # Start both frontend and backend
npm run dev:app      # Start only frontend
npm run dev:api      # Start only backend
```

### Production Commands
```bash
# Frontend
cd app && npm run deploy

# Backend (on Raspberry Pi)
sudo systemctl restart schompf-api
sudo journalctl -u schompf-api -f
```

### Useful URLs
- **Local Frontend**: http://192.168.178.150:5173
- **Local Backend**: http://192.168.178.150:3000
- **Production Frontend**: https://schompf.michoest.com
- **Production Backend**: https://schompf.server.michoest.com
- **Backend Health Check**: https://schompf.server.michoest.com/health
