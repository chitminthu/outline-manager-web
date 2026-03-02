// pages/api/toggleMetrics.js
import { createOutlineApi } from '../../lib/outlineClient';
import { withAuth } from '../../lib/authMiddleware';
import { validateServerId } from '../../lib/validation';
import { getServer } from '../../lib/serverStore';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { serverId, enabled } = req.body;
  if (!validateServerId(serverId)) return res.status(400).json({ message: 'Invalid server ID' });
  if (typeof enabled !== 'boolean') return res.status(400).json({ message: 'enabled must be boolean' });

  const server = getServer(serverId);
  if (!server) return res.status(404).json({ message: 'Server not found' });

  try {
    const api = createOutlineApi(server.apiUrl);
    await api.put('/metrics/enabled', { metricsEnabled: enabled });
    return res.status(200).json({ message: `Metrics ${enabled ? 'enabled' : 'disabled'}` });
  } catch (err) {
    console.error('Toggle metrics failed:', err?.response?.status, err?.response?.data);
    return res.status(500).json({ message: 'Failed to toggle metrics' });
  }
}

export default withAuth(handler);