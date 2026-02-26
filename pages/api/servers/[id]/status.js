// pages/api/servers/[id]/status.js
import { withAuth } from '../../../../lib/authMiddleware';
import { validateServerId } from '../../../../lib/validation';
import { getServer, updateServerName } from '../../../../lib/serverStore';
import { createOutlineApi } from '../../../../lib/outlineClient';

const TIMEOUT_MS = 6000;

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const { id } = req.query;
  if (!validateServerId(id)) return res.status(400).json({ message: 'Invalid server ID' });

  const server = getServer(id);
  if (!server) return res.status(404).json({ message: 'Server not found' });

  try {
    const api = createOutlineApi(server.apiUrl);
    const [serverRes, keysRes, metricsRes] = await Promise.all([
      api.get('/server', { timeout: TIMEOUT_MS }),
      api.get('/access-keys/', { timeout: TIMEOUT_MS }),
      api.get('/metrics/transfer', { timeout: TIMEOUT_MS }),
    ]);

    const realName = serverRes.data.name || server.name;
    const totalBytes = Object.values(
      metricsRes.data.bytesTransferredByUserId || {}
    ).reduce((s, b) => s + b, 0);

    // Keep servers.json in sync with the real Outline server name.
    // This eliminates the flash where the old local name shows during loading.
    if (realName && realName !== server.name) {
      updateServerName(id, realName);
    }

    return res.status(200).json({
      online: true,
      name: realName,
      version: serverRes.data.version || null,
      keyCount: (keysRes.data.accessKeys || []).length,
      totalBytes,
      createdTimestampMs: serverRes.data.createdTimestampMs || null,
    });
  } catch (err) {
    const timedOut = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
    return res.status(200).json({
      online: false,
      reason: timedOut ? 'timeout' : 'unreachable',
    });
  }
}

export default withAuth(handler);