//lib/authMiddleware.js
export function withAuth(handler) {
  return async (req, res) => {
    if (process.env.AUTH_ENABLED === 'true') {
      const remoteUser =
        req.headers['remote-user'] ||
        req.headers['x-forwarded-user'];
      if (!remoteUser) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
    }
    return handler(req, res);
  };
}