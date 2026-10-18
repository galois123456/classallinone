const { config, redirectUri, setState, randomString, sha256 } = require('../../lib/oauth');
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method not allowed');
  try {
    const { clientId } = config();
    const state = randomString();
    const verifier = randomString(48);
    setState(res, { state, verifier, createdAt: Date.now() });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri(), response_type: 'code',
      scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
      access_type: 'offline', include_granted_scopes: 'true', prompt: 'consent select_account',
      state, code_challenge: sha256(verifier), code_challenge_method: 'S256'
    }).toString();
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, url.toString());
  } catch (error) { return res.status(500).send(error.message); }
};
