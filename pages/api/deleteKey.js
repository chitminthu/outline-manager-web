//pages/api/deleteKey.js
import { createOutlineApi } from '../../lib/outlineClient';
import { withAuth } from '../../lib/authMiddleware';
import { validateKeyId, validateServerId } from '../../lib/validation';
import { getServer } from '../../lib/serverStore';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { id, serverId } = req.body;
  if (!validateServerId(serverId)) return res.status(400).json({ message: 'Invalid server ID' });
  if (!validateKeyId(id)) return res.status(400).json({ message: 'Invalid key ID' });

  const server = getServer(serverId);
  if (!server) return res.status(404).json({ message: 'Server not found' });

  try {
    const api = createOutlineApi(server.apiUrl);
    const response = await api.delete(`/access-keys/${id}`);
    if (response.status === 204) {
      return res.status(200).json({ message: 'Key deleted successfully' });
    }
    return res.status(response.status).json({ message: 'Failed to delete key' });
  } catch {
    return res.status(500).json({ message: 'Failed to delete key' });
  }
}

export default withAuth(handler);