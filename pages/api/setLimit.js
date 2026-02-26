//pages/api/setLimit.js
import { createOutlineApi } from '../../lib/outlineClient';
import { withAuth } from '../../lib/authMiddleware';
import { validateKeyId, validateServerId } from '../../lib/validation';
import { getServer } from '../../lib/serverStore';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { id, bytes, serverId } = req.body;
  if (!validateServerId(serverId)) return res.status(400).json({ message: 'Invalid server ID' });
  if (!validateKeyId(id)) return res.status(400).json({ message: 'Invalid key ID' });

  const server = getServer(serverId);
  if (!server) return res.status(404).json({ message: 'Server not found' });

  try {
    const api = createOutlineApi(server.apiUrl);
    if (bytes === null) {
      await api.delete(`/access-keys/${id}/data-limit`);
    } else {
      if (typeof bytes !== 'number' || bytes < 0) {
        return res.status(400).json({ message: 'Invalid limit value' });
      }
      await api.put(`/access-keys/${id}/data-limit`, { limit: { bytes } });
    }
    return res.status(200).json({ message: 'Limit updated' });
  } catch {
    return res.status(500).json({ message: 'Failed to update limit' });
  }
}

export default withAuth(handler);