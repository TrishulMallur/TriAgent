# Deployment walkthrough — Vercel (frontend) + Railway (backend)

A click-by-click guide for getting this app live on the public internet. Total time: 25–35 minutes if you've never used either platform.

The frontend works on Vercel **zero-config** thanks to the mock LLM provider — you don't strictly need the backend. The Railway step only matters if you want real PDF text extraction, OCR, the persistent audit log, or want to keep API keys off the browser.

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Deploy frontend to Vercel](#2-deploy-frontend-to-vercel-510-min)
3. [Deploy backend to Railway](#3-deploy-backend-to-railway-1015-min)
4. [Wire Vercel and Railway together](#4-wire-vercel--railway-together-5-min)
5. [End-to-end smoke test](#5-end-to-end-smoke-test)
6. [Common gotchas](#6-common-gotchas)
7. [Cost expectations](#7-cost-expectations)

---

## 1. Prerequisites

- **GitHub account** with this repo pushed. (Already done — repo lives at `github.com/TrishulMallur/TriAgent`.)
- **Vercel account** — free hobby tier, no credit card required. Sign up at https://vercel.com.
- **Railway account** — sign up at https://railway.com. Hobby plan includes $5/month of usage credit; after that it bills metered usage. A payment method is needed to verify the account but won't be charged inside the free credit.
- **(Optional)** Anthropic and/or Gemini API keys if you want real LLM responses instead of the deterministic mock. The mock provider produces realistic-looking results and lets the entire UI work — you can ship a portfolio demo without ever provisioning a key.

You do **not** need:
- Docker installed locally (Railway builds the image remotely from `backend/Dockerfile`).
- Node installed (Vercel builds in the cloud).
- A custom domain (both platforms give you a free `*.vercel.app` / `*.up.railway.app` URL).

---

## 2. Deploy frontend to Vercel (5–10 min)

### 2.1 Sign in
1. Open https://vercel.com in a browser.
2. Click **Sign Up** (top-right) and choose **Continue with GitHub**.
3. Authorize the Vercel GitHub app. On first sign-in, Vercel asks which repos it can read — you can grant "All repositories" or pick `TrishulMallur/TriAgent` specifically.

### 2.2 Import the repo
1. From the Vercel dashboard, click **Add New...** (top right) → **Project**.
2. Under "Import Git Repository", find `TrishulMallur/TriAgent` and click **Import**.
   - If you don't see it, click **Adjust GitHub App Permissions** and grant access to the repo.

### 2.3 Configure the project (almost everything auto-detects)
On the "Configure Project" screen Vercel will show:
- **Framework Preset:** should auto-detect as **Vite**. If it says "Other", manually change it to Vite.
- **Root Directory:** leave blank (the repo root contains `package.json`).
- **Build Command:** `npm run build` — Vercel fills this in automatically.
- **Output Directory:** `dist` — Vercel fills this in automatically.
- **Install Command:** `npm install` — automatic.

The repo ships with a `vercel.json` that contains SPA rewrite rules (so deep-link routes like `/exceptions/EX-123` don't 404 on hard refresh). Vercel reads this automatically — no UI action needed.

### 2.4 Skip env vars on the first deploy
Expand the **Environment Variables** section if it isn't already open. Leave it **empty** for now. The mock LLM provider works without configuration; we'll wire the backend URL in step 4 after Railway is up.

### 2.5 Deploy
1. Click **Deploy**. Vercel runs `npm install` + `npm run build` in the cloud (~90–120 seconds).
2. When it finishes you'll see a celebratory confetti screen and the deployment URL — something like `triagent-xyz.vercel.app`.
3. **Copy this URL and save it somewhere.** You'll need it in step 4 for the Railway CORS config.

### 2.6 Smoke test the deploy
1. Click **Visit** (or paste the URL into a new tab).
2. The dashboard should load with the TriAgent branding and the four pipeline cards.
3. Click the user avatar (top right) → switch to **Financial Advisor** → open **Advisor Notes**.
4. Click any **Compliant** sample → click **Analyze**.
5. After a moment a result panel should appear showing the CIRO compliance scores. Since no API keys are set, you'll see a **Using Mock Fallback** badge — that's expected.

If all of that works, the frontend is live. Move on to Railway.

---

## 3. Deploy backend to Railway (10–15 min)

Skip this section if you only want the frontend demo — the mock provider handles everything in-browser.

### 3.1 Sign in
1. Open https://railway.com.
2. Click **Login** → **Login with GitHub**.
3. Authorize the Railway GitHub app. Like Vercel, on first sign-in you grant access to either all repos or specific ones — grant access to `TrishulMallur/TriAgent`.

### 3.2 Create a project from the repo
1. From the Railway dashboard, click **New Project** (or **+ New**, depending on which dashboard variant you see).
2. Choose **Deploy from GitHub repo**.
3. Pick `TrishulMallur/TriAgent` from the list.

Railway detects the `railway.toml` at the repo root and uses `backend/Dockerfile` to build. You should see a deployment card appear in the project canvas and a build start automatically within a few seconds.

### 3.3 Wait for the build
1. Click into the service card to open the deployment view.
2. Watch the **Build Logs** tab. The first build takes 3–6 minutes — it installs system packages (including `tesseract-ocr` for OCR fallback), Python deps, and bakes the image.
3. When the status flips from **Building** → **Deploying** → **Active**, the service is up.

If the build fails, jump to [section 6 gotchas](#6-common-gotchas).

### 3.4 Expose the service to the public internet
By default, Railway services are only reachable inside the project's private network. We need a public domain.

1. In the service view, click the **Settings** tab.
2. Scroll to **Networking** → **Public Networking**.
3. Click **Generate Domain**. Railway picks a free `*.up.railway.app` URL.
4. **Copy the URL** (e.g., `triagent-backend-production.up.railway.app`). You'll need it in step 4 for the Vercel env var.

### 3.5 Smoke test the backend
Open a terminal (or use any HTTP client) and curl the health endpoint:

```bash
curl https://triagent-backend-production.up.railway.app/api/health
```

You should get a 200 with a JSON body roughly like `{"status":"ok"}`. If the response takes ~10 seconds the first time, that's a **cold start** — Railway's hobby tier puts the service to sleep when idle and spins it up on demand.

You can also visit the URL in a browser; FastAPI's auto-generated docs live at `/docs` (e.g., `https://triagent-backend-production.up.railway.app/docs`).

---

## 4. Wire Vercel ↔ Railway together (5 min)

Now we tell each platform about the other. This is the **chicken-and-egg** step — both deploys had to happen first to generate their URLs, and now we feed each URL into the other's environment.

### 4.1 Set Vercel env vars (frontend → knows where the backend lives)
1. Open the project on https://vercel.com.
2. Click **Settings** (in the project's top nav) → **Environment Variables** (left sidebar).
3. Add these three (one at a time — click **Save** after each, or use the bulk paste mode):

   | Key | Value | Notes |
   |---|---|---|
   | `VITE_USE_BACKEND` | `true` | Routes AI calls through Railway instead of calling LLM providers from the browser. |
   | `VITE_API_BASE_URL` | `https://triagent-backend-production.up.railway.app` | Your Railway URL from step 3.4. **No trailing slash.** |
   | `VITE_DEFAULT_PROVIDER` | `mock` | Defensive default; otherwise it tries `claude` first and falls back. Skip if you've configured real keys. |

   For each, leave the **Environment** dropdown set to all three (Production, Preview, Development) unless you have a reason to scope it.

4. Vite env vars are **baked at build time**, not read at runtime. You need to redeploy for the new values to take effect.
   - Click **Deployments** (project top nav).
   - On the latest deployment row, click the **⋯** menu → **Redeploy** → confirm **Use existing Build Cache** is **OFF** (so it picks up the new env vars) → **Redeploy**.
   - Wait ~90 seconds for the new build.

### 4.2 Set Railway env vars (backend → allows the Vercel origin through CORS)
1. Open the project on https://railway.com.
2. Click the service card → **Variables** tab.
3. Click **+ New Variable** and add:

   | Key | Value | Notes |
   |---|---|---|
   | `ALLOWED_ORIGINS` | `https://triagent-xyz.vercel.app` | Your Vercel URL from step 2.5. **Must match EXACTLY** — `https://` scheme, no trailing slash, no path. |
   | `GEMINI_API_KEY` *(optional)* | `AIza...` | If you want the backend to make real Gemini calls. |
   | `ANTHROPIC_API_KEY` *(optional)* | `sk-ant-...` | If you want the backend to make real Claude calls. |
   | `AI_PROVIDER` *(optional)* | `gemini` or `claude` | Backend's default provider. Falls back to mock if no key is set. |

4. Railway redeploys automatically when variables change (look for a new deployment kicking off in the Deployments tab). If it doesn't, click the service's latest deployment → **Redeploy**.

**Pro tip for multiple Vercel URLs:** if you also want Preview deploys to reach the backend, set `ALLOWED_ORIGINS` to a comma-separated list, e.g., `https://triagent-xyz.vercel.app,https://triagent-xyz-git-feature.vercel.app`. The backend's CORS middleware splits on commas.

---

## 5. End-to-end smoke test

With both redeploys finished:

1. Open your Vercel URL in a browser. Open **DevTools → Network** tab so you can watch requests.
2. Navigate to **Settings → AI Provider**. If you configured real keys on Railway, you can switch the provider to **Backend** here; otherwise leave it on **Claude** (it'll fall back to the mock cleanly).
3. Go to **Advisor Notes**, pick a sample note, and click **Analyze**.
4. In the Network tab you should see a request firing against your **Railway URL** (e.g., `triagent-backend-production.up.railway.app/api/...`). Status should be 200; response time will be slow (~10s) on the very first call due to Railway's cold start, then fast on subsequent calls.
5. If you didn't set `VITE_USE_BACKEND=true`, requests go to Anthropic / Google directly (or to the in-browser mock), and you'll see no traffic to Railway at all — that's the in-browser path.

If you see the analysis result render and the network request hit Railway, the wiring is complete.

---

## 6. Common gotchas

### "404 NOT_FOUND" when refreshing a deep-link page on Vercel
The repo ships a `vercel.json` with SPA rewrites that route every path to `/index.html`. If you see a 404 on `/exceptions/EX-123`, verify `vercel.json` was committed and present at the repo root. Trigger a redeploy after confirming.

### Railway build fails on `pymupdf` or `tesseract`
The backend uses PyMuPDF for PDF parsing and Tesseract for OCR fallback on scanned images. Both require system packages that the `backend/Dockerfile` installs via `apt-get`. If a build fails here, check the Dockerfile is committed and Railway is reading from `backend/Dockerfile` (look at the Build Logs for `Using Dockerfile: backend/Dockerfile`).

### Railway service returns 502 / crashes on startup
Open the service → **Logs** tab. Common causes:
- Missing environment variable that the FastAPI startup expects (Railway will surface the Python traceback).
- Port binding — FastAPI must bind to `0.0.0.0:$PORT` where `$PORT` is injected by Railway. The Dockerfile's `CMD` already does this; don't override it via the Railway UI.

### Browser console shows `CORS error: No 'Access-Control-Allow-Origin' header`
The `ALLOWED_ORIGINS` value on Railway doesn't match the Vercel URL exactly. Things to check:
- Scheme is `https://` not `http://`.
- No trailing slash.
- No path (just `https://triagent-xyz.vercel.app`, never `https://triagent-xyz.vercel.app/`).
- If you're testing from a Preview deploy URL, that exact URL must be in the list too — Vercel Preview URLs are different from Production URLs.

### Cold starts on Railway
The hobby tier puts your service to sleep after a period of inactivity. First request after a cold period takes ~10 seconds. For a portfolio demo this is fine — once a recruiter clicks around for 30 seconds, everything's warm. To eliminate cold starts, either:
- Upgrade to Railway's **Pro** plan, or
- Configure an external uptime ping (e.g., UptimeRobot) hitting `/api/health` every 5 minutes, or
- In service Settings → **Deploy** → set **Sleep when idle** to **Never** (this burns more of your $5 monthly credit).

### Vercel deploy succeeds but the page shows a blank screen
Open DevTools → Console. Most common cause is a missing `VITE_*` env var that the build expected. Remember: Vite env vars are inlined at **build time**, so after changing them on Vercel you must trigger a redeploy with **Use existing Build Cache: OFF**.

### Backend works on `/api/health` but advisor-note calls fail
Open the Network tab and inspect the failing request. If it's a 4xx from the backend (not a CORS issue), check the Railway service logs — usually it's a missing `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` and the backend doesn't have the mock fallback path that the frontend has. Either provision the key on Railway or leave `VITE_USE_BACKEND=false` so the browser handles AI calls directly.

---

## 7. Cost expectations

### Vercel (Hobby plan)
- **$0/month.** No credit card on file.
- Includes: 100 GB bandwidth, unlimited deployments, automatic HTTPS, preview deploys per branch.
- This is enough for a portfolio demo with light to moderate traffic.

### Railway (Hobby plan)
- **$5/month of usage credit included.** Bills metered usage above that.
- The FastAPI service idle (CPU mostly asleep, ~256MB RAM allocated) consumes roughly **$0.10/day**, so left running 24/7 you're at ~$3/month — within the free credit.
- Cold storage of build images and logs is negligible (cents per month).
- To minimize spend further: enable **Sleep when idle** in service Settings → Deploy. The service spins down after a period without traffic and back up on the next request (the ~10s cold start you saw in step 3.5).

### LLM API costs (only if you wire real keys)
- **Anthropic Claude** — pay-per-token. A single advisor-note analysis costs roughly $0.01–0.03 with Claude Sonnet.
- **Google Gemini** — has a generous free tier on most models; you may not pay anything for portfolio-level traffic.
- The app's **Settings → Session Usage** card shows token + cost totals across the active session so you can sanity-check spend.

### Custom domain (optional)
- Vercel: free, just point a CNAME at `cname.vercel-dns.com`.
- Railway: included on hobby tier; configure under service Settings → Networking → Custom Domain.

---

That's it. Open an issue on the repo if any of these steps drift out of date with the Vercel/Railway UIs.

---

## CLI-driven deploy (recommended)

If you have the [`vercel`](https://vercel.com/docs/cli) and [`railway`](https://docs.railway.com/develop/cli) CLIs installed, the whole deploy collapses to a handful of commands. The click-through walkthrough above is the fallback; this is the fast path.

### Backend → Railway

```bash
cd backend
railway login                 # opens a browser, one-time
railway init                  # creates a project + service, reads railway.toml
railway up --detach           # builds backend/Dockerfile remotely, streams logs
railway domain                # prints the public *.up.railway.app URL — save it
```

Then, once the Vercel URL exists (next step):

```bash
railway variables set ALLOWED_ORIGINS="https://<vercel-app>.vercel.app"
# Optional — enable auth on the backend so only your frontend can hit it:
# railway variables set BACKEND_API_KEY="<some-shared-secret>"
```

### Frontend → Vercel

Run these from the repo root (where `package.json` and `vercel.json` live):

```bash
vercel                                                    # first deploy, interactive — answers: Vite, Y, defaults
vercel env add VITE_API_BASE_URL production               # paste the Railway URL, no trailing slash
vercel env add VITE_USE_BACKEND production                # paste: true
vercel --prod                                             # redeploy so the new build bakes the env vars in
```

Vite inlines `VITE_*` at build time, which is why `vercel --prod` (a fresh build) is required after `vercel env add`. Just running `vercel` again without `--prod` would only update the Preview deploy.

### Wire them together

The two deploys form a loop — each needs the other's URL, and neither URL exists until its deploy runs. The order above resolves the chicken-and-egg: Railway first (gives you a backend URL), then Vercel (gives you a frontend URL), then one `railway variables set` to close the loop.

- **Railway needs:** `ALLOWED_ORIGINS` = your Vercel production URL. Without it, the backend's CORS middleware rejects the browser's request with a 403.
- **Vercel needs:** `VITE_API_BASE_URL` = your Railway URL (no trailing slash), plus `VITE_USE_BACKEND=true` to route AI calls through the proxy instead of calling providers from the browser.
- If you also want Vercel *Preview* deploys (per-branch URLs) to reach the backend, make `ALLOWED_ORIGINS` a comma-separated list that includes each preview URL you care about.

### First smoke test

1. **Visit the Vercel URL with no key pasted.** The dashboard should load and the top-right badge should read **Mock** (or **Using Mock Fallback**). This proves the frontend is live and the zero-config path works.
2. **Open Settings → paste your Claude API key.** The badge should flip to **Claude (your key)** (or similar — exact label depends on the provider badge component). This proves the runtime key UI is wired into the provider pipeline.
3. **Ingest a test PDF** (any short document). The analysis panel should fill in with a real LLM response — not the deterministic mock text — and the Audit Log page should show a new row for the call. This proves the Railway proxy path end-to-end.

If step 3 times out on the very first try, wait ~10s and retry — Railway hobby-tier services cold-start after idle.

### A note on `audit.db` persistence

Railway's hobby tier gives you an **ephemeral filesystem** — every restart wipes `audit.db` and any other file the backend wrote to disk. For a portfolio demo this is fine: the audit log repopulates on every new call, and nobody depends on it surviving a deploy. If this becomes an operational app, the fix path is a Railway [Volume](https://docs.railway.com/guides/volumes) mounted at the directory where `audit.db` lives — a one-line `railway volume create` plus a `mount` path in `railway.toml`. Document that for prod; skip it for the demo.
