const { Readable } = require('node:stream');
const { requireSession, sameOrigin } = require('../lib/oauth');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  try {
    if ((req.headers.origin && !sameOrigin(req)) || (req.method !== 'GET' && !sameOrigin(req))) return res.status(403).json({ error: '요청한 사이트 주소가 일치하지 않습니다.' });
    const target = new URL(String(req.query.url || ''));
    const allowedPath = /^\/(drive\/v3\/files|upload\/drive\/v3\/files)(\/|\?|$)/.test(target.pathname);
    if (target.protocol !== 'https:' || target.hostname !== 'www.googleapis.com' || !allowedPath) return res.status(400).json({ error: '허용되지 않은 Google API 주소입니다.' });
    const { accessToken } = await requireSession(req);
    const headers = new Headers();
    for (const name of ['content-type', 'x-upload-content-type', 'x-upload-content-length']) {
      if (req.headers[name]) headers.set(name, req.headers[name]);
    }
    headers.set('Authorization', `Bearer ${accessToken}`);
    let body;
    if (!['GET', 'HEAD'].includes(req.method) && req.body != null) body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const upstream = await fetch(target, { method: req.method, headers, body, redirect: 'manual' });
    res.statusCode = upstream.status;
    for (const name of ['content-type', 'location', 'content-range', 'range', 'retry-after']) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    if (!upstream.body) return res.end();
    return Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    const status = /로그인 세션이 없습니다|Google 인증을 갱신/.test(error.message) ? 401 : 500;
    return res.status(status).json({ error: { message: error.message || 'Google Drive 요청을 처리하지 못했습니다.' } });
  }
};
