//pages/api/addKey.js
import { outlineApi } from '../../lib/outlineClient';
import { withAuth } from '../../lib/authMiddleware';
import { validateKeyName } from '../../lib/validation';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { name } = req.body;

  if (!validateKeyName(name)) {
    return res.status(400).json({ message: 'Invalid key name' });
  }

  try {
    await outlineApi.post('/access-keys', { name: name.trim() });
    return res.status(200).json({ message: 'Key added successfully' });
  } catch {
    return res.status(500).json({ message: 'Failed to add key' });
  }
}

export default withAuth(handler);