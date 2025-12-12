# Schompf Quick Start

## Local Network Sharing (First Iteration) ✅

Your app is now configured for local network sharing!

### Status
- ✅ Frontend: Accessible on local network
- ✅ Backend: Listening on all interfaces (0.0.0.0:3000)
- ✅ Database: Persisting to `/api/data/db.json`

### Access Your App

**From your MacBook (192.168.178.150):**
- Your laptop: `http://localhost:5173`
- Your network: `http://192.168.178.150:5173`

**From other devices on your network:**
- Phones, tablets, other computers: `http://192.168.178.150:5173`

### Start Development
```bash
npm run dev
```

Both frontend and backend start automatically. All data is saved to the database file.

---

## Production Deployment (Second Iteration)

### Quick Deploy Commands

**Frontend (GitHub Pages):**
```bash
cd app
npm run deploy
```
Live at: `https://schompf.michoest.com`

**Backend (Raspberry Pi):**
See full instructions in [DEPLOYMENT.md](DEPLOYMENT.md#backend-deployment-raspberry-pi)

### Architecture
```
┌─────────────────────────────────────┐
│  Frontend: GitHub Pages             │
│  https://schompf.michoest.com       │
└────────────┬────────────────────────┘
             │
             │ API Calls
             ▼
┌─────────────────────────────────────┐
│  Backend: Raspberry Pi              │
│  https://schompf.server.michoest.com│
│  Database: /home/pi/schompf/api/    │
│            data/db.json             │
└─────────────────────────────────────┘
```

### DNS Setup Required
Before deploying, set up CNAME records:
- `schompf.michoest.com` → `[your-github-username].github.io`
- `schompf.server.michoest.com` → `[your-raspberry-pi-ip]`

---

## Files Overview

- **[app/.env](app/.env)**: Local development config
- **[app/.env.production](app/.env.production)**: Production frontend config
- **[api/.env](api/.env)**: Backend config (works for both local and production)
- **[app/public/CNAME](app/public/CNAME)**: GitHub Pages custom domain
- **[DEPLOYMENT.md](DEPLOYMENT.md)**: Complete deployment guide

---

## What's Configured

### Local Development
- ✅ Vite dev server listens on `0.0.0.0:5173`
- ✅ Express backend listens on `0.0.0.0:3000`
- ✅ CORS allows `http://192.168.178.150:5173`
- ✅ Database persists to `api/data/db.json`
- ✅ API proxy configured in Vite

### Production
- ✅ Frontend build configured for custom domain
- ✅ gh-pages deployment ready
- ✅ Production API URL: `https://schompf.server.michoest.com`
- ✅ CORS configured for production domain
- ✅ CNAME file for GitHub Pages

---

## Next Steps

### For Local Network Testing
1. Start the servers: `npm run dev`
2. Connect other devices to your WiFi
3. Open `http://192.168.178.150:5173` on those devices
4. Start planning meals together!

### For Production Deployment
1. Set up DNS CNAME records
2. Deploy frontend: `cd app && npm run deploy`
3. Set up Raspberry Pi backend (follow [DEPLOYMENT.md](DEPLOYMENT.md))
4. Access from anywhere: `https://schompf.michoest.com`

---

## Support

For detailed deployment instructions, troubleshooting, and maintenance:
👉 See [DEPLOYMENT.md](DEPLOYMENT.md)
