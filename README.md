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
4. Set environment variables (e.g., `API_SECRET`, `ALLOWED_ORIGINS`, `DHAN_CLIENT_ID`, `DHAN_ACCESS_TOKEN`) in Render Dashboard.
5. Build command: `npm install`
6. Start command: `node server.js`
7. Done — live at https://dalal-wire.onrender.com

## Environment Variables

| Variable | Description |
|---|---|
| `API_SECRET` | Secret used to secure endpoints. Generate one with `npm run gen:secret`. Mandatory in production. |
| `ALLOWED_ORIGINS` | Comma-separated list of origins allowed to access the API (e.g. `http://localhost:3000,https://your-domain.com`). |
| `FEATURE_DHAN_API` | Set to `true` to enable broker integration. |
| `DHAN_CLIENT_ID` | Your Dhan Client ID. Only used if `FEATURE_DHAN_API=true`. Keep secure. |
| `DHAN_ACCESS_TOKEN` | Your Dhan Access Token. Only used if `FEATURE_DHAN_API=true`. Keep secure. |
| `PORT` | Port (default: 3000) |

## Security and API Authentication

The Dalal Wire backend implements security using an `API_SECRET`.
1. The frontend asks for a temporary token from `/api/auth/session` (which validates the browser origin via `ALLOWED_ORIGINS`).
2. The backend provides a short-lived, fingerprint-bound token.
3. The frontend passes this token in the `x-dalal-token` header for all subsequent API requests.

**Important:** Never commit `.env` or your `API_SECRET`/`DHAN_ACCESS_TOKEN` to source control. They should be configured directly in your deployment platform (e.g., Render, Vercel). If `NODE_ENV=production` and `API_SECRET` is not set, the app will refuse to start.
