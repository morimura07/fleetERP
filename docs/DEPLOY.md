# Deploying to Vercel

FleetFlow is a Next.js 15 (App Router) server app backed by PostgreSQL (Neon).
This guide covers a production deploy on Vercel.

## Prerequisites

- A Vercel account + the CLI: `npm i -g vercel`
- A production PostgreSQL database (your existing **Neon** instance works).
  Use the **pooled** connection string for the app.
- An SMTP provider for password-reset / notification mail (optional at first).

## 1. Configure environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (Production scope).
Mirror the keys in [.env.example](../.env.example):

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Neon **pooled** connection string (`...-pooler...`) |
| `AUTH_SECRET` | generate: `openssl rand -base64 32` |
| `AUTH_URL` | `https://<your-app>.vercel.app` |
| `NEXTAUTH_URL` | same as `AUTH_URL` |
| `APP_URL` | same as `AUTH_URL` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | your mail provider |

> `AUTH_URL` / `NEXTAUTH_URL` **must** match the deployed HTTPS domain or login
> (NextAuth callbacks + CSRF) will fail. Update them if you add a custom domain.

## 2. Migrations

`vercel.json` sets the build command to run migrations before building:

```
prisma migrate deploy && prisma generate && next build
```

So schema changes apply automatically on each deploy. The **first** deploy will
create all tables on the production DB. If you'd rather run it manually once:

```bash
DATABASE_URL="<prod-pooled-url>" npx prisma migrate deploy
```

To load the demo data (chart of accounts, sample records) on a fresh DB:

```bash
DATABASE_URL="<prod-url>" npm run prisma:seed
```

> ⚠️ Run the seed **only** against an empty database — it is guarded against
> duplicates but is intended for first-run / demo, not an existing dataset.

## 3. Deploy

```bash
vercel          # first run links the project + a preview deploy
vercel --prod   # promote to production
```

Or connect the Git repo in the Vercel dashboard for push-to-deploy.

## 4. Post-deploy smoke check

1. Visit `https://<your-app>.vercel.app/login`
2. Log in (seeded): `admin@fleetflow.local` / `admin1234`
3. Confirm the dashboard, ledger, and a Phase 2/3 screen load.

---

## ⚠️ Known limitation: file uploads

Proof-of-delivery image uploads currently write to the **local filesystem**
(`UPLOAD_DIR=./public/uploads`, see [src/app/api/uploads/route.ts](../src/app/api/uploads/route.ts)).
Vercel's filesystem is **ephemeral** — uploaded files vanish on the next deploy
or cold start and are not shared across serverless instances.

**Before relying on uploads in production**, move them to object storage:

- **Vercel Blob** (`@vercel/blob`) — simplest on Vercel
- **Cloudflare R2** / **AWS S3** — portable, cheaper at scale

This is a code change to the upload handler (swap the `fs.writeFile` for an
object-storage `put`) — track it as a follow-up. Everything else runs cleanly
on Vercel as-is.

## Notes

- **No `output: standalone` needed** — Vercel builds Next natively.
- **Prisma on Vercel**: `prisma generate` runs in the build command above, so the
  client is generated fresh each deploy (required — Vercel caches `node_modules`).
- **Connection pooling**: always use Neon's pooled URL on serverless to avoid
  exhausting Postgres connections under concurrent lambda invocations.
