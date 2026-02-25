//pages/api/renameServer.js
import { outlineApi } from '../../lib/outlineClient';
import { withAuth } from '../../lib/authMiddleware';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Invalid server name' });
  }
  try {
    await outlineApi.put('/name', { name: name.trim() });
    return res.status(200).json({ message: 'Server renamed' });
  } catch (err) {
    console.error('Rename server failed:', err?.response?.status, err?.response?.data);
    return res.status(500).json({ message: 'Failed to rename server' });
  }
}

export default withAuth(handler);