/* POST /api/upload?kind=site|surroundings&name=file.jpg
   Body: the image bytes (the page resizes to 2000 px JPEG first).
   Stores the photo in Vercel Blob and returns its URL. */
import { json, fail, HttpError } from './_lib/http.js';
import { putPhoto } from './_lib/blob.js';

const MAX = 4 * 1024 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function POST(request) {
  try {
    const u = new URL(request.url);
    const kind = u.searchParams.get('kind') === 'surroundings' ? 'surroundings' : 'site';
    const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!TYPES[type]) throw new HttpError(415, 'Only JPEG, PNG or WebP photos can be attached.');
    const buf = Buffer.from(await request.arrayBuffer());
    if (!buf.length) throw new HttpError(400, 'The photo is empty.');
    if (buf.length > MAX) throw new HttpError(413, 'The photo is larger than 4 MB after resizing.');
    const base = (u.searchParams.get('name') || 'photo').replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';
    const d = new Date(), stamp = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const r = await putPhoto(`site-photos/${stamp}/${kind}-${base}.${TYPES[type]}`, buf, type);
    return json({ ok: true, url: r.url, pathname: r.pathname, bytes: buf.length, kind });
  } catch (e) { return fail(e); }
}
