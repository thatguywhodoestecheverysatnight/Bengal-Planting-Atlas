/* Bengal Planting Atlas : archive page */
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let token = '', offset = 0, total = 0, loaded = [];
  try { token = sessionStorage.getItem('bpa-admin') || ''; } catch (e) { }

  const fmtWhen = d => { const x = new Date(d); return { day: x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }), time: x.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }; };
  const ssi = v => v == null ? '' : `<span class="mono">${Number(v).toFixed(3)}</span>`;

  async function call(path, opts = {}) {
    const r = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), 'x-admin-token': token } });
    if (r.status === 401) { lock('Wrong passcode.'); throw new Error('locked'); }
    return r;
  }
  async function health() {
    try {
      const j = await (await fetch('api/health', { cache: 'no-store' })).json();
      if (j.setupRemaining && j.setupRemaining.length) {
        $('#setup').hidden = false;
        $('#setup').innerHTML = `<b>Setup still needed in Vercel</b><ul>${j.setupRemaining.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
      }
    } catch (e) {
      $('#setup').hidden = false;
      $('#setup').innerHTML = '<b>The archive API is not reachable.</b> This page works on the deployed Vercel site, where the /api functions run.';
    }
  }
  function lock(msg) {
    token = ''; try { sessionStorage.removeItem('bpa-admin'); } catch (e) { }
    $('#gate').hidden = false; $('#vault').hidden = true; $('#lockBtn').hidden = true;
    $('#gateMsg').textContent = msg || '';
  }
  function params(extra = {}) {
    const p = new URLSearchParams();
    const q = $('#fq').value.trim(); if (q) p.set('q', q);
    if ($('#fd').value) p.set('district', $('#fd').value);
    if ($('#ffrom').value) p.set('from', $('#ffrom').value);
    if ($('#fto').value) p.set('to', $('#fto').value);
    if ($('#fphotos').checked) p.set('photos', '1');
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return p.toString();
  }
  async function load(reset) {
    if (reset) { offset = 0; loaded = []; $('#list').innerHTML = ''; }
    const r = await call('api/runs?' + params({ limit: 30, offset }));
    const j = await r.json();
    if (!r.ok) { $('#list').innerHTML = `<div class="empty-arc">${esc(j.error || 'Could not load the archive.')}</div>`; return false; }
    total = j.total; loaded = loaded.concat(j.runs); offset += j.runs.length;
    const sel = $('#fd'), cur = sel.value;
    sel.innerHTML = '<option value="">All districts</option>' + j.districts.map(d => `<option value="${esc(d.district)}">${esc(d.district)} (${d.n})</option>`).join('');
    sel.value = cur;
    $('#count').textContent = `${total} run${total === 1 ? '' : 's'}`;
    if (!loaded.length) $('#list').innerHTML = '<div class="empty-arc">No saved palettes match. Palettes appear here as soon as they are generated on the atlas.</div>';
    else $('#list').insertAdjacentHTML('beforeend', j.runs.map(row).join(''));
    $('#more').hidden = offset >= total;
    return true;
  }
  function row(r) {
    const w = fmtWhen(r.created_at), p = r.palette || {}, ph = r.photos || [];
    return `<button class="run" type="button" data-id="${r.id}">
      <span class="when"><b>${w.day}</b>${w.time} · ${esc(r.trigger || '')}</span>
      <span class="pl">${esc(r.place_name || 'Unnamed ground')}<small>${esc(r.district || 'Outside West Bengal')} · ${Number(r.lat).toFixed(4)}, ${Number(r.lon).toFixed(4)}</small></span>
      <span class="sp">
        <span><b>Tree</b><i class="sci">${esc(p.tree ? p.tree.sci : 'none')}</i> ${ssi(p.tree && p.tree.ssi)}</span>
        <span><b>Shrub</b><i class="sci">${esc(p.shrub ? p.shrub.sci : 'none')}</i> ${ssi(p.shrub && p.shrub.ssi)}</span>
        <span><b>Ground</b><i class="sci">${esc(p.ground ? p.ground.sci : 'none')}</i> ${ssi(p.ground && p.ground.ssi)}</span>
      </span>
      <span class="ph">${ph.slice(0, 3).map(x => `<img src="${esc(x.url)}" alt="" loading="lazy">`).join('')}${ph.length > 3 ? `<span class="more">+${ph.length - 3}</span>` : ''}</span>
    </button>`;
  }
  const kv = obj => `<div class="kv">${Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</b></div>`).join('')}</div>`;
  function atlasLink(r) {
    const i = r.inputs || {}, p = new URLSearchParams({ lat: r.lat, lon: r.lon });
    if (i.areaHa) p.set('area', i.areaHa); if (i.shape) p.set('shape', i.shape); if (i.landCover) p.set('lu', i.landCover);
    if (i.micro) p.set('micro', i.micro); if (i.tidal) p.set('tidal', i.tidal); if (i.airSetting) p.set('air', i.airSetting);
    return './?' + p.toString();
  }
  async function open(id) {
    const r = await call('api/runs?id=' + encodeURIComponent(id)); const j = await r.json();
    if (!r.ok) return;
    const x = j.run, w = fmtWhen(x.created_at), p = x.palette || {}, s = x.site || {}, i = x.inputs || {}, L = x.layout || {}, W = x.weights || {}, P = x.planting_window || {}, AC = x.air_carbon || {};
    $('#dWhen').textContent = `${w.day} · ${w.time} · ${x.trigger || ''} · engine ${x.engine_version}`;
    $('#dTitle').textContent = x.place_name || 'Unnamed ground';
    $('#dSub').textContent = [x.place && x.place.detail, x.district, x.zone].filter(Boolean).join(' · ');
    const pal = (k, lab) => p[k] ? `<div><span>${lab}</span><i class="sci">${esc(p[k].sci)}</i><small>${esc(p[k].bengali || '')} · SSI ${Number(p[k].ssi).toFixed(3)}${p[k].apti ? ' · APTI ' + p[k].apti : ''}${p[k].co2KgPerYear ? ' · ' + p[k].co2KgPerYear + ' kg CO2/yr' : ''}</small></div>` : '';
    const ranked = st => ((x.ranked || {})[st] || []).map(e => `<span class="sci">${esc(e.sci)}</span> ${Number(e.ssi).toFixed(2)}`).join(', ') || 'none';
    const photos = x.photos || [];
    $('#dBody').innerHTML = `
      <div class="dact"><a class="btn sm" href="${atlasLink(x)}" target="_blank" rel="noopener">Reopen in the atlas</a><a class="btn sm ghost" href="https://www.google.com/maps/search/?api=1&query=${x.lat},${x.lon}" target="_blank" rel="noopener">Google Maps</a><button class="btn sm danger" type="button" id="del">Delete record</button><span class="note" id="delMsg"></span></div>
      <div class="dsec"><h3>Prescribed palette</h3><div class="pal">${pal('tree', 'Tree, primary canopy')}${pal('understory', 'Understory tree')}${pal('shrub', 'Shrub')}${pal('ground', 'Ground cover')}</div></div>
      ${photos.length ? `<div class="dsec"><h3>Site photos (${photos.length})</h3><div class="gallery">${photos.map(ph => `<a href="${esc(ph.url)}" target="_blank" rel="noopener"><img src="${esc(ph.url)}" alt="${esc(ph.kind)} photo ${esc(ph.name || '')}" loading="lazy"><span>${ph.kind === 'surroundings' ? 'Surrounding region' : 'The site'}</span></a>`).join('')}</div></div>` : ''}
      <div class="dsec"><h3>Inputs</h3>${kv({ Latitude: x.lat, Longitude: x.lon, 'Area (ha)': i.areaHa, Shape: i.shape, 'Land cover': `${i.landCover}${i.landCoverResolved && i.landCover === 'auto' ? ' (' + i.landCoverResolved + ')' : ''}`, 'Micro-topography': i.micro, Tidal: `${i.tidal}${i.tidal === 'auto' ? ' (' + (i.tidalResolved ? 'yes' : 'no') + ')' : ''}`, 'Air criterion': i.airCriterion ? 'included' : 'excluded' })}</div>
      <div class="dsec"><h3>Site profile</h3>${kv({ Station: `${s.station} (${s.stationKm} km)`, Soil: s.soil, 'Rainfall mm': s.rainfallMm, 'Heat index C': s.heatIndexC, pH: s.pH, 'Ks cm/h': s.ksCmPerHour, 'Water table m': s.waterTableM, 'EC dS/m': s.salinityDsM, 'Slope deg': s.slopeDeg, 'Elevation m': s.elevationM, 'Winter min C': s.winterMinC, PM10: s.pm10, 'UTM 45N': s.utm45n ? s.utm45n.e + ' E ' + s.utm45n.n + ' N' : null })}</div>
      <div class="dsec"><h3>AHP weights · CR ${W.cr}${W.renormalised ? ' (renormalised)' : ''} · λmax ${W.lambdaMax}</h3>${kv(Object.fromEntries((W.criteria || []).map(c => [c.label, `${c.weight} (s ${c.severity})`])))}</div>
      <div class="dsec"><h3>Species at SSI 0.85 and above</h3><p class="ranklist"><b>Trees:</b> ${ranked('tree')}</p><p class="ranklist"><b>Shrubs:</b> ${ranked('shrub')}</p><p class="ranklist"><b>Ground covers:</b> ${ranked('ground')}</p></div>
      <div class="dsec"><h3>Layout and window</h3>${kv({ Trees: (L.metrics || {}).treeCount, Shrubs: (L.metrics || {}).shrubCount, 'Canopy %': (L.metrics || {}).canopyPct, 'Mound m3': (L.metrics || {}).moundVolumeM3, 'CO2 t/yr': (L.metrics || {}).co2TonnesPerYear, 'CO2 stock t': (L.metrics || {}).co2StockTonnes, 'Window opens': P.start, 'Target date': P.target, 'Window closes': P.end, 'Monsoon onset': P.onset, 'PM10 x NAAQS': AC.naaqsMultiple })}</div>
      <details class="dsec"><summary>Full record as stored</summary><pre class="raw">${esc(JSON.stringify(x, null, 2))}</pre></details>`;
    $('#drawer').hidden = false; document.documentElement.classList.add('locked');
    let armed = false;
    $('#del').addEventListener('click', async () => {
      if (!armed) { armed = true; $('#del').textContent = 'Press again to delete permanently'; return; }
      const d = await call('api/runs?id=' + encodeURIComponent(x.id), { method: 'DELETE' });
      if (d.ok) { close(); load(true); } else $('#delMsg').textContent = 'Could not delete.';
    });
  }
  function close() { $('#drawer').hidden = true; document.documentElement.classList.remove('locked'); }
  async function exportAs(fmt) {
    const r = await call('api/runs?' + params({ format: fmt }));
    const b = await r.blob(), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = `planting-runs-${new Date().toISOString().slice(0, 10)}.${fmt}`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async function unlock(t) {
    token = t; $('#gateMsg').textContent = 'Checking';
    try {
      const ok = await load(true);
      if (!ok) { $('#gateMsg').textContent = ''; }
      try { sessionStorage.setItem('bpa-admin', token); } catch (e) { }
      $('#gate').hidden = true; $('#vault').hidden = false; $('#lockBtn').hidden = false;
    } catch (e) { if (e.message !== 'locked') $('#gateMsg').textContent = 'The archive API is not reachable from here.'; }
  }
  let deb;
  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.add('js');
    health();
    $('#gateForm').addEventListener('submit', e => { e.preventDefault(); unlock($('#pass').value); });
    $('#lockBtn').addEventListener('click', () => lock(''));
    ['#fq', '#fd', '#ffrom', '#fto', '#fphotos'].forEach(id => $(id).addEventListener(id === '#fq' ? 'input' : 'change', () => { clearTimeout(deb); deb = setTimeout(() => load(true), 300); }));
    $('#more').addEventListener('click', () => load(false));
    $('#list').addEventListener('click', e => { const b = e.target.closest('.run'); if (b) open(b.dataset.id); });
    $('#exJson').addEventListener('click', () => exportAs('json'));
    $('#exCsv').addEventListener('click', () => exportAs('csv'));
    $('#dClose').addEventListener('click', close); $('#scrim').addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#drawer').hidden) close(); });
    if (token) unlock(token);
  });
})();
