# Outline Dashboard

A self-hosted web UI for managing one or more [Outline VPN](https://getoutline.org) servers. Built with Next.js.

## Why

Outline's official manager is a desktop app — you're stuck on one machine to manage keys. This gives you a browser-based dashboard accessible from any phone, tablet, or laptop. It also supports multiple Outline servers from a single interface.

## Features

- **Multi-server dashboard** — manage multiple Outline servers from one place with live status cards
- Add and delete access keys from any browser
- Inline rename for keys and server names
- Per-key data limits — set, update, or remove
- Data usage per key with visual progress bars
- Traffic share breakdown across all keys
- QR codes for easy mobile key sharing
- Server info: hostname, version, port, cipher, uptime
- Flags top consumer, unused keys, and keys over their limit
- Authentication via Authelia + Traefik

---

## How It Works

### Single server (simplest path)

Set `OUTLINE_API_URL` in `.env` and run the app. On first start, `data/servers.json` is auto-created with that server pre-loaded. You'll land on the dashboard with one server card ready to go — no extra setup needed. This means anyone who forks this repo to manage one server can just set their env and go.

### Multiple servers

Add servers through the dashboard UI by pasting their API URLs. Each server is saved in `data/servers.json`. The API URLs (which contain your secret tokens) are stored only on disk — **they are never sent to the browser**. The client only ever receives safe fields: `id`, `name`, `addedAt`.

### Page structure

```
/                  → Dashboard — all servers, live status, add/remove
/server/[id]       → Detail page — keys, usage, limits, rename
```

---

## Security

### servers.json protection

| Layer | Detail |
|---|---|
| Not web-accessible | `data/` is outside `public/` — Next.js never serves it over HTTP |
| File permissions | Written with mode `0600` — owner read/write only |
| Never sent to browser | All API routes call `safeServer()` which strips `apiUrl` before responding |
| Gitignored | `data/` is in `.gitignore` — can never be accidentally committed |
| Docker volume | In production, `data/` is a named volume — never baked into the image |

### API tokens

- `OUTLINE_API_URL` lives in `.env` (server-side only). Never use `NEXT_PUBLIC_` prefix.
- `.env` is excluded from the Docker image via `.dockerignore`.
- Secrets are injected at container runtime via `env_file` in `docker-compose.yml`.

---

## Requirements

- Node.js 18+
- An Outline server and its Management API URL

> **Finding your API URL:** In the Outline Manager desktop app, click the three-dot menu → "View server config" → copy the `apiUrl` value. It looks like `https://1.2.3.4:39992/sometoken`.

---

## Local Development

```bash
git clone https://github.com/chitminthu/outline-manager-web
cd outline-manager-web
npm install
npm install qrcode.react
```

Create `.env`:

```env
OUTLINE_API_URL=https://your-server-ip:port/your-api-prefix
AUTH_ENABLED=false
```

Make sure `data/` is in your `.gitignore`:

```
data/
```

Run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`data/servers.json` is created automatically on first run. To add more servers, click **+ Add Server** on the dashboard.

---

## Production Deployment

### Step 1 — Server setup

```bash
ssh root@your-server
apt update && apt install -y docker.io docker-compose-plugin ufw

ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### Step 2 — Directory layout

```bash
mkdir -p /opt/outline-stack/{traefik/certs,authelia/{config,secrets},app,data}
cd /opt/outline-stack
```

```
/opt/outline-stack/
├── docker-compose.yml
├── data/                        ← servers.json lives here (mounted as volume)
├── traefik/
│   ├── traefik.yml
│   ├── dynamic.yml
│   └── certs/acme.json
├── authelia/
│   ├── config/
│   │   ├── configuration.yml
│   │   └── users_database.yml
│   └── secrets/
└── app/                         ← git clone goes here
    ├── .env
    └── Dockerfile
```

### Step 3 — Clone the app

```bash
git clone https://github.com/chitminthu/outline-manager-web /opt/outline-stack/app
```

### Step 4 — App environment

```bash
cat > /opt/outline-stack/app/.env << 'EOF'
OUTLINE_API_URL=https://your-server-ip:port/your-token
AUTH_ENABLED=true
NODE_ENV=production
EOF
chmod 600 /opt/outline-stack/app/.env
```

### Step 5 — Dockerfile

`app/Dockerfile`:

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV OUTLINE_API_URL=http://placeholder
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

`app/.dockerignore`:

```
.env
.env.*
.env.local
node_modules
.next
data/
```

`next.config.js`:

```js
const nextConfig = {
  output: 'standalone',
};
module.exports = nextConfig;
```

### Step 6 — Traefik config

`traefik/traefik.yml`:

```yaml
api:
  dashboard: false

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

providers:
  docker:
    exposedByDefault: false
  file:
    filename: /dynamic.yml

certificatesResolvers:
  letsencrypt:
    acme:
      email: your@email.com
      storage: /certs/acme.json
      httpChallenge:
        entryPoint: web
```

`traefik/dynamic.yml`:

```yaml
http:
  middlewares:
    authelia:
      forwardAuth:
        address: "http://authelia:9091/api/verify?rd=https://auth.yourdomain.com"
        trustForwardHeader: true
        authResponseHeaders:
          - Remote-User
          - Remote-Groups
          - Remote-Name
          - Remote-Email
```

```bash
touch /opt/outline-stack/traefik/certs/acme.json
chmod 600 /opt/outline-stack/traefik/certs/acme.json
```

### Step 7 — Authelia config

`authelia/config/configuration.yml`:

```yaml
theme: dark
server:
  address: 'tcp://0.0.0.0:9091'
log:
  level: info
authentication_backend:
  file:
    path: /config/users_database.yml
access_control:
  default_policy: deny
  rules:
    - domain: outline.yourdomain.com
      policy: one_factor
    - domain: auth.yourdomain.com
      policy: bypass
session:
  cookies:
    - name: authelia_session
      domain: yourdomain.com
      authelia_url: https://auth.yourdomain.com
storage:
  local:
    path: /config/db.sqlite3
notifier:
  filesystem:
    filename: /config/notifications.txt
```

Generate a password hash:

```bash
docker run authelia/authelia:latest authelia crypto hash generate argon2 --password 'yourpassword'
```

`authelia/config/users_database.yml`:

```yaml
users:
  youruser:
    displayname: "Your Name"
    password: "$argon2id$..."
    email: your@email.com
    groups: []
```

Authelia secrets:

```bash
openssl rand -hex 32 > /opt/outline-stack/authelia/secrets/jwt_secret
openssl rand -hex 32 > /opt/outline-stack/authelia/secrets/session_secret
openssl rand -hex 32 > /opt/outline-stack/authelia/secrets/storage_encryption_key
chmod 600 /opt/outline-stack/authelia/secrets/*
```

### Step 8 — docker-compose.yml

```yaml
networks:
  proxy:
    external: true

services:

  traefik:
    image: traefik:v3.3
    container_name: traefik
    restart: unless-stopped
    networks: [proxy]
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik/traefik.yml:/traefik.yml:ro
      - ./traefik/certs:/certs
      - ./traefik/dynamic.yml:/dynamic.yml:ro

  authelia:
    image: authelia/authelia:latest
    container_name: authelia
    restart: unless-stopped
    networks: [proxy]
    volumes:
      - ./authelia/config:/config
      - ./authelia/secrets:/secrets
    environment:
      - AUTHELIA_IDENTITY_VALIDATION_RESET_PASSWORD_JWT_SECRET_FILE=/secrets/jwt_secret
      - AUTHELIA_SESSION_SECRET_FILE=/secrets/session_secret
      - AUTHELIA_STORAGE_ENCRYPTION_KEY_FILE=/secrets/storage_encryption_key
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.authelia.rule=Host(`auth.yourdomain.com`)"
      - "traefik.http.routers.authelia.entrypoints=websecure"
      - "traefik.http.routers.authelia.tls.certresolver=letsencrypt"
      - "traefik.http.services.authelia.loadbalancer.server.port=9091"

  outline-app:
    build:
      context: ./app
      dockerfile: Dockerfile
    image: outline-manager:latest
    container_name: outline-app
    restart: unless-stopped
    networks: [proxy]
    env_file: ./app/.env
    volumes:
      - ./data:/app/data        # persists servers.json across container rebuilds
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.outline.rule=Host(`outline.yourdomain.com`)"
      - "traefik.http.routers.outline.entrypoints=websecure"
      - "traefik.http.routers.outline.tls.certresolver=letsencrypt"
      - "traefik.http.services.outline.loadbalancer.server.port=3000"
      - "traefik.http.routers.outline.middlewares=authelia@file"
```

### Step 9 — Deploy

```bash
docker network create proxy
cd /opt/outline-stack
docker compose build --no-cache outline-app
docker compose up -d
docker compose logs -f
```

### Update after a git push

```bash
cd /opt/outline-stack/app && git pull
cd /opt/outline-stack
docker compose build --no-cache outline-app
docker compose up -d outline-app
```

> `servers.json` is in `./data/` on the host (mounted as a volume), so it survives container rebuilds and `docker compose down` cycles.

### Security check after deploy

```bash
# 1. Confirm .env is not in the image
docker run --rm outline-manager:latest cat /app/.env 2>&1
# Expected: No such file or directory

# 2. Confirm servers.json is not in the image
docker run --rm outline-manager:latest cat /app/data/servers.json 2>&1
# Expected: No such file or directory (it's a volume mount, not baked in)

# 3. Confirm env is injected at runtime
docker exec outline-app env | grep OUTLINE
# Expected: OUTLINE_API_URL=https://...

# 4. Check file permissions
ls -la /opt/outline-stack/app/.env
ls -la /opt/outline-stack/data/servers.json
# Both should show -rw------- (600)

# 5. Confirm Outline API port is blocked
ufw status | grep 39992
# Should show DENY or not appear (only 22/80/443 open)
```

---

## Authentication

`AUTH_ENABLED=true` enables auth checks on all API routes. Traefik forwards requests through Authelia — after login, Authelia injects a `Remote-User` header which the middleware validates server-side.

`AUTH_ENABLED=false` skips all auth checks. Use this for local development only.

---

## Notes

- `data/servers.json` is written with mode `0600` and is never served over HTTP
- The Outline API only stores cumulative bytes since server creation — there is no per-period usage without snapshotting
- `rejectUnauthorized: false` is set for Outline API connections since Outline uses a self-signed certificate by default
- The `apiUrl` is never returned to the browser under any circumstances — only `id`, `name`, and `addedAt` are exposed to the client

---

## Stack

- [Next.js](https://nextjs.org) — framework
- [Tailwind CSS](https://tailwindcss.com) — styling
- [Axios](https://axios-http.com) — API requests
- [react-hot-toast](https://react-hot-toast.com) — notifications
- [qrcode.react](https://github.com/zpao/qrcode.react) — QR codes
- [Traefik](https://traefik.io) — reverse proxy + TLS
- [Authelia](https://www.authelia.com) — authentication portal