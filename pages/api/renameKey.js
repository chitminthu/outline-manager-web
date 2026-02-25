//pages/api/renameKey.js
import { outlineApi } from '../../lib/outlineClient';
import { withAuth } from '../../lib/authMiddleware';
import { validateKeyId, validateKeyName } from '../../lib/validation';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { id, name } = req.body;
  if (!validateKeyId(id)) return res.status(400).json({ message: 'Invalid key ID' });
  if (!validateKeyName(name)) return res.status(400).json({ message: 'Invalid key name' });
  try {
    await outlineApi.put(`/access-keys/${id}/name`, { name: name.trim() });
    return res.status(200).json({ message: 'Key renamed successfully' });
  } catch {
    return res.status(500).json({ message: 'Failed to rename key' });
  }
}

export default withAuth(handler);