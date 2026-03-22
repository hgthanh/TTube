## Packages
react-player | Robust video player component for handling various formats
framer-motion | Smooth animations and page transitions
date-fns | Formatting timestamps and durations
clsx | Utility for conditional classes (often used with tailwind-merge)
tailwind-merge | Utility for merging tailwind classes

## Architecture (Vercel deployment)
- Frontend: React/Vite → built to `dist/public`, served as static by Vercel CDN
- Backend: Express serverless function at `api/index.ts` → deployed as Vercel Function
- Proxy pool: fetched from ProxyScrape at startup, refreshed every 5 min
  - All Innertube (youtubei.js) requests use a random proxy from the pool
  - `/api/proxy?url=...` endpoint replaces the old Cloudflare Worker
- Storage: In-memory (MemStorage) — no database required
- Video stream: `/api/yt/stream/:id` → deciphers URL → redirects to `/api/proxy?url=...`
