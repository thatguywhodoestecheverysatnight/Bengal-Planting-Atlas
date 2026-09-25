/* API tests: real Postgres (PGlite, in-process), mocked Blob and geocoder. */
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';

const pg = new PGlite();
const adapter = { query: async (text, params = []) => (await pg.query(text, params)).rows };
globalThis.__BPA_TEST_SQL__ = adapter;
const blobs = [];
globalThis.__BPA_TEST_BLOB__ = async (pathname, body, type) => { blobs.push({ pathname, bytes: body.length, type }); return { url: `https://abc123.public.blob.vercel-storage.com/${pathname.replace('.jpg', '-Xy12.jpg')}`, pathname }; };
globalThis.__BPA_TEST_FETCH__ = async url => ({ ok: true, json: async () => ({ display_name: 'Salt Lake Sector V, Bidhannagar, North 24 Parganas, West Bengal, 700091, India',
  address: { suburb: 'Sector V', city: 'Bidhannagar', county: 'Rajarhat', state_district: 'North 24 Parganas', state: 'West Bengal', postcode: '700091' } }) });
process.env.ADMIN_TOKEN = 'test-pass';

const health = await import('../api/health.js');
const geocode = await import('../api/geocode.js');
const upload = await import('../api/upload.js');
const runs = await import('../api/runs.js');
const req = (path, init = {}) => new Request('https://atlas.example' + path, init);
const body = async r => { const t = await r.text(); try { return JSON.parse(t); } catch (e) { return t; } };

let r = await health.GET(req('/api/health')); let j = await body(r);
assert.equal(j.database, true); assert.equal(j.databaseReachable, true); assert.equal(j.placeNames, 'openstreetmap');
console.log('health ok', JSON.stringify(j.setupRemaining));

r = await geocode.GET(req('/api/geocode?lat=22.58312&lon=88.41704')); j = await body(r);
assert.equal(r.status, 200); assert.equal(j.name, 'Sector V'); assert.match(j.detail, /Bidhannagar, Rajarhat, North 24 Parganas/);
assert.match(r.headers.get('cache-control'), /s-maxage/);
console.log('geocode ok:', j.name, '|', j.detail, '|', j.source);
r = await geocode.GET(req('/api/geocode?lat=51.5&lon=0')); assert.equal(r.status, 400);

r = await upload.POST(req('/api/upload?kind=surroundings&name=North%20Bank.JPG', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: new Uint8Array(2048) })); j = await body(r);
assert.equal(j.ok, true); assert.match(j.url, /surroundings-north-bank/); const photoUrl = j.url;
r = await upload.POST(req('/api/upload', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' })); assert.equal(r.status, 415);
console.log('upload ok', photoUrl);

const run = { session_id: 's-1', input_hash: 'h-1', trigger: 'map', lat: 22.583, lon: 88.417, place_name: 'Sector V', place: { name: 'Sector V' }, district: 'North 24 Parganas', zone: 'New Gangetic Alluvial',
  inputs: { areaHa: 2.5, shape: 'compact', landCover: 'urban', micro: 'auto', tidal: 'auto', airCriterion: true }, site: { p: 1700 }, weights: { cr: 0.024 },
  palette: { tree: { sci: 'Barringtonia acutangula', ssi: 0.985 }, understory: { sci: 'Pongamia pinnata' }, shrub: { sci: 'Clerodendrum inerme', ssi: 0.955 }, ground: { sci: 'Chrysopogon zizanioides', ssi: 1 } },
  ranked: { tree: [] }, layout: { metrics: { treeCount: 135, shrubCount: 677, co2TonnesPerYear: 12.3 } }, planting_window: { target: '2027-05-18' }, air_carbon: { pm10: 100 },
  photos: [{ url: photoUrl, kind: 'surroundings', name: 'North bank' }], engine_version: '2026.09-2' };
const post = b => runs.POST(req('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }));
r = await post(run); j = await body(r); assert.equal(r.status, 201); const id = j.id;
r = await post(run); j = await body(r); assert.equal(j.duplicate, true); assert.equal(j.id, id);
r = await post({ ...run, input_hash: 'h-2', lat: 23.33, lon: 86.36, district: 'Purulia', place_name: 'Purulia town', photos: [] }); assert.equal(r.status, 201);
r = await post({ ...run, input_hash: 'h-3', photos: [{ url: 'https://evil.example/x.jpg' }] }); assert.equal(r.status, 400);
r = await post({ ...run, input_hash: 'h-4', lat: 40 }); assert.equal(r.status, 400);
console.log('insert, duplicate skip and validation ok');

r = await runs.GET(req('/api/runs')); assert.equal(r.status, 401);
r = await runs.GET(req('/api/runs', { headers: { 'x-admin-token': 'nope' } })); assert.equal(r.status, 401);
const A = { headers: { 'x-admin-token': 'test-pass' } };
r = await runs.GET(req('/api/runs', A)); j = await body(r); assert.equal(j.total, 2); assert.equal(j.runs[0].district, 'Purulia'); assert.equal(j.districts.length, 2);
r = await runs.GET(req('/api/runs?q=sector', A)); j = await body(r); assert.equal(j.total, 1);
r = await runs.GET(req('/api/runs?district=Purulia', A)); j = await body(r); assert.equal(j.total, 1);
r = await runs.GET(req('/api/runs?photos=1', A)); j = await body(r); assert.equal(j.total, 1);
r = await runs.GET(req('/api/runs?q=Barringtonia&district=North%2024%20Parganas', A)); j = await body(r); assert.equal(j.total, 1);
r = await runs.GET(req('/api/runs?id=' + id, A)); j = await body(r); assert.equal(j.run.palette.tree.sci, 'Barringtonia acutangula'); assert.equal(j.run.photos[0].kind, 'surroundings');
r = await runs.GET(req('/api/runs?format=csv', A)); const csv = await r.text(); assert.equal(csv.split('\n').length, 3); assert.match(csv, /Barringtonia acutangula,0\.985/);
r = await runs.GET(req('/api/runs?format=json', A)); j = await body(r); assert.equal(j.count, 2);
console.log('list, filters, detail, CSV and JSON export ok');
console.log(csv.split('\n')[0].slice(0, 120) + ' ...');
r = await runs.DELETE(req('/api/runs?id=' + id, { method: 'DELETE', ...A })); assert.equal(r.status, 200);
r = await runs.GET(req('/api/runs', A)); j = await body(r); assert.equal(j.total, 1);
console.log('delete ok. All API tests passed.');
