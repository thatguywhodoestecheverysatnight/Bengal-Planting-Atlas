/* Small helpers shared by the API routes (Web-standard Request/Response). */
export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || {}; }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

export function fail(err) {
  if (err instanceof HttpError) return json({ ok: false, error: err.message, ...err.extra }, err.status);
  console.error(err);
  return json({ ok: false, error: 'Server error. Check the function logs in Vercel.' }, 500);
}

export async function readJson(request, limitBytes) {
  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > limitBytes) throw new HttpError(413, `Request is larger than ${Math.round(limitBytes / 1024)} KB.`);
  try { return JSON.parse(text); } catch (e) { throw new HttpError(400, 'Request body is not valid JSON.'); }
}

export function clientIp(request) {
  const f = request.headers.get('x-forwarded-for');
  return f ? f.split(',')[0].trim() : (request.headers.get('x-real-ip') || '');
}
