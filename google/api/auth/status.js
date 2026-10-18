const { requireSession } = require('../../lib/oauth');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { session } = await requireSession(req);
    return res.status(200).json({ connected: true, email: session.email });
  } catch (error) { return res.status(401).json({ connected: false, error: error.message }); }
};
