//pages/api/servders/[id]/index.js
import { withAuth } from '../../../../lib/authMiddleware';
import { validateServerId } from '../../../../lib/validation';
import { getServer, removeServer } from '../../../../lib/serverStore';

async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end();
  const { id } = req.query;
  if (!validateServerId(id)) return res.status(400).json({ message: 'Invalid server ID' });

  const server = getServer(id);
  if (!server) return res.status(404).json({ message: 'Server not found' });

  removeServer(id);
  return res.status(200).json({ message: 'Server removed' });
}

export default withAuth(handler);