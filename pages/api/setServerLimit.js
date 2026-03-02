// pages/api/setServerLimit.js
import { createOutlineApi } from '../../lib/outlineClient';
import { withAuth } from '../../lib/authMiddleware';
import { validateServerId } from '../../lib/validation';
import { getServer } from '../../lib/serverStore';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { serverId, bytes } = req.body;
  if (!validateServerId(serverId)) return res.status(400).json({ message: 'Invalid server ID' });

  const server = getServer(serverId);
  if (!server) return res.status(404).json({ message: 'Server not found' });

  try {
    const api = createOutlineApi(server.apiUrl);
    if (bytes === null) {
      // Remove the default limit entirely
      await api.delete('/server/access-key-data-limit');
    } else {
      if (typeof bytes !== 'number' || bytes <= 0) {
        return res.status(400).json({ message: 'Invalid limit value' });
      }
      await api.put('/server/access-key-data-limit', { limit: { bytes } });
    }
    return res.status(200).json({ message: 'Default limit updated' });
  } catch (err) {
    console.error('Set server limit failed:', err?.response?.status, err?.response?.data);
    return res.status(500).json({ message: 'Failed to update default limit' });
  }
}

export default withAuth(handler);