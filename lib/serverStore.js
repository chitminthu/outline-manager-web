//lib/serverStore.js
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'servers.json');

// Ensures data/servers.json exists. On first run, if OUTLINE_API_URL is set
// in the environment, it is auto-seeded as the first server so single-server
// deployments work without any extra setup.
function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const servers = [];
    if (process.env.OUTLINE_API_URL) {
      servers.push({
        id: randomUUID(),
        name: 'My Outline Server',
        apiUrl: process.env.OUTLINE_API_URL,
        addedAt: Date.now(),
      });
    }
    // mode 0600 — owner read/write only, no group or world access
    fs.writeFileSync(STORE_PATH, JSON.stringify(servers, null, 2), { mode: 0o600 });
  }
}

function read() {
  ensureStore();
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
}

function write(servers) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(servers, null, 2), { mode: 0o600 });
}

export function getServers() {
  return read();
}

export function getServer(id) {
  return read().find((s) => s.id === id) || null;
}

export function addServer({ name, apiUrl }) {
  const servers = read();
  const server = {
    id: randomUUID(),
    name: name.trim(),
    apiUrl: apiUrl.trim(),
    addedAt: Date.now(),
  };
  servers.push(server);
  write(servers);
  return server;
}

export function updateServerName(id, name) {
  const servers = read();
  const idx = servers.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  servers[idx].name = name.trim();
  write(servers);
  return true;
}

export function removeServer(id) {
  write(read().filter((s) => s.id !== id));
}

// Returns safe public fields only — apiUrl (which contains the secret token)
// is NEVER included. This is the only shape that should ever reach the browser.
export function safeServer(server) {
  return { id: server.id, name: server.name, addedAt: server.addedAt };
}