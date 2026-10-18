const { config, redirectUri, getState, clearCookie, setSession, OAUTH_COOKIE } = require('../../lib/oauth');
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method not allowed');
  clearCookie(res, OAUTH_COOKIE);
  try {
    const { origin, clientId, clientSecret } = config();
    if (req.query.error) throw new Error(String(req.query.error_description || req.query.error));
    const saved = getState(req);
    if (!saved || !req.query.code || !req.query.state || saved.state !== req.query.state || Date.now() - saved.createdAt > 10 * 60 * 1000) throw new Error('OAuth state가 일치하지 않습니다. 다시 로그인해 주세요.');
    const body = new URLSearchParams({
      code: String(req.query.code), client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri(), grant_type: 'authorization_code', code_verifier: saved.verifier
    });
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(token.error_description || token.error || 'Google 인증 코드를 교환하지 못했습니다.');
    if (!token.refresh_token) throw new Error('Google에서 갱신 토큰을 보내지 않았습니다. Google 계정의 앱 권한을 취소한 뒤 다시 로그인해 주세요.');
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
    const user = await userResponse.json();
    if (!userResponse.ok || !user.email) throw new Error('Google 계정 정보를 확인하지 못했습니다.');
    setSession(res, { refreshToken: token.refresh_token, email: user.email, subject: user.sub, createdAt: Date.now() });
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, `${origin}/?driveAuth=connected`);
  } catch (error) {
    const origin = process.env.APP_ORIGIN || '/';
    const message = Buffer.from(String(error.message || 'Google 로그인에 실패했습니다.')).toString('base64url');
    return res.redirect(302, `${origin}/?driveAuth=error&message=${message}`);
  }
};
