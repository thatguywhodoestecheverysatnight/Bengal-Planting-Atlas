/* GET /api/geocode?lat=..&lon=..
   Reverse geocodes a coordinate to a place name. Uses Google when
   GOOGLE_MAPS_API_KEY is set, otherwise OpenStreetMap Nominatim.
   Responses are cached at Vercel's edge for 30 days per coordinate,
   which also keeps us well inside Nominatim's fair-use policy. */
import { json, fail, HttpError } from './_lib/http.js';

const pick = (...v) => v.find(x => x && String(x).trim()) || null;
const uniq = a => a.filter((x, i) => x && a.findIndex(y => y && y.toLowerCase() === x.toLowerCase()) === i);

function osmEmbed(lat, lon) {
  const dx = 0.012, dy = 0.008;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${(lon - dx).toFixed(5)}%2C${(lat - dy).toFixed(5)}%2C${(lon + dx).toFixed(5)}%2C${(lat + dy).toFixed(5)}&layer=mapnik&marker=${lat.toFixed(5)}%2C${lon.toFixed(5)}`;
}

async function viaNominatim(lat, lon, referer) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1&accept-language=en`;
  const r = await (globalThis.__BPA_TEST_FETCH__ || fetch)(url, { headers: { 'User-Agent': 'BengalPlantingAtlas/1.0 (reverse geocoding for planting site selection)', 'Referer': referer || 'https://vercel.app' } });
  if (!r.ok) throw new HttpError(502, `OpenStreetMap lookup failed (${r.status}).`);
  const d = await r.json();
  if (d.error) return { found: false, source: 'openstreetmap' };
  const a = d.address || {};
  const name = pick(a.neighbourhood, a.suburb, a.quarter, a.hamlet, a.village, a.town, a.city_district, a.city, a.municipality, d.name, a.county);
  const locality = pick(a.village, a.town, a.city, a.municipality);
  const block = pick(a.county, a.subdistrict);
  const district = pick(a.state_district, a.district);
  return {
    found: true, source: 'openstreetmap', name,
    detail: uniq([locality !== name ? locality : null, block, district, a.state, a.postcode]).join(', '),
    locality, block, district, state: a.state || null, postcode: a.postcode || null,
    display: d.display_name || null, embedUrl: osmEmbed(lat, lon),
    attribution: 'Place data © OpenStreetMap contributors'
  };
}

async function viaGoogle(lat, lon, key) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&language=en&key=${encodeURIComponent(key)}`;
  const r = await (globalThis.__BPA_TEST_FETCH__ || fetch)(url);
  if (!r.ok) throw new HttpError(502, `Google lookup failed (${r.status}).`);
  const d = await r.json();
  if (d.status === 'ZERO_RESULTS') return { found: false, source: 'google' };
  if (d.status !== 'OK') throw new HttpError(502, `Google Geocoding returned ${d.status}${d.error_message ? ': ' + d.error_message : ''}.`);
  const comps = {};
  d.results.forEach(res => res.address_components.forEach(c => c.types.forEach(t => { if (!comps[t]) comps[t] = c.long_name; })));
  const name = pick(comps.sublocality_level_2, comps.sublocality_level_1, comps.neighborhood, comps.locality, comps.administrative_area_level_3);
  const locality = pick(comps.locality, comps.administrative_area_level_3);
  const block = pick(comps.administrative_area_level_3);
  const district = pick(comps.administrative_area_level_2);
  return {
    found: true, source: 'google', name,
    detail: uniq([locality !== name ? locality : null, block, district, comps.administrative_area_level_1, comps.postal_code]).join(', '),
    locality, block, district, state: comps.administrative_area_level_1 || null, postcode: comps.postal_code || null,
    display: d.results[0] ? d.results[0].formatted_address : null,
    embedUrl: `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${lat},${lon}&zoom=15&maptype=satellite`,
    attribution: 'Place data © Google'
  };
}

export async function GET(request) {
  try {
    const u = new URL(request.url);
    const lat = Math.round(parseFloat(u.searchParams.get('lat')) * 1e4) / 1e4;
    const lon = Math.round(parseFloat(u.searchParams.get('lon')) * 1e4) / 1e4;
    if (!isFinite(lat) || !isFinite(lon) || lat < 20 || lat > 28.5 || lon < 85 || lon > 90.5) throw new HttpError(400, 'Coordinates must be decimal degrees within or near West Bengal.');
    const key = process.env.GOOGLE_MAPS_API_KEY;
    let place;
    try { place = key ? await viaGoogle(lat, lon, key) : await viaNominatim(lat, lon, request.headers.get('origin') || request.headers.get('referer')); }
    catch (e) { if (key) place = await viaNominatim(lat, lon); else throw e; }
    place.lat = lat; place.lon = lon;
    place.mapsLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    return json(place, 200, { 'cache-control': 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400' });
  } catch (e) { return fail(e); }
}
