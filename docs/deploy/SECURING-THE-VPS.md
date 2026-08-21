# Securing the demo VPS

The server at `165.22.20.55` runs on plain HTTP with the seeded passwords, which
are published in the seed output and in the verification guide. That is fine for
a throwaway demo and **not** fine once two real customers have their own data in
it, because `root@fleetflow.local` reaches across every tenant boundary.

Three jobs, in this order. Budget about an hour.

---

## 1. Rotate the seeded credentials

The application has no admin password-change route — users are created with a
password, or reset themselves by email, which needs working SMTP. Use the
maintenance script instead:

```bash
cd backend

npm run set-password -- root@fleetflow.local  "<a long random password>"
npm run set-password -- admin@fleetflow.local "<a different one>"
```

It prints the database it is writing to (credentials stripped) before making the
change — check that line, since running a rotation against the wrong environment
is easy to do and hard to notice. It also clears any outstanding reset token, so
an old reset email cannot undo the rotation.

Generate passwords with `openssl rand -base64 24`. Store them somewhere other
than Telegram.

**Give each customer administrator their own login.** A shared admin account
makes the audit log useless and means revoking one person means revoking all.

---

## 2. HTTPS

Let's Encrypt will not issue for a bare IP address, but `sslip.io` resolves any
IP-shaped hostname back to that IP — so `165.22.20.55.sslip.io` is a real DNS
name pointing at the server and can be certified. No domain purchase required.

On the VPS:

```bash
# Caddy (Debian/Ubuntu)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# Config from this directory
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtains and renews the certificates by itself. Confirm with:

```bash
curl -I https://165.22.20.55.sslip.io
```

### Then update the environment

Both apps must be told their public URLs, or sign-in and API calls will still
point at plain HTTP.

`backend/.env`:

```ini
CORS_ORIGIN="https://165.22.20.55.sslip.io"
APP_URL="https://165.22.20.55.sslip.io"
```

`frontend/.env`:

```ini
AUTH_URL="https://165.22.20.55.sslip.io"
API_URL="https://api.165.22.20.55.sslip.io"
NEXT_PUBLIC_API_URL="https://api.165.22.20.55.sslip.io"
```

`NEXT_PUBLIC_API_URL` is baked in at build time, so the frontend must be rebuilt
after changing it:

```bash
cd frontend && npm run build && pm2 restart <web-process>
cd ../backend && pm2 restart <api-process>
```

Then close the direct ports so nobody can reach the apps over HTTP any more:

```bash
sudo ufw allow 80,443/tcp
sudo ufw deny 3000/tcp
sudo ufw deny 4000/tcp
```

Send Priyam the new link: `https://165.22.20.55.sslip.io`

---

## 3. Separate the databases

Local development and the VPS currently share one Neon database
(`ep-twilight-union-avlqp9tq`). Every local seed, migration and test run touches
what is about to be live customer data.

In the Neon console, create a **branch** from the main database, then point the
local `backend/.env` `DATABASE_URL` at the branch and leave the main one to the
server.

Do this before the two companies are onboarded. Afterwards it means copying live
customer data around, which is a different and much less pleasant job.

---

## Still open

**There is no password-change screen in the application.** The script covers
administrators, but a customer who wants to reset a user's password has no way
to do it unless SMTP is configured for the forgot-password flow. Worth either
configuring SMTP on the VPS or adding an admin reset action before handover.
