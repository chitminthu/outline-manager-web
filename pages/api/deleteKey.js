//pages/api/deleteKey.js
import { outlineApi } from '../../lib/outlineClient';
import { withAuth } from '../../lib/authMiddleware';
import { validateKeyId } from '../../lib/validation';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { id } = req.body;

  if (!validateKeyId(id)) {
    return res.status(400).json({ message: 'Invalid key ID' });
  }

  try {
    const response = await outlineApi.delete(`/access-keys/${id}`);
    if (response.status === 204) {
      return res.status(200).json({ message: 'Key deleted successfully' });
    }
    return res.status(response.status).json({ message: 'Failed to delete key' });
  } catch {
    return res.status(500).json({ message: 'Failed to delete key' });
  }
}

export default withAuth(handler);