/* ------------------------------------------------------------------
   Bengal Planting Atlas : place names, site photos, archive autosave
   Talks to the Vercel functions in /api. On a host without them (a
   static preview) place names fall back to OpenStreetMap directly and
   saving is switched off with a clear message.
------------------------------------------------------------------ */
const Store = (() => {
  const ENGINE_VERSION = '2026.09-2';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const api = { checked: false, up: false, db: false, photos: false, placeNames: 'openstreetmap' };
  let session = null, place = null, placeKey = '', placePromise = null, embedOpen = false;
  const photos = { site: [], surroundings: [] };
  let saveTimer = null, lastSavedHash = '', pending = null;

  /* ---------- helpers ---------- */
  function sessionId() {
    if (session) return session;
    try { session = localStorage.getItem('bpa-session'); } catch (e) { }
    if (!session) {
      session = (crypto.randomUUID ? crypto.randomUUID() : 's-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
      try { localStorage.setItem('bpa-session', session); } catch (e) { }
    }
    return session;
  }
  async function sha(text) {
    try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 40); }
    catch (e) { let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0; return 'd' + (h >>> 0).toString(16); }
  }
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const r3 = v => (v == null || !isFinite(v)) ? null : Math.round(v * 1000) / 1000;

  async function health() {
    try {
      const r = await fetch('api/health', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      Object.assign(api, { up: true, db: !!j.databaseReachable, photos: !!j.photos, placeNames: j.placeNames });
    } catch (e) { api.up = false; }
    api.checked = true;
    paintSaveState();
    return api;
  }

  /* ---------- place name ---------- */
  function osmDirect(lat, lon) {
    return fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1&accept-language=en`)
      .then(r => r.json()).then(d => {
        const a = d.address || {}, pick = (...v) => v.find(x => x);
        const name = pick(a.neighbourhood, a.suburb, a.quarter, a.hamlet, a.village, a.town, a.city_district, a.city, a.municipality, d.name, a.county);
        const locality = pick(a.village, a.town, a.city, a.municipality);
        const parts = [locality !== name ? locality : null, a.county, a.state_district, a.state, a.postcode].filter(Boolean);
        return { found: !d.error, source: 'openstreetmap', name, detail: parts.filter((x, i) => parts.indexOf(x) === i).join(', '), district: a.state_district || null, block: a.county || null,
          display: d.display_name, lat, lon, mapsLink: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
          embedUrl: `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.012}%2C${lat - 0.008}%2C${lon + 0.012}%2C${lat + 0.008}&layer=mapnik&marker=${lat}%2C${lon}`, attribution: 'Place data © OpenStreetMap contributors' };
      });
  }
  function lookupPlace(lat, lon) {
    const la = Math.round(lat * 1e4) / 1e4, lo = Math.round(lon * 1e4) / 1e4, key = la + ',' + lo;
    if (key === placeKey && placePromise) return placePromise;
    placeKey = key; place = null;
    paintPlace({ loading: true, lat: la, lon: lo });
    const viaApi = () => fetch(`api/geocode?lat=${la}&lon=${lo}`).then(r => { if (!r.ok) throw new Error('geocode ' + r.status); return r.json(); });
    placePromise = (api.checked && !api.up ? osmDirect(la, lo) : viaApi().catch(() => osmDirect(la, lo)))
      .then(p => { if (key !== placeKey) return p; place = p; paintPlace(p); return p; })
      .catch(() => { if (key === placeKey) paintPlace({ error: true, lat: la, lon: lo }); return null; });
    return placePromise;
  }
  function paintPlace(p) {
    const box = $('#place'); if (!box) return;
    const gm = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
    $('#placeGmaps').href = p.mapsLink || gm;
    box.classList.toggle('loading', !!p.loading);
    if (p.loading) { $('#placeName').textContent = 'Finding the place name'; $('#placeDetail').textContent = `${p.lat.toFixed(4)} N, ${p.lon.toFixed(4)} E`; $('#placeSrc').textContent = ''; return; }
    if (p.error) { $('#placeName').textContent = 'Place name unavailable here'; $('#placeDetail').textContent = 'Name lookup runs on the deployed site. Coordinates above are exact.'; $('#placeSrc').textContent = ''; return; }
    if (!p.found || !p.name) { $('#placeName').textContent = 'Unnamed ground'; $('#placeDetail').textContent = p.display || 'No named locality at this exact point.'; }
    else { $('#placeName').textContent = p.name; $('#placeDetail').textContent = p.detail || p.display || ''; }
    $('#placeSrc').textContent = p.attribution || '';
    if (embedOpen) showEmbed(p);
  }
  function showEmbed(p) {
    const host = $('#placeEmbed');
    const url = (p && p.embedUrl) || (place && place.embedUrl);
    if (!url) { host.hidden = false; host.innerHTML = '<p class="note">Map preview loads once the place name is found.</p>'; return; }
    if (host.dataset.src !== url) { host.innerHTML = `<iframe title="Map of the selected site" src="${esc(url)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`; host.dataset.src = url; }
    host.hidden = false;
  }

  /* ---------- photos ---------- */
  const MAX_PER_KIND = 6;
  async function compress(file) {
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch (e) {
      bmp = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('unreadable')); img.src = URL.createObjectURL(file); });
    }
    const w0 = bmp.width, h0 = bmp.height, k = Math.min(1, 2000 / Math.max(w0, h0));
    const w = Math.round(w0 * k), h = Math.round(h0 * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
    if (!blob) throw new Error('unreadable');
    return { blob, width: w, height: h };
  }
  async function addFiles(kind, files) {
    const list = Array.from(files || []).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    for (const f of list) {
      if (photos[kind].length >= MAX_PER_KIND) { flashPhotos(`Up to ${MAX_PER_KIND} photos per group.`); break; }
      const item = { id: Math.random().toString(36).slice(2), kind, name: f.name, status: 'preparing', url: null, preview: null, width: null, height: null, bytes: null, caption: '' };
      photos[kind].push(item); paintPhotos();
      try {
        const c = await compress(f);
        item.preview = URL.createObjectURL(c.blob); item.width = c.width; item.height = c.height; item.bytes = c.blob.size;
        item.status = 'uploading'; paintPhotos();
        if (!api.checked) await health();
        if (!api.up || !api.photos) { item.status = api.up ? 'nostore' : 'local'; paintPhotos(); continue; }
        const r = await fetch(`api/upload?kind=${kind}&name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: c.blob });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.url) throw new Error(j.error || 'Upload failed');
        item.url = j.url; item.status = 'done';
      } catch (e) {
        item.status = 'error'; item.error = e.message === 'unreadable' ? 'This format could not be read here. Use JPEG or PNG.' : (e.message || 'Upload failed');
      }
      paintPhotos();
    }
  }
  function removePhoto(kind, id) {
    const i = photos[kind].findIndex(p => p.id === id);
    if (i >= 0) { const p = photos[kind][i]; if (p.preview) URL.revokeObjectURL(p.preview); photos[kind].splice(i, 1); }
    paintPhotos();
  }
  const STATUS = { preparing: 'Preparing', uploading: 'Uploading', done: 'Attached', error: 'Failed', local: 'Kept on this device, archive not connected', nostore: 'Kept on this device, photo storage not connected' };
  function paintPhotos() {
    ['site', 'surroundings'].forEach(kind => {
      const host = document.querySelector(`.thumbs[data-kind="${kind}"]`); if (!host) return;
      host.innerHTML = photos[kind].map(p => `
        <figure class="thumb ${p.status}" data-id="${p.id}">
          ${p.preview ? `<img src="${p.preview}" alt="${esc(kind === 'site' ? 'Site photo' : 'Surroundings photo')} ${esc(p.name)}">` : '<span class="thumb-ph"></span>'}
          <figcaption><span class="st">${esc(p.status === 'error' ? p.error : STATUS[p.status])}</span></figcaption>
          <button type="button" class="thumb-x" data-kind="${kind}" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">×</button>
        </figure>`).join('');
      const n = photos[kind].length;
      const cnt = document.querySelector(`.pcount[data-kind="${kind}"]`); if (cnt) cnt.textContent = n ? `${n} of ${MAX_PER_KIND}` : 'none yet';
    });
  }
  function flashPhotos(msg) { const n = $('#photoNote'); if (!n) return; n.textContent = msg; n.classList.add('warn'); setTimeout(() => { n.classList.remove('warn'); n.textContent = 'Optional. Attach before running the schema; photos are saved with every run that follows.'; }, 3500); }
  function bindPhotos() {
    document.querySelectorAll('.pdrop').forEach(zone => {
      const kind = zone.dataset.kind, input = zone.querySelector('input[type=file]');
      input.addEventListener('change', () => { addFiles(kind, input.files); input.value = ''; });
      ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('over'); }));
      zone.addEventListener('drop', e => addFiles(kind, e.dataTransfer && e.dataTransfer.files));
    });
    document.addEventListener('click', e => { const b = e.target.closest('.thumb-x'); if (b) removePhoto(b.dataset.kind, b.dataset.id); });
  }

  /* ---------- record ---------- */
  function buildRecord(res, input, trigger, raw) {
    const s = res.site, A = res.ahp, L = res.layout, w = res.window;
    const sp = e => e ? { id: e.sp.id, sci: e.sp.sci, bengali: e.sp.bn, common: e.sp.en, family: e.sp.fam, ssi: r3(e.ssi), status: e.sp.status,
      apti: e.sp.apti ? e.sp.apti[0] : null, dust: e.sp.dust, nitrogenFixer: !!e.sp.nfix, co2KgPerYear: e.carbon ? Math.round(e.carbon.co2PerYear) : null,
      canopyRadiusM: e.sp.r || null, heightM: e.sp.h || null, note: e.sp.note } : null;
    const sel = st => res.strata[st].filter(e => e.status === 'selected').map(e => ({ id: e.sp.id, sci: e.sp.sci, ssi: r3(e.ssi) }));
    const mix = {}; L.placed.forEach(p => { mix[p.sp.sci] = (mix[p.sp.sci] || 0) + 1; });
    const gc = k => L.gc[k] ? L.gc[k].sp.sci : null;
    const trees = L.placed.filter(p => p.kind === 'tree');
    const allPhotos = [...photos.site, ...photos.surroundings].filter(p => p.status === 'done' && p.url)
      .map(p => ({ url: p.url, kind: p.kind, name: p.name, caption: p.caption || null, width: p.width, height: p.height, bytes: p.bytes }));
    return {
      session_id: sessionId(), trigger, lat: +s.lat.toFixed(5), lon: +s.lon.toFixed(5),
      place_name: place && place.found ? place.name : null,
      place: place ? { name: place.name, detail: place.detail, locality: place.locality || null, block: place.block || null, district: place.district || null, display: place.display || null, source: place.source } : null,
      district: input.district, zone: input.zone ? ZONES[input.zone].name : null,
      inputs: { lat: +s.lat.toFixed(5), lon: +s.lon.toFixed(5), areaHa: input.areaHa, shape: input.shape, landCover: raw.lu, landCoverResolved: s.lu, micro: input.micro,
        tidal: input.tidal, tidalResolved: s.tidal, airCriterion: !!input.includeAir, airSetting: raw.air, district: input.district, zone: input.zone },
      site: { station: s.station, stationKm: r3(s.stationKm), soil: s.soil, rainfallMm: Math.round(s.p), onsetDayOfYear: s.on, heatIndexC: r3(s.hiMax), uhiC: s.uhi, pH: r3(s.ph),
        ksCmPerHour: r3(s.ksEff), waterTableM: r3(s.wt), salinityDsM: r3(s.ec), slopeDeg: r3(s.sl), elevationM: Math.round(s.el), winterMinC: r3(s.tmin), pondingIndex: r3(s.inu),
        pm10: Math.round(s.pm), ncapCity: !!s.ncap, tidal: !!s.tidal, microTopography: s.microLabel, utm45n: { e: Math.round(s.utm.e), n: Math.round(s.utm.n) } },
      weights: { criteria: res.criteria.map((c, i) => ({ key: c.key, label: c.label, value: c.value, severity: r3(c.s), weight: r3(A.w[i]) })),
        lambdaMax: r3(A.lambda), ci: r3(A.cons.ci), ri: A.cons.ri, cr: r3(A.cons.cr), rawCr: r3(A.raw.cons.cr), renormalised: !!A.repaired },
      palette: { tree: sp(res.picks.tree), understory: sp(res.picks.treeUnder), shrub: sp(res.picks.shrub), ground: sp(res.picks.ground) },
      ranked: { tree: sel('tree'), shrub: sel('shrub'), ground: sel('ground'), screened: res.evals.filter(e => e.status === 'screened').map(e => ({ sci: e.sp.sci, ssi: r3(e.ssi) })) },
      layout: { widthM: r3(L.W), heightM: r3(L.H), floodProne: !!L.floodProne, rootCollarTargetM: L.floodProne ? r3(L.collarTarget) : null, mix,
        groundCover: { open: gc('open'), underCanopy: gc('shade'), moundFaces: L.floodProne ? gc('mound') : null, basinFloor: L.areas.basin > 0 ? gc('basin') : null },
        areasM2: L.areas,
        metrics: { treeCount: L.metrics.treeCount, shrubCount: L.metrics.shrubCount, canopyPct: r3(L.metrics.canopyPct), ssiDensity: r3(L.metrics.ssiDensity),
          moundVolumeM3: Math.round(L.metrics.moundVol), co2StockTonnes: r3(L.metrics.co2Stock / 1000), co2TonnesPerYear: r3(L.metrics.co2Year / 1000), meanTreeApti: r3(L.metrics.aptiMean) } },
      planting_window: { onset: iso(w.onset), start: iso(w.start), target: iso(w.target), end: iso(w.end), year: w.year },
      air_carbon: { pm10: Math.round(s.pm), naaqsMultiple: r3(s.pm / 60), ncapCity: !!s.ncap, criterionIncluded: !!input.includeAir,
        tolerantTrees: trees.filter(p => p.sp.apti && p.sp.apti[0] >= 17).length, treesPlaced: trees.length,
        co2TonnesPerYear: r3(L.metrics.co2Year / 1000), co2StockTonnes: r3(L.metrics.co2Stock / 1000) },
      photos: allPhotos, engine_version: ENGINE_VERSION
    };
  }

  /* ---------- autosave ---------- */
  function paintSaveState(state, extra) {
    const el = $('#saveState'); if (!el) return;
    el.className = 'savestate ' + (state || '');
    if (state === 'saving') el.textContent = 'Saving this palette to the archive';
    else if (state === 'saved') el.textContent = `Saved to the archive at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · record ${String(extra).slice(0, 8)}`;
    else if (state === 'dup') el.textContent = 'Already in the archive, identical inputs were saved a moment ago';
    else if (state === 'error') el.textContent = `Not saved: ${extra}`;
    else if (!api.checked) el.textContent = 'Checking the archive connection';
    else if (!api.up) el.textContent = 'Archive saving runs on the deployed site. Results here are not stored.';
    else if (!api.db) el.textContent = 'Archive not connected yet: add a Neon database in the Vercel Storage tab.';
    else el.textContent = 'Every palette you generate is saved to the archive with its inputs and photos.';
  }
  async function save() {
    const job = pending; pending = null; if (!job) return;
    if (!api.checked) await health();
    if (!api.up || !api.db) { paintSaveState(); return; }
    if (placePromise) { await Promise.race([placePromise, new Promise(r => setTimeout(r, 4000))]); }
    const rec = buildRecord(job.res, job.input, job.trigger, job.raw);
    rec.input_hash = await sha(JSON.stringify([rec.inputs, rec.photos.map(p => p.url), ENGINE_VERSION]));
    if (rec.input_hash === lastSavedHash && job.trigger !== 'button') { paintSaveState('dup'); return; }
    paintSaveState('saving');
    try {
      const r = await fetch('api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rec) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || `server replied ${r.status}`);
      lastSavedHash = rec.input_hash;
      paintSaveState(j.duplicate ? 'dup' : 'saved', j.id);
    } catch (e) { paintSaveState('error', e.message); }
  }
  function onResult(res, input, trigger, raw) {
    lookupPlace(res.site.lat, res.site.lon);
    if (trigger === 'load') return;           /* opening the page is not a generated palette */
    pending = { res, input, trigger, raw };
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, trigger === 'button' ? 150 : 1200);
  }

  function init() {
    sessionId();
    bindPhotos(); paintPhotos(); paintSaveState();
    const btn = $('#placeMapBtn');
    btn.addEventListener('click', () => {
      embedOpen = !embedOpen; btn.setAttribute('aria-expanded', embedOpen ? 'true' : 'false');
      btn.textContent = embedOpen ? 'Hide map' : 'Show on map';
      if (embedOpen) showEmbed(place); else $('#placeEmbed').hidden = true;
    });
    health();
  }
  return { init, onResult, lookupPlace, get photos() { return photos; }, ENGINE_VERSION };
})();
