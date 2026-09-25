/* Local stand-in for Vercel: serves public/ and routes /api/* to the real
   handlers. The database is an in-memory Postgres (PGlite), photos are kept
   in memory and place names come from a stub, so nothing external is needed.
   Usage: node tools/dev-server.mjs [port]   (archive passcode: local-pass)
   For a run against your real Neon database and Blob store use `vercel dev`. */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const port = +process.argv[2] || 8787, root = new URL('../public/', import.meta.url).pathname;
const pg = new PGlite();
globalThis.__BPA_TEST_SQL__ = { query: async (t, p = []) => (await pg.query(t, p)).rows };
const store = new Map();
globalThis.__BPA_TEST_BLOB__ = async (pathname, body, type) => {
  const k = pathname.replace(/(\.\w+)$/, `-${Math.random().toString(36).slice(2, 8)}$1`);
  store.set(k, { body, type });
  return { url: `https://local.public.blob.vercel-storage.com/${k}`, pathname: k };
};
globalThis.__BPA_TEST_FETCH__ = async url => {
  const u = new URL(url), lat = u.searchParams.get('lat'), lon = u.searchParams.get('lon');
  return { ok: true, json: async () => ({ display_name: `Stub locality near ${lat}, ${lon}, West Bengal, India`,
    address: { suburb: `Stub ward ${Number(lat).toFixed(2)}`, city: 'Stub town', county: 'Stub block', state_district: 'Stub district', state: 'West Bengal', postcode: '700000' } }) };
};
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'local-pass';
const routes = { health: await import('../api/health.js'), geocode: await import('../api/geocode.js'), upload: await import('../api/upload.js'), runs: await import('../api/runs.js') };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.css': 'text/css', '.txt': 'text/plain' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    const m = url.pathname.match(/^\/api\/(\w+)$/);
    if (m && routes[m[1]]) {
      const h = routes[m[1]][req.method]; if (!h) { res.writeHead(405); return res.end(); }
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length && req.method !== 'GET' ? Buffer.concat(chunks) : undefined;
      const r = await h(new Request(url, { method: req.method, headers: req.headers, body }));
      res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
    }
    if (url.pathname.startsWith('/blob/')) {
      const b = store.get(decodeURIComponent(url.pathname.slice(6)));
      if (b) { res.writeHead(200, { 'content-type': b.type }); return res.end(b.body); }
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/')) p += 'index.html';
    if (!extname(p)) p += '.html';
    const data = await readFile(join(root, p));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(data);
  } catch (e) { res.writeHead(404); res.end('Not found'); }
}).listen(port, () => console.log(`Bengal Planting Atlas local server on http://localhost:${port}  (archive passcode: ${process.env.ADMIN_TOKEN})`));
