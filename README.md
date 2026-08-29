# SparkFix

An AI fault-finding assistant, device/manual lookup, AS/NZS 3000 & BS 7671 reference tables, and job log — for professional electricians.

## Why this project is structured this way

The original component was built to run inside a preview environment that provides two things automatically: a `window.storage` API for persistence, and a way to call Claude without exposing an API key. A real, deployable app can't rely on either of those, so this project splits into two parts:

- **`client/`** — the React app (Vite + Tailwind + lucide-react). Persistence now uses the browser's own `localStorage`. Instead of calling `api.anthropic.com` directly (which would require putting your Anthropic API key in code every visitor can read), it calls your own backend at `/api/claude`.
- **`server/`** — a small Express server that holds your Anthropic API key (via an environment variable, never committed) and proxies requests from the client to Claude's API. This is the piece that makes it safe to actually ship.

This split is also what you want as the base for native app packaging later (e.g. with Capacitor) — the client stays a normal web app, and it just needs a real backend URL to talk to instead of `localhost` once deployed.

## Quick start

**1. Backend**

```
cd server
cp .env.example .env
# edit .env and add your ANTHROPIC_API_KEY
npm install
npm start
```

Runs on `http://localhost:3001` by default.

**2. Frontend** (in a second terminal)

```
cd client
npm install
npm run dev
```

Runs on `http://localhost:5173` and proxies `/api/*` requests to the backend during development (see `vite.config.ts`).

Open `http://localhost:5173` in your browser.

## Deploying

- Deploy `server/` anywhere that can run Node and hold an environment variable (Railway, Render, Fly.io, a small VPS, etc.). Set `ANTHROPIC_API_KEY` there.
- Build the client with `npm run build` inside `client/`, then either serve the resulting `client/dist` folder from the same server (see the static-serving block already included in `server/index.js`) or host it separately (Vercel/Netlify) pointed at your deployed backend URL via the `VITE_API_BASE` environment variable.

## Known gaps before this is store-ready

- No app icon, splash screen, or native wrapper yet (Capacitor is the recommended path for iOS/Android — it wraps this same web build).
- No automated tests.
- The manual-lookup feature uses Claude's web search tool server-side — make sure your Anthropic API key/plan has that enabled.
- Verify the model name in `server/index.js` (`claude-sonnet-4-6`) is a real, available model on your account before relying on it — carry over from the original file, not verified here.
