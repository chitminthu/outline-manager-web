//pages/api/addKey.js
import { createOutlineApi } from '../../lib/outlineClient';
import { withAuth } from '../../lib/authMiddleware';
import { validateKeyName, validateServerId } from '../../lib/validation';
import { getServer } from '../../lib/serverStore';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { name, serverId } = req.body;
  if (!validateServerId(serverId)) return res.status(400).json({ message: 'Invalid server ID' });
  if (!validateKeyName(name)) return res.status(400).json({ message: 'Invalid key name' });

  const server = getServer(serverId);
  if (!server) return res.status(404).json({ message: 'Server not found' });

  try {
    const api = createOutlineApi(server.apiUrl);
    await api.post('/access-keys', { name: name.trim() });
    return res.status(200).json({ message: 'Key added successfully' });
  } catch {
    return res.status(500).json({ message: 'Failed to add key' });
  }
}

export default withAuth(handler);