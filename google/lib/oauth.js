const crypto = require('node:crypto');

const COOKIE = '__Host-classroom_drive_session';
const OAUTH_COOKIE = '__Host-classroom_oauth_state';
const YEAR = 60 * 60 * 24 * 365;

function config() {
  const origin = process.env.APP_ORIGIN;
  const keyText = process.env.SESSION_ENCRYPTION_KEY || '';
  const key = Buffer.from(keyText, 'base64');
  if (!origin || !/^https:\/\//.test(origin)) throw new Error('APP_ORIGIN must be the production HTTPS origin.');
  if (key.length !== 32) throw new Error('SESSION_ENCRYPTION_KEY must be a base64 encoded 32-byte key.');
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel Environment Variables.');
  return { origin: origin.replace(/\/$/, ''), key, clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
}
function redirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || `${config().origin}/api/auth/callback`;
}
function base64url(buf) { return Buffer.from(buf).toString('base64url'); }
function seal(value) {
  const { key } = config();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(base64url).join('.');
}
function unseal(value) {
  const { key } = config();
  const [ivText, tagText, encryptedText] = String(value || '').split('.');
  if (!ivText || !tagText || !encryptedText) throw new Error('로그인 세션이 올바르지 않습니다. 다시 로그인해 주세요.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
  return JSON.parse(plaintext);
}
function cookieOptions(maxAge) { return `Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`; }
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function appendCookie(res, value) {
  const current = res.getHeader('Set-Cookie');
  const list = current ? (Array.isArray(current) ? current : [current]) : [];
  res.setHeader('Set-Cookie', [...list, value]);
}
function clearCookie(res, name) { appendCookie(res, `${name}=; ${cookieOptions(0)}`); }
function setSession(res, session) { appendCookie(res, `${COOKIE}=${encodeURIComponent(seal(session))}; ${cookieOptions(YEAR)}`); }
function getSession(req) {
  const value = parseCookies(req)[COOKIE];
  if (!value) return null;
  return unseal(value);
}
function setState(res, value) { appendCookie(res, `${OAUTH_COOKIE}=${encodeURIComponent(seal(value))}; ${cookieOptions(600)}`); }
function getState(req) {
  const value = parseCookies(req)[OAUTH_COOKIE];
  return value ? unseal(value) : null;
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  return origin === config().origin;
}
async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = config();
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error(result.error_description || result.error || 'Google 인증을 갱신할 수 없습니다. 다시 로그인해 주세요.');
  return result.access_token;
}
async function requireSession(req) {
  const session = getSession(req);
  if (!session?.refreshToken) throw new Error('로그인 세션이 없습니다. Google 계정으로 로그인해 주세요.');
  const accessToken = await refreshAccessToken(session.refreshToken);
  return { session, accessToken };
}
function randomString(bytes = 32) { return base64url(crypto.randomBytes(bytes)); }
function sha256(value) { return base64url(crypto.createHash('sha256').update(value).digest()); }
module.exports = { COOKIE, OAUTH_COOKIE, config, redirectUri, setState, getState, clearCookie, setSession, getSession, sameOrigin, refreshAccessToken, requireSession, randomString, sha256 };
