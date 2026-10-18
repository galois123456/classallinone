const { getSession, clearCookie, COOKIE, OAUTH_COOKIE, sameOrigin } = require('../../lib/oauth');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!sameOrigin(req)) return res.status(403).json({ error: '요청한 사이트 주소가 일치하지 않습니다.' });
  try {
    let session = null;
    try { session = getSession(req); } catch {}
    if (session?.refreshToken) {
      try { await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: session.refreshToken }) }); } catch {}
    }
    clearCookie(res, COOKIE);
    clearCookie(res, OAUTH_COOKIE);
    return res.status(200).json({ connected: false });
  } catch (error) { return res.status(500).json({ error: error.message }); }
};
