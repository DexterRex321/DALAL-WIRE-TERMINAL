# Dalal Wire Terminal (Node.js)

Bloomberg-style Indian stock market terminal — Express backend + vanilla JS frontend.

## Prerequisites
- Node.js 18+ → https://nodejs.org

## Run locally

```powershell
# 1. Install dependencies
npm install

# 2. Start server
npm start

# 3. Open browser
http://localhost:3000
```

## Dev mode (auto-restart on file changes)

```powershell
npm run dev
```

## Push to GitHub

```powershell
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/dalal-wire.git
git branch -M main
git push -u origin main
```

## Deploy to Render (free)

1. Push to GitHub
2. Go to render.com → New Web Service
3. Connect repo
4. Set environment variables (e.g., TWELVE_DATA_KEY, INTERNAL_API_SECRET, etc.) in Render Dashboard.
5. Build command: `npm install`
6. Start command: `node server.js`
7. Done — live at https://dalal-wire.onrender.com

## Environment Variables

| Variable | Description |
|---|---|
| `TWELVE_DATA_KEY` | Your Twelve Data API key |
| `PORT` | Port (default: 3000) |
