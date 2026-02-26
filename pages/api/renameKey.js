//pages/api/renameKey.js
import { createOutlineApi } from '../../lib/outlineClient';
import { withAuth } from '../../lib/authMiddleware';
import { validateKeyId, validateKeyName, validateServerId } from '../../lib/validation';
import { getServer } from '../../lib/serverStore';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { id, name, serverId } = req.body;
  if (!validateServerId(serverId)) return res.status(400).json({ message: 'Invalid server ID' });
  if (!validateKeyId(id)) return res.status(400).json({ message: 'Invalid key ID' });
  if (!validateKeyName(name)) return res.status(400).json({ message: 'Invalid key name' });

  const server = getServer(serverId);
  if (!server) return res.status(404).json({ message: 'Server not found' });

  try {
    const api = createOutlineApi(server.apiUrl);
    await api.put(`/access-keys/${id}/name`, { name: name.trim() });
    return res.status(200).json({ message: 'Key renamed successfully' });
  } catch (err) {
    console.error('Rename key failed:', err?.response?.status, err?.response?.data);
    return res.status(500).json({ message: 'Failed to rename key' });
  }
}

export default withAuth(handler);