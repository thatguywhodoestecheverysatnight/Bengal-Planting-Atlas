/* /api/runs
   POST              save one generated palette with its inputs (public)
   GET               list runs, newest first (passcode)   ?q= &district= &from= &to= &limit= &offset=
   GET ?id=          one full record (passcode)
   GET ?format=json  export every matching record as JSON (passcode)
   GET ?format=csv   export a flat CSV summary (passcode)
   DELETE ?id=       remove one record (passcode) */
import { json, fail, readJson, HttpError } from './_lib/http.js';
import { sql, ensureSchema } from './_lib/db.js';
import { requireAdmin } from './_lib/auth.js';
import { isBlobUrl } from './_lib/blob.js';

const obj = v => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validate(b) {
  if (!obj(b)) throw new HttpError(400, 'Expected a JSON object.');
  const lat = Number(b.lat), lon = Number(b.lon);
  if (!isFinite(lat) || !isFinite(lon) || lat < 20 || lat > 28.5 || lon < 85 || lon > 90.5) throw new HttpError(400, 'lat and lon must be within or near West Bengal.');
  for (const k of ['inputs', 'site', 'weights', 'palette', 'ranked', 'layout', 'planting_window']) if (!obj(b[k]) && !Array.isArray(b[k])) throw new HttpError(400, `Missing ${k}.`);
  const photos = Array.isArray(b.photos) ? b.photos : [];
  if (photos.length > 12) throw new HttpError(400, 'At most 12 photos per run.');
  const clean = photos.map(p => {
    if (!obj(p) || !isBlobUrl(p.url)) throw new HttpError(400, 'Photos must be uploaded through /api/upload first.');
    return { url: p.url, kind: p.kind === 'surroundings' ? 'surroundings' : 'site', name: str(p.name, 120), caption: str(p.caption, 300), width: Number(p.width) || null, height: Number(p.height) || null, bytes: Number(p.bytes) || null };
  });
  const hash = str(b.input_hash, 80);
  if (!hash) throw new HttpError(400, 'Missing input_hash.');
  return { lat, lon, photos: clean, hash };
}

export async function POST(request) {
  try {
    const b = await readJson(request, 400 * 1024);
    const v = validate(b);
    await ensureSchema();
    const q = sql();
    const session = str(b.session_id, 64);
    /* the same visitor producing the same inputs within 30 minutes is not stored twice */
    if (session) {
      const dup = await q.query(`SELECT id, created_at FROM planting_runs WHERE session_id = $1 AND input_hash = $2 AND created_at > now() - interval '30 minutes' ORDER BY created_at DESC LIMIT 1`, [session, v.hash]);
      if (dup.length) return json({ ok: true, id: dup[0].id, created_at: dup[0].created_at, duplicate: true });
    }
    const rows = await q.query(
      `INSERT INTO planting_runs (session_id, input_hash, trigger, lat, lon, place_name, place, district, zone, inputs, site, weights, palette, ranked, layout, planting_window, air_carbon, photos, engine_version, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING id, created_at`,
      [session, v.hash, str(b.trigger, 20), v.lat, v.lon, str(b.place_name, 200), obj(b.place) ? JSON.stringify(b.place) : null,
       str(b.district, 60), str(b.zone, 60), JSON.stringify(b.inputs), JSON.stringify(b.site), JSON.stringify(b.weights), JSON.stringify(b.palette),
       JSON.stringify(b.ranked), JSON.stringify(b.layout), JSON.stringify(b.planting_window), obj(b.air_carbon) ? JSON.stringify(b.air_carbon) : null,
       JSON.stringify(v.photos), str(b.engine_version, 20) || 'unknown', str(request.headers.get('user-agent'), 200)]);
    return json({ ok: true, id: rows[0].id, created_at: rows[0].created_at }, 201);
  } catch (e) { return fail(e); }
}

function filters(u) {
  const where = [], args = [];
  const add = (clause, val) => { args.push(val); where.push(clause.replace('?', '$' + args.length)); };
  const qtext = u.searchParams.get('q');
  if (qtext) add(`(place_name ILIKE ? OR district ILIKE $${args.length + 1} OR palette::text ILIKE $${args.length + 1})`, '%' + qtext.slice(0, 80) + '%');
  const district = u.searchParams.get('district'); if (district) add('district = ?', district.slice(0, 60));
  const from = u.searchParams.get('from'); if (from && !isNaN(Date.parse(from))) add('created_at >= ?::timestamptz', from);
  const to = u.searchParams.get('to'); if (to && !isNaN(Date.parse(to))) add(`created_at < (?::date + interval '1 day')`, to);
  if (u.searchParams.get('photos') === '1') where.push(`jsonb_array_length(photos) > 0`);
  return { sqlWhere: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}

const csvCell = v => { if (v == null) return ''; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export async function GET(request) {
  try {
    requireAdmin(request);
    await ensureSchema();
    const q = sql(), u = new URL(request.url);
    const id = u.searchParams.get('id');
    if (id) {
      if (!UUID.test(id)) throw new HttpError(400, 'Invalid id.');
      const rows = await q.query('SELECT * FROM planting_runs WHERE id = $1', [id]);
      if (!rows.length) throw new HttpError(404, 'No run with that id.');
      return json({ ok: true, run: rows[0] });
    }
    const { sqlWhere, args } = filters(u);
    const format = u.searchParams.get('format');
    if (format === 'json') {
      const rows = await q.query(`SELECT * FROM planting_runs ${sqlWhere} ORDER BY created_at DESC LIMIT 5000`, args);
      return new Response(JSON.stringify({ exported_at: new Date().toISOString(), count: rows.length, runs: rows }, null, 1), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="planting-runs.json"', 'cache-control': 'no-store' } });
    }
    if (format === 'csv') {
      const rows = await q.query(`SELECT * FROM planting_runs ${sqlWhere} ORDER BY created_at DESC LIMIT 20000`, args);
      const head = ['id', 'created_at', 'lat', 'lon', 'place_name', 'district', 'zone', 'area_ha', 'shape', 'land_cover', 'micro_topography', 'tidal', 'air_criterion',
        'tree', 'tree_ssi', 'understory_tree', 'shrub', 'shrub_ssi', 'ground_cover', 'ground_ssi', 'cr', 'target_planting_date', 'trees_placed', 'shrubs_placed', 'co2_t_per_year', 'photos', 'photo_urls', 'engine_version'];
      const lines = [head.join(',')];
      rows.forEach(r => {
        const i = r.inputs || {}, p = r.palette || {}, l = (r.layout || {}).metrics || {};
        lines.push([r.id, new Date(r.created_at).toISOString(), r.lat, r.lon, r.place_name, r.district, r.zone, i.areaHa, i.shape, i.landCover, i.micro, i.tidal, i.airCriterion,
          p.tree && p.tree.sci, p.tree && p.tree.ssi, p.understory && p.understory.sci, p.shrub && p.shrub.sci, p.shrub && p.shrub.ssi, p.ground && p.ground.sci, p.ground && p.ground.ssi,
          (r.weights || {}).cr, (r.planting_window || {}).target, l.treeCount, l.shrubCount, l.co2TonnesPerYear, (r.photos || []).length, (r.photos || []).map(x => x.url).join(' '), r.engine_version].map(csvCell).join(','));
      });
      return new Response(lines.join('\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="planting-runs.csv"', 'cache-control': 'no-store' } });
    }
    const limit = Math.min(200, Math.max(1, parseInt(u.searchParams.get('limit') || '50', 10)));
    const offset = Math.max(0, parseInt(u.searchParams.get('offset') || '0', 10));
    const rows = await q.query(
      `SELECT id, created_at, trigger, lat, lon, place_name, district, zone, inputs, palette, weights->'cr' AS cr, planting_window->'target' AS target, photos, engine_version
       FROM planting_runs ${sqlWhere} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, args);
    const total = await q.query(`SELECT count(*)::int AS n FROM planting_runs ${sqlWhere}`, args);
    const districts = await q.query(`SELECT district, count(*)::int AS n FROM planting_runs WHERE district IS NOT NULL GROUP BY district ORDER BY district`);
    return json({ ok: true, total: total[0].n, limit, offset, runs: rows, districts });
  } catch (e) { return fail(e); }
}

export async function DELETE(request) {
  try {
    requireAdmin(request);
    await ensureSchema();
    const id = new URL(request.url).searchParams.get('id');
    if (!id || !UUID.test(id)) throw new HttpError(400, 'Invalid id.');
    const rows = await sql().query('DELETE FROM planting_runs WHERE id = $1 RETURNING id', [id]);
    if (!rows.length) throw new HttpError(404, 'No run with that id.');
    return json({ ok: true, deleted: id });
  } catch (e) { return fail(e); }
}
