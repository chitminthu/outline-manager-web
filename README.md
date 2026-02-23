# Outline Dashboard

A self-hosted web dashboard for managing your [Outline VPN](https://getoutline.org) server. Built with Next.js.

## Why I Built This

Outline's official manager is a desktop app — which means you're tied to one machine to create or delete access keys. I wanted to manage my VPN from any device: a phone, a tablet, a different laptop. So I built a simple web UI that talks directly to the Outline Management API and can be self-hosted alongside the server.

## Features

- Add and delete access keys from any browser
- See data usage per key with visual progress bars
- Traffic share breakdown across all keys
- Server details: hostname, version, port, cipher, uptime, and creation date
- Highlights top consumer, unused keys, and keys over their data limit
- Dark mode support
- Auth-ready for production (Authelia + Traefik)

## Requirements

- Node.js 18+
- An Outline server with a known Management API URL (found in your `config.yml` or the Outline Manager app)

## Getting Started

```bash
git clone https://github.com/yourusername/outline-dashboard
cd outline-dashboard
npm install
```

Create a `.env.local` file:

```env
OUTLINE_API_URL=https://your-server-ip:port/your-api-prefix
AUTH_ENABLED=false
```

Then run it:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production with Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci && npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t outline-dashboard .
docker run -e OUTLINE_API_URL=https://your-api-url -p 3000:3000 outline-dashboard
```

## Authentication

The app includes middleware ready for Authelia + Traefik. When you're ready to expose it publicly, set `AUTH_ENABLED=true` in your environment. Traefik will forward a `Remote-User` header after Authelia authenticates the request — the middleware enforces this on all API routes.

## Where to Find Your API URL

Open the Outline Manager desktop app, click the three-dot menu on your server, and select "View server config". The `apiUrl` field in the JSON is what goes in `OUTLINE_API_URL`.

## Notes

- The Outline API only stores cumulative bytes transferred — there is no "last active" timestamp available at the API level
- Data usage resets if you reinstall the Outline server
- `rejectUnauthorized` is disabled for the internal API connection since Outline uses a self-signed certificate by default

## Stack

- [Next.js](https://nextjs.org) — framework
- [Tailwind CSS](https://tailwindcss.com) — styling
- [Axios](https://axios-http.com) — API requests
- [react-hot-toast](https://react-hot-toast.com) — notifications