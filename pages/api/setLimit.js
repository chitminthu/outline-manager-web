//pages/api/setLimit.js
import { outlineApi } from '../../lib/outlineClient';
import { withAuth } from '../../lib/authMiddleware';
import { validateKeyId } from '../../lib/validation';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { id, bytes } = req.body;
  if (!validateKeyId(id)) return res.status(400).json({ message: 'Invalid key ID' });
  try {
    if (bytes === null) {
      await outlineApi.delete(`/access-keys/${id}/data-limit`);
    } else {
      if (typeof bytes !== 'number' || bytes < 0) {
        return res.status(400).json({ message: 'Invalid limit value' });
      }
      await outlineApi.put(`/access-keys/${id}/data-limit`, { limit: { bytes } });
    }
    return res.status(200).json({ message: 'Limit updated' });
  } catch {
    return res.status(500).json({ message: 'Failed to update limit' });
  }
}

export default withAuth(handler);