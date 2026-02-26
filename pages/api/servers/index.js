//pages/api/servders/index.js
import { withAuth } from '../../../lib/authMiddleware';
import { getServers, addServer, safeServer } from '../../../lib/serverStore';
import { validateApiUrl } from '../../../lib/validation';

async function handler(req, res) {
  if (req.method === 'GET') {
    // Never expose apiUrl — return safe fields only
    const servers = getServers().map(safeServer);
    return res.status(200).json({ servers });
  }

  if (req.method === 'POST') {
    const { name, apiUrl } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Server name is required' });
    }
    if (!validateApiUrl(apiUrl)) {
      return res.status(400).json({ message: 'Invalid API URL. Must be https://ip:port/token' });
    }
    const server = addServer({ name, apiUrl });
    return res.status(201).json({ server: safeServer(server) });
  }

  return res.status(405).end();
}

export default withAuth(handler);