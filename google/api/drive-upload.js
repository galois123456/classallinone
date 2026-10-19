const { requireSession, sameOrigin } = require('../lib/oauth');

// 2 MiB becomes 2.67 MiB in JSON, below Vercel's 4.5 MB request limit.
const CHUNK_LIMIT = 2 * 1024 * 1024;
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (!sameOrigin(req)) return res.status(403).json({ error: '요청한 사이트 주소가 일치하지 않습니다.' });
    let input;
    try { input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch {}
    if (!input || typeof input.session !== 'string') return res.status(400).json({ error: '업로드 정보가 없습니다.' });
    let target;
    try { target = new URL(input.session); } catch {}
    if (!target || target.protocol !== 'https:' || target.hostname !== 'www.googleapis.com' || target.port || target.username || target.password || target.hash ||
        !/^\/upload\/drive\/v3\/files(?:\/[^/]+)?$/.test(target.pathname) || !target.searchParams.get('upload_id')) {
      return res.status(400).json({ error: '허용되지 않은 Google Drive 업로드 주소입니다.' });
    }
    const { total, start, data, probe } = input;
    const contentType = input.contentType || 'application/json';
    if (!/^(application\/json|image\/(png|jpeg|webp|gif))$/.test(contentType)) return res.status(400).json({ error: '지원하지 않는 저장 형식입니다.' });
    if (!Number.isSafeInteger(total) || total < 1) return res.status(400).json({ error: '파일 크기가 올바르지 않습니다.' });
    let chunk = Buffer.alloc(0), range = `bytes */${total}`;
    if (probe !== true) {
      if (!Number.isSafeInteger(start) || start < 0 || start >= total || typeof data !== 'string' ||
          data.length % 4 !== 0 || data.length > Math.ceil(CHUNK_LIMIT / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
        return res.status(400).json({ error: '업로드 조각이 올바르지 않습니다.' });
      }
      chunk = Buffer.from(data, 'base64');
      const end = start + chunk.length;
      if (!chunk.length || chunk.length > CHUNK_LIMIT || end > total || (end < total && chunk.length % (256 * 1024) !== 0)) {
        return res.status(400).json({ error: '업로드 조각 크기가 올바르지 않습니다.' });
      }
      range = `bytes ${start}-${end - 1}/${total}`;
    }
    const { accessToken } = await requireSession(req);
    const upstream = await fetch(target, {
      method: 'PUT', redirect: 'manual', signal: AbortSignal.timeout(25000),
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': contentType, 'Content-Range': range }, body: chunk
    });
    if (upstream.status === 308) return res.status(200).json({ uploadStatus: 308, range: upstream.headers.get('Range') || '' });
    if (upstream.status === 200 || upstream.status === 201) {
      const file = await upstream.json();
      if (!file.id) throw Error('Google Drive에서 저장 완료 정보를 받지 못했습니다.');
      return res.status(200).json({ uploadStatus: upstream.status, file });
    }
    let detail;
    try { detail = await upstream.json(); } catch {}
    return res.status(upstream.status).json({ error: detail?.error?.message || `Google Drive 업로드 실패 (${upstream.status})`, retryable: upstream.status === 429 || upstream.status >= 500 });
  } catch (error) {
    const expired = /로그인 세션이 없습니다|Google 인증을 갱신/.test(error.message);
    return res.status(expired ? 401 : 502).json({ error: expired ? 'Google 로그인이 만료되었습니다. 다시 로그인해 주세요.' : 'Google Drive 전송 연결이 끊겼습니다. 기기 자료는 유지됩니다. 저장을 다시 눌러 주세요.', retryable: !expired });
  }
};
