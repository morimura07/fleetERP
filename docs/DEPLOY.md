# Deploying FleetFlow

FleetFlow is **two independently-deployable apps**, not one:

| App | What it is | Needs |
|-----|------------|-------|
| `backend/` | Hono API server — owns Prisma and **all** database access | Node process + PostgreSQL |
| `frontend/` | Next.js 15 (App Router) web app — talks to the API over HTTP | Node process (or Vercel) |

The frontend holds **no** database credentials. Every read/write goes through the
API. So the two apps must be able to reach each other, and CORS must allow the
browser origin — most first-deploy failures are one of those two things.

> **Note:** this project used to be a single Next.js monolith. Older instructions
> that deploy "the app" to Vercel with a root `vercel.json` are obsolete — that
> layout no longer exists.

---

## 1. Environment variables

### `backend/.env`

| Variable | Production value |
|----------|------------------|
| `DATABASE_URL` | PostgreSQL connection string. On Neon use the **pooled** URL (`...-pooler...`). |
| `JWT_SECRET` | `openssl rand -base64 32` — the API signs bearer tokens with this |
| `JWT_EXPIRES` | e.g. `1d` |
| `PORT` | e.g. `4000` |
| `CORS_ORIGIN` | **Public origin of the frontend**, comma-separated if several. Must match exactly, including scheme and port. |
| `APP_URL` | Public frontend URL (used to build links in emails) |
| `SMTP_*` | Mail provider settings (optional until password reset is needed) |
| `UPLOAD_DIR` | Filesystem path for uploads — see the caveat at the end |

### `frontend/.env`

| Variable | Production value |
|----------|------------------|
| `AUTH_SECRET` | `openssl rand -base64 32`. **Required** — Auth.js v5 refuses to start without it. |
| `AUTH_URL` | Public origin of **this** web app, e.g. `https://fleet.example.com`. Must match the real origin or login callbacks / CSRF fail. |
| `API_URL` | Backend base URL as reachable **from the server** (may be private, e.g. `http://127.0.0.1:4000`) |
| `NEXT_PUBLIC_API_URL` | Backend base URL as reachable **from the browser**. Must be publicly routable — never `localhost` unless you only ever browse from the server itself. |

> `API_URL` and `NEXT_PUBLIC_API_URL` are frequently **different**. The server can
> use a loopback address; the browser cannot. Getting this wrong yields a page
> that renders but whose client-side actions all fail.

`trustHost: true` is already set in `frontend/auth.config.ts`, so deploying
behind a reverse proxy or a bare IP needs no extra configuration.

---

## 2. Database migrations

Run from `backend/`, against the target database:

```bash
DATABASE_URL="<prod-url>" npm run prisma:deploy   # prisma migrate deploy
```

Do this **on every deploy that adds a migration**, before starting the API. A
schema older than the code makes the API return 500s, which surface in the UI as
failed page loads.

Check state at any time:

```bash
DATABASE_URL="<prod-url>" npx prisma migrate status
```

Seeding is for a **fresh** database only — chart of accounts, the 5 system roles
and the permission catalogue, plus demo records:

```bash
DATABASE_URL="<prod-url>" npm run prisma:seed
```

> The seed is idempotent but intended for first run. Do not point it at a
> database that already holds real data.

---

## 3. Deploying

### Option A — one Linux server (e.g. a DigitalOcean droplet)

Both apps on one box, API kept private, Nginx terminating TLS.

```bash
# backend
cd backend && npm ci && npx prisma generate
DATABASE_URL=... npm run prisma:deploy
pm2 start "npm run start" --name fleetflow-api

# frontend
cd ../frontend && npm ci && npm run build
pm2 start "npm run start" --name fleetflow-web
```

With Nginx serving the web app on `https://fleet.example.com` and proxying
`/api` to `127.0.0.1:4000`:

```
# backend
CORS_ORIGIN=https://fleet.example.com
# frontend
AUTH_URL=https://fleet.example.com
API_URL=http://127.0.0.1:4000
NEXT_PUBLIC_API_URL=https://fleet.example.com/api
```

If you expose the API on its own port instead of proxying, set
`NEXT_PUBLIC_API_URL=http://<host>:4000` and open that port in the firewall.

### Option B — Vercel (frontend) + a Node host (backend)

Vercel suits the Next.js app; the API is a long-running server, so host it where
a process stays alive (Railway, Render, Fly, a VM).

1. Deploy `backend/` to the Node host, set its env vars, note its public URL.
2. Import `frontend/` into Vercel with the **root directory set to `frontend/`**.
3. Set the frontend env vars in Vercel (Production scope), pointing `API_URL` and
   `NEXT_PUBLIC_API_URL` at the API's public URL.
4. Set `CORS_ORIGIN` on the backend to the Vercel domain and redeploy it.

On serverless, always use the **pooled** database URL.

---

## 4. Smoke check

1. `curl https://<api-host>/api/lookups/clients` → expect **401** (reachable, auth
   enforced). A connection error or 404 means the API is down or the URL is wrong.
2. Open `https://<web-host>/login` and sign in — seeded admin is
   `admin@fleetflow.local` / `admin1234`.
3. Load the dashboard, then a Phase 6 screen (`/quotes`, `/projects`, `/planning`, `/pos`).
4. Open **Roles & Permissions** (`/roles`) to confirm the RBAC tables are migrated
   and seeded.

---

## 5. Troubleshooting

### "Application error: a server-side exception has occurred"

The app renders a diagnostic error page rather than a bare digest, but the stack
trace lives only in the server log. Find it by the digest shown on the page:

```bash
pm2 logs fleetflow-web --lines 200     # or: docker logs <container>
```

Most common causes, in order:

1. **`AUTH_SECRET` unset** — Auth.js throws on every request.
2. **`AUTH_URL` doesn't match** the origin you're browsing.
3. **`API_URL` unreachable** — server components fail. The error names the URL it tried.
4. **Migrations not applied** — the API 500s and pages that depend on it fail.

### Pages load but every action fails, CORS errors in the console

`NEXT_PUBLIC_API_URL` isn't browser-reachable, or `CORS_ORIGIN` on the backend
doesn't exactly match the site origin (scheme and port included).

### Login says "invalid credentials" with correct details

The frontend can't reach the API — login is delegated to `POST /api/auth/login`.
Verify `API_URL` **from the web server itself**, e.g. `curl $API_URL/api/auth/login`.

---

## Known limitation: file uploads

Proof-of-delivery uploads are written to the local filesystem (`UPLOAD_DIR`,
handled by [backend/src/routes/uploads.ts](../backend/src/routes/uploads.ts)).

On a single persistent server this is fine — just keep `UPLOAD_DIR` on a volume
that survives redeploys and is backed up. On ephemeral or multi-instance hosting
(Vercel, autoscaled containers) uploaded files vanish or are missing from some
instances; move them to object storage (S3, Cloudflare R2, Vercel Blob) before
relying on the feature there.
