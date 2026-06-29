# Migration: Two Independent Deployments (Hono API + Next.js Web)

Splits the app into two independently deployable units sharing one repo:

- **`backend/`** — standalone **Hono** API server (`backend/server/`), owns Prisma +
  the DB, issues/validates JWT bearer tokens. Deploys to any Node host.
- **`frontend/` + `src/app`** — the Next.js web app, no DB access, calls the API
  over HTTP with a bearer token. Deploys to Vercel.
- **`packages/shared`** — roles + 51-permission RBAC map + types (already builds).

> **Verified now:** the folder split, the frontend bearer client, and shared all
> **typecheck clean**. The Hono server files are written to spec but **cannot be
> compiled in this environment** (Hono isn't installed, no network). Install +
> verify per §6.

---

## What's already in place

| Piece | File | State |
|-------|------|-------|
| Shared RBAC/types | `packages/shared/src/*` | ✅ builds |
| Server logic | `backend/services/*`, `backend/{prisma,validations,rbac,…}.ts` | ✅ reused verbatim |
| API auth (JWT) | `backend/server/auth.ts` | written (jose) |
| HTTP helpers / error map | `backend/server/http.ts` | written |
| Server bootstrap | `backend/server/main.ts` | written (CORS, mounts /api/*) |
| Reference routes | `backend/server/routes/{auth,orders,dashboard}.ts` | written |
| Frontend bearer client | `frontend/lib/fetcher.ts` + `auth-token.ts` | ✅ typechecks |
| API tsconfig/package | `backend/tsconfig.json`, `backend/package.json` | written |

---

## 1. Install + generate (networked machine)

```bash
cd backend && npm install                # installs the API's own deps (hono, jose, …)
npm run prisma:generate                  # generates client from ../prisma/schema.prisma
```

`backend/package.json` already lists deps: `hono`, `@hono/node-server`, `jose`,
`@prisma/client`, `bcryptjs`, `zod`, plus pdfkit/papaparse/nodemailer for
exports.

## 2. Port the remaining ~51 routes (mechanical)

Each `src/app/api/**/route.ts` → a Hono route module in
`backend/server/routes/`. The pattern is fixed — see
`routes/orders.ts` as the reference:

```ts
// Monolith handler:
export async function GET(req: NextRequest) {
  await requirePermission("order:read");
  const { page, pageSize, q } = paginationSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  ...
  return ok(items, pageMeta(...));
}
// Hono equivalent:
orders.get("/", requireAuth, requirePermission("order:read"), async (c) => {
  const { page, pageSize, q } = paginationSchema.parse(c.req.query());
  ...
  return ok(c, items, pageMeta(...));
});
```

Mechanical substitutions:
| Monolith | Hono |
|----------|------|
| `requirePermission("x")` (call) | `requireAuth, requirePermission("x")` (middleware args) |
| `req.nextUrl.searchParams` | `c.req.query()` |
| `await req.json()` | `await c.req.json()` |
| `params: Promise<{id}>` | `c.req.param("id")` |
| `user.id` (from session) | `c.get("user").id` |
| `ok(data, meta)` / `created(data)` | `ok(c, data, meta)` / `created(c, data)` |
| action POSTs `{action:'post'}` | same body-discriminant, in the handler |

**Services, Zod schemas, prisma, RBAC, logActivity — all imported unchanged**
from `@backend/*` / `@fleeterp/shared`. Then mount in `main.ts`:
`app.route("/api/trips", trips)` etc.

Driver isolation (`job:read` own-jobs-only): pass `c.get("user").driverId` into
the query, as the monolith did with the session driverId.

## 3. Frontend auth changes (replace NextAuth)

Already done: `fetcher.ts` prepends `NEXT_PUBLIC_API_URL` and attaches
`Authorization: Bearer <token>`; `auth-token.ts` stores it. Remaining:

1. **Login page** (`src/app/(auth)/login`): POST to `/api/auth/login`, on success
   `setToken(res.accessToken)` and redirect to `/dashboard`. Remove the
   `next-auth/react` signIn call.
2. **Route guard**: `src/middleware.ts` did cookie-session RBAC. With a bearer
   token the server middleware can't read it, so guard on the client: a layout
   effect calls `/api/auth/me`; on 401 → `/login`. Keep nav filtering with
   `can(role, perm)` from `@fleeterp/shared`.
3. **Server Components reading Prisma directly** → convert to client components
   that `apiFetch`, or fetch server-side forwarding the token. (List/detail pages
   that currently `import { prisma }` are the ones to change.)
4. **Remove** `src/auth.ts`, `src/auth.config.ts`, `next-auth` dep, and the
   NextAuth API route once login is swapped.

## 4. Env contract

| App | Vars |
|-----|------|
| backend | `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES=1d`, `CORS_ORIGIN=https://web…`, `PORT=4000` |
| frontend | `NEXT_PUBLIC_API_URL=https://api…` |

`CORS_ORIGIN` (comma-separated) is already wired in `main.ts`.

## 5. Two deployments

- **API** → Railway / Render / Fly / VPS running `npm run build && npm start`
  (`node dist/server/main.js`) with the backend env vars.
- **Web** → Vercel with `NEXT_PUBLIC_API_URL` → the API origin.
- Uploads still local-disk → move to object storage in the API (see DEPLOY.md).

## 6. Verify

```bash
# API
cd backend && npm run build && npm start &        # :4000
curl -s localhost:4000/api/health                  # {"ok":true}
TOKEN=$(curl -s -XPOST localhost:4000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@fleetflow.local","password":"admin1234"}' | jq -r .data.accessToken)
curl -s localhost:4000/api/orders -H "Authorization: Bearer $TOKEN" | jq .meta
# Web
NEXT_PUBLIC_API_URL=http://localhost:4000 npm run dev   # :3000 → login → dashboard
```

Recommended order: install → verify the auth+orders+dashboard slice end-to-end →
port the remaining route modules → swap the login page + guard → convert the
server-Prisma pages → delete `src/app/api/*` + NextAuth.

## 7. Cutover

Once all routes are ported and the web app reads only via the API: delete
`src/app/api/*`, `src/auth*.ts`, `src/middleware.ts`, drop `next-auth` from the
web package, and the two apps deploy independently.
