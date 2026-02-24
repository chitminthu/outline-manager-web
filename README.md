# Outline Dashboard

A self-hosted web UI for managing your [Outline VPN](https://getoutline.org) server. Built with Next.js.

## Why

Outline's official manager is a desktop app — you're stuck on one machine to manage keys. This gives you a browser-based dashboard you can open from your phone, tablet, or any laptop.

## Features

- Add and delete access keys from any browser
- Data usage per key with visual progress bars
- Traffic share breakdown across all keys
- Server info: hostname, version, port, cipher, uptime
- Flags top consumer, unused keys, and keys over their data limit
- Dark mode
- Production-ready auth via Authelia + Traefik

## Requirements

- Node.js 18+
- An Outline server and its Management API URL (from `config.yml` or the Outline Manager app's server settings)

## Local Development

```bash
git clone https://github.com/chitminthu/outline-manager-web
cd outline-manager-web
npm install
```

Create a `.env.local`:

```env
OUTLINE_API_URL=https://your-server-ip:port/your-api-prefix
AUTH_ENABLED=false
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Finding your API URL:** In the Outline Manager desktop app, click the three-dot menu on your server → "View server config" → copy the `apiUrl` value.

## Self-Hosting with Docker + Traefik + Authelia

The recommended production setup uses Docker Compose with Traefik as a reverse proxy and Authelia for login protection.

### Stack layout

```
Internet → Traefik (80/443 + Let's Encrypt)
               ├─→ auth.yourdomain.com  → Authelia (login portal)
               └─→ outline.yourdomain.com → This app
                        (protected by Authelia forward-auth)
```

### Dockerfile

The app uses Next.js standalone output for a minimal image. Make sure `next.config.js` includes:

```js
const nextConfig = {
  output: 'standalone',
};
module.exports = nextConfig;
```

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

### Production `.env`

```env
OUTLINE_API_URL=https://your-server-ip:port/your-api-prefix
AUTH_ENABLED=true
NODE_ENV=production
```

> Never prefix secrets with `NEXT_PUBLIC_` — those get bundled into the browser.

### docker-compose.yml

```yaml
networks:
  proxy:
    external: true

services:

  traefik:
    image: traefik:latest
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
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.outline.rule=Host(`outline.yourdomain.com`)"
      - "traefik.http.routers.outline.entrypoints=websecure"
      - "traefik.http.routers.outline.tls.certresolver=letsencrypt"
      - "traefik.http.services.outline.loadbalancer.server.port=3000"
      - "traefik.http.routers.outline.middlewares=authelia@file"
```

The Authelia middleware is defined in `traefik/dynamic.yml` rather than Docker labels to avoid timing/discovery issues:

```yaml
# traefik/dynamic.yml
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

### Deploy

```bash
docker network create proxy
docker compose build outline-app
docker compose up -d
docker compose logs -f
```

### Update after a git push

```bash
git pull
docker compose build outline-app
docker compose up -d outline-app
```

## Authentication

`AUTH_ENABLED=true` enables the auth middleware on all API routes (`/api/addKey`, `/api/deleteKey`). Traefik + Authelia handle the login flow — after a successful login, Authelia forwards a `Remote-User` header which the middleware validates.

For local dev, set `AUTH_ENABLED=false` to skip auth entirely.

## Notes

- The Outline API only stores cumulative bytes transferred — there's no "last active" timestamp at the API level
- Data usage resets if you reinstall the Outline server
- `rejectUnauthorized` is disabled for the internal API connection since Outline uses a self-signed cert by default

## Stack

- [Next.js](https://nextjs.org) — framework
- [Tailwind CSS](https://tailwindcss.com) — styling
- [Axios](https://axios-http.com) — API requests
- [react-hot-toast](https://react-hot-toast.com) — notifications