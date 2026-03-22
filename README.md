# Tube Viewer

A YouTube front-end built with React + Vite (client) and Express serverless (API), deployable on Vercel.

## Deploy to Vercel

### 1. Push to GitHub
```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/YOUR/repo.git
git push -u origin main
```

### 2. Import on Vercel
- Go to [vercel.com/new](https://vercel.com/new) → Import your repo
- **Framework Preset**: Other
- **Build Command**: `npm run vercel-build`
- **Output Directory**: `dist/public`
- **Install Command**: `npm install`

No environment variables needed — storage is in-memory and proxies are fetched automatically from ProxyScrape.

## Local Development

```bash
npm install
npm run dev       # starts Express on :5000 + Vite HMR
```

## How proxies work

On startup, the server fetches a fresh proxy list from:
```
https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text
```

- A random proxy is used for every Innertube session created by `youtubei.js`
- The list is refreshed automatically every 5 minutes
- Video streams and subtitles are piped through `/api/proxy?url=...` (replaces the old Cloudflare Worker)
- The Settings page lets you view all loaded proxies, pick one manually, or force a refresh

## Project Structure

```
├── api/index.ts          # Vercel serverless entry point
├── client/               # React/Vite frontend
│   └── src/
│       ├── pages/        # Home, Search, Video, Channel, Favorites, History, Settings, Shorts
│       ├── components/   # VideoPlayer, VideoCard, Layout, shadcn/ui
│       └── hooks/        # use-yt.ts, use-favorites.ts, use-toast.ts
├── server/
│   ├── routes.ts         # All API routes + proxy pool logic
│   ├── storage.ts        # In-memory favorites storage
│   └── index.ts          # Dev server entry
├── shared/
│   ├── schema.ts         # Zod schemas + TypeScript types
│   └── routes.ts         # Shared API route definitions
└── vercel.json           # Vercel build + rewrite config
```
