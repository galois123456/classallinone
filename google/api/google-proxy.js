const { Readable } = require('node:stream');
const { randomBytes } = require('node:crypto');
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
    for (const name of ['content-type', 'x-upload-content-type', 'x-upload-content-length', 'range']) {
      if (req.headers[name]) headers.set(name, req.headers[name]);
    }
    headers.set('Authorization', `Bearer ${accessToken}`);
    let body;
    if (!['GET', 'HEAD'].includes(req.method) && req.body != null) body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    // Small new JSON documents need only one Drive request. The browser sends
    // JSON, so Vercel's automatic body parsing cannot corrupt multipart data.
    if (req.method === 'POST' && target.searchParams.get('uploadType') === 'multipart') {
      const input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (input?.classroomMultipart !== true || input.metadata?.mimeType !== 'application/json' || typeof input.content !== 'string' || Buffer.byteLength(input.content) > 512 * 1024) {
        return res.status(400).json({ error: '작은 JSON 저장 요청이 올바르지 않습니다.' });
      }
      JSON.parse(input.content);
      const boundary = 'classroom_' + randomBytes(18).toString('hex');
      headers.set('Content-Type', 'multipart/related; boundary=' + boundary);
      body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(input.metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${input.content}\r\n--${boundary}--\r\n`;
    }
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
