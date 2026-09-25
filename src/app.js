/* ------------------------------------------------------------------
   Bengal Planting Atlas : interface
------------------------------------------------------------------ */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v, d = 1) => (v == null || isNaN(v)) ? 'n/a' : Number(v).toFixed(d);
  const fmtDate = d => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
  const fmtDateY = d => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const STR_LABEL = { tree: 'Tree', shrub: 'Shrub', ground: 'Ground cover' };
  const GLYPH = {
    tree: '<svg class="glyph" viewBox="0 0 40 40" aria-hidden="true"><g class="sway"><path d="M20 38 V22" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="20" cy="15" r="10" fill="currentColor" opacity=".85"/><circle cx="12.5" cy="20" r="6.5" fill="currentColor" opacity=".6"/><circle cx="27.5" cy="20" r="6.5" fill="currentColor" opacity=".6"/></g></svg>',
    shrub: '<svg class="glyph" viewBox="0 0 40 40" aria-hidden="true"><g class="sway"><path d="M6 34 C6 22 13 16 20 16 C27 16 34 22 34 34 Z" fill="currentColor" opacity=".8"/><circle cx="14" cy="22" r="5" fill="currentColor" opacity=".55"/><circle cx="26" cy="21" r="5.5" fill="currentColor" opacity=".55"/></g><path d="M4 35 H36" stroke="currentColor" stroke-width="1.6" opacity=".5"/></svg>',
    ground: '<svg class="glyph" viewBox="0 0 40 40" aria-hidden="true"><g class="sway" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 34 C8 26 6 22 4 18"/><path d="M13 34 C13 25 15 20 18 15"/><path d="M20 34 C20 24 19 18 20 10"/><path d="M27 34 C27 26 25 21 23 17"/><path d="M32 34 C32 27 34 23 37 19"/></g><path d="M3 35 H37" stroke="currentColor" stroke-width="1.6" opacity=".5"/></svg>'
  };
  const ssiRing = (v) => { const r = 27, c = 2 * Math.PI * r; return `<svg class="ssiring" viewBox="0 0 64 64" aria-hidden="true"><circle class="bg" cx="32" cy="32" r="${r}" fill="none" stroke-width="5"/><circle class="fg" cx="32" cy="32" r="${r}" fill="none" stroke-width="5" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - Math.min(1, v))).toFixed(1)}" style="--c:${c.toFixed(1)}"/></svg>`; };
  const CATS = ['var(--cat1)', 'var(--cat2)', 'var(--cat3)', 'var(--cat4)', 'var(--cat5)', 'var(--cat6)', 'var(--cat7)', 'var(--cat8)'];

  /* ---------- map geometry ---------- */
  const M = MAP_META;
  const proj = (lat, lon) => ({ x: (lon - M.lon0) * M.cosm * M.k, y: (M.lat1 - lat) * M.k });
  const unproj = (x, y) => ({ lon: x / (M.cosm * M.k) + M.lon0, lat: M.lat1 - y / M.k });
  DISTRICTS.forEach(d => {
    d.rings = d.d.split('M').filter(Boolean).map(seg => seg.replace('Z', '').trim().split(' ').map(p => p.split(',').map(Number)));
    d.zone = DISTRICT_META[d.code].zone;
  });
  function pip(pt, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function districtAt(lat, lon) {
    const p = proj(lat, lon);
    return DISTRICTS.find(d => d.rings.some(r => pip(p, r))) || null;
  }

  /* ---------- state ---------- */
  const state = {
    lat: 22.583, lon: 88.417, areaHa: 2.5, shape: 'compact', lu: 'auto', micro: 'auto', tidal: 'auto', air: 'auto',
    tab: 'tree', sort: 'ssi', res: null, hoverDistrict: null
  };
  try { const saved = JSON.parse(localStorage.getItem('bpa-state') || 'null'); if (saved && typeof saved.lat === 'number') Object.assign(state, saved, { res: null }); } catch (e) { }

  /* ---------- build the map ---------- */
  function buildMap() {
    const svg = $('#map');
    svg.setAttribute('viewBox', `-6 -6 ${M.W + 12} ${M.H + 12}`);
    let html = '';
    DISTRICTS.forEach(d => {
      html += `<path class="d" data-code="${d.code}" d="${d.d}" style="--zf:${ZONES[d.zone].color}"><title>${esc(d.name)}</title></path>`;
    });
    html += `<g class="marker" id="marker"><circle class="pulse" r="5"></circle><circle class="ring" r="7"></circle><circle class="dot" r="3.2"></circle></g>`;
    svg.innerHTML = html;
    svg.addEventListener('click', ev => {
      const pt = svgPoint(svg, ev);
      const ll = unproj(pt.x, pt.y);
      state.trigger = 'map'; setLocation(ll.lat, ll.lon, true);
    });
    svg.addEventListener('mousemove', ev => {
      const t = ev.target.closest('path.d');
      const name = t ? DISTRICTS.find(d => d.code === t.dataset.code) : null;
      $('#maphover').textContent = name ? `${name.name} · ${ZONES[name.zone].name}` : 'Click anywhere on the map';
    });
    svg.addEventListener('mouseleave', () => { $('#maphover').textContent = 'Click anywhere on the map'; });
    $('#zones').innerHTML = Object.values(ZONES).map(z => `<span><i style="background:${z.color}"></i>${esc(z.name)}</span>`).join('');
    const sel = $('#district');
    sel.innerHTML = '<option value="">Jump to a district</option>' + DISTRICTS.slice().sort((a, b) => a.name.localeCompare(b.name)).map(d => `<option value="${d.code}">${esc(d.name)}</option>`).join('');
    sel.addEventListener('change', () => {
      const d = DISTRICTS.find(x => x.code === sel.value); if (!d) return;
      const ll = unproj(d.cx, d.cy); state.trigger = 'district'; setLocation(ll.lat, ll.lon, true);
    });
    $('#presets').innerHTML = PRESETS.map((p, i) => `<button class="chip" type="button" data-i="${i}">${esc(p.n)}</button>`).join('');
    $('#presets').addEventListener('click', ev => {
      const b = ev.target.closest('.chip'); if (!b) return;
      const p = PRESETS[+b.dataset.i];
      state.lu = p.lu; state.areaHa = p.area; state.micro = p.micro; state.tidal = 'auto'; state.air = 'auto';
      syncForm(); state.trigger = 'preset'; setLocation(p.la, p.lo, true);
    });
  }
  function svgPoint(svg, ev) {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function placeMarker() {
    const p = proj(state.lat, state.lon);
    const g = $('#marker'); g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    const d = districtAt(state.lat, state.lon);
    $$('#map path.d').forEach(el => el.classList.toggle('sel', !!d && el.dataset.code === d.code));
    const selEl = d && $(`#map path.d[data-code="${d.code}"]`); if (selEl) $('#map').insertBefore(selEl, g);
    $('#district').value = d ? d.code : '';
    if (use3d) Map3D.select(state.lat, state.lon, d ? d.code : null);
  }
  let use3d = false;

  /* ---------- form ---------- */
  function syncForm() {
    $('#lat').value = state.lat.toFixed(4); $('#lon').value = state.lon.toFixed(4);
    $('#area').value = state.areaHa; $('#shape').value = state.shape; $('#lu').value = state.lu;
    $('#micro').value = state.micro; $('#tidal').value = state.tidal; $('#air').value = state.air;
  }
  function readForm() {
    const lat = parseFloat($('#lat').value), lon = parseFloat($('#lon').value);
    if (!isNaN(lat) && !isNaN(lon)) { state.lat = lat; state.lon = lon; }
    state.areaHa = Math.max(0.1, Math.min(50, parseFloat($('#area').value) || 2.5));
    state.shape = $('#shape').value; state.lu = $('#lu').value; state.micro = $('#micro').value; state.tidal = $('#tidal').value; state.air = $('#air').value;
  }
  function setLocation(lat, lon, run) {
    state.lat = +lat.toFixed(5); state.lon = +lon.toFixed(5);
    $('#lat').value = state.lat.toFixed(4); $('#lon').value = state.lon.toFixed(4);
    placeMarker();
    if (run) runNow(true);
  }
  let timer = null;
  function scheduleRun() { state.trigger = 'field'; clearTimeout(timer); timer = setTimeout(() => runNow(false), 250); }

  /* ---------- run ---------- */
  function runNow(animate) {
    readForm();
    const d = districtAt(state.lat, state.lon);
    const probe = fetchEnvironment(state.lat, state.lon);
    const luRes = state.lu === 'auto' ? probe.lu : state.lu;
    const includeAir = state.air === 'on' ? true : state.air === 'off' ? false : (luRes !== 'rural' || probe.ncap);
    const input = { lat: state.lat, lon: state.lon, areaHa: state.areaHa, shape: state.shape, lu: state.lu, micro: state.micro, tidal: state.tidal, includeAir,
      zone: d ? d.zone : null, district: d ? d.name : null };
    const res = runPipeline(input);
    state.res = res;
    const trig = state.trigger || 'field'; state.trigger = null;
    try { localStorage.setItem('bpa-state', JSON.stringify({ lat: state.lat, lon: state.lon, areaHa: state.areaHa, shape: state.shape, lu: state.lu, micro: state.micro, tidal: state.tidal, air: state.air, tab: state.tab, sort: state.sort })); } catch (e) { }
    render(res, d, animate);
    if (typeof Store !== 'undefined') Store.onResult(res, input, trig, { lu: state.lu, air: state.air });
  }

  /* ---------- render ---------- */
  function render(res, district, animate) {
    const s = res.site;
    $('#outside').hidden = !!district;
    $('#locsum').innerHTML = district
      ? `<b>${esc(district.name)}</b> district · ${esc(ZONES[district.zone].name)}<br><span class="mono">${s.lat.toFixed(4)} N, ${s.lon.toFixed(4)} E · UTM 45N ${Math.round(s.utm.e)} E ${Math.round(s.utm.n)} N</span><br>Nearest grid station ${esc(s.station)}, ${s.stationKm.toFixed(1)} km`
      : `<b>Outside the West Bengal boundary</b><br><span class="mono">${s.lat.toFixed(4)} N, ${s.lon.toFixed(4)} E</span><br>Nearest grid station ${esc(s.station)}, ${s.stationKm.toFixed(1)} km`;
    renderLive(res, district);
    renderPipeline(res, animate);
    renderProfile(res);
    renderPicks(res);
    renderAHP(res);
    renderTable(res);
    renderScreened(res);
    renderPlan(res);
    renderWindow(res);
    renderAir(res);
    const R = $('#results');
    R.classList.remove('fresh'); if (animate) { void R.offsetWidth; R.classList.add('fresh'); }
  }

  let lastLive = '';
  function renderLive(res, district) {
    const name = district ? district.name : 'Outside West Bengal';
    const el = $('#liveDistrict');
    if (name !== lastLive) { el.textContent = name; el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); lastLive = name; }
    $('#liveZone').textContent = district ? ZONES[district.zone].name : `Nearest station ${res.site.station}`;
    $('#liveCoord').textContent = `${res.site.lat.toFixed(4)} N · ${res.site.lon.toFixed(4)} E · ${Math.round(res.site.el)} m · ${Math.round(res.site.p)} mm`;
    const P = res.picks;
    $('#livePicks').innerHTML = [['tree', P.tree], ['shrub', P.shrub], ['ground', P.ground]].map(([k, e]) => e
      ? `<li style="color:var(--cat${k === 'tree' ? 1 : k === 'shrub' ? 2 : 3})">${GLYPH[k]}<span><span class="st">${STR_LABEL[k]}</span><span class="sci" style="color:var(--ink)">${esc(e.sp.sci)}</span></span><span class="mono">${e.ssi.toFixed(3)}</span></li>`
      : `<li>${GLYPH[k]}<span><span class="st">${STR_LABEL[k]}</span>none above 0.85</span><span></span></li>`).join('');
  }

  function renderPipeline(res, animate) {
    const s = res.site, L = res.layout, w = res.window;
    const sel = res.evals.filter(e => e.status === 'selected').length;
    const vals = [
      `${s.lat.toFixed(3)}, ${s.lon.toFixed(3)}<br>EPSG 32645`,
      `${Math.round(s.p)} mm · ${s.hiMax.toFixed(1)} C<br>${esc(s.soil.split(',')[0])}`,
      `pH ${s.ph.toFixed(1)} · Ks ${s.ksEff.toFixed(2)}<br>WT ${s.wt.toFixed(1)} m · EC ${s.ec.toFixed(1)}`,
      `n = ${res.ahp.n} · CR ${res.ahp.cons.cr.toFixed(3)}<br>${res.ahp.repaired ? 'renormalised' : 'accepted'}`,
      `${sel} species at SSI ≥ 0.85<br>${res.strata.tree.filter(e => e.status === 'selected').length} T · ${res.strata.shrub.filter(e => e.status === 'selected').length} S · ${res.strata.ground.filter(e => e.status === 'selected').length} G`,
      `${L.metrics.treeCount} trees · ${L.metrics.shrubCount} shrubs<br>plant ${fmtDate(w.target)}`
    ];
    const steps = $$('#pipeline .step');
    steps.forEach((el, i) => { $('.v', el).innerHTML = vals[i]; el.classList.remove('on'); });
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    steps.forEach((el, i) => { if (animate && !reduce) setTimeout(() => el.classList.add('on'), 90 + i * 130); else el.classList.add('on'); });
  }

  function sevChip(d) {
    const cls = d > 0.66 ? 'hi' : d > 0.33 ? 'md' : '';
    const word = d > 0.8 ? 'extreme' : d > 0.6 ? 'severe' : d > 0.4 ? 'moderate' : d > 0.2 ? 'mild' : 'negligible';
    return `<span class="sev ${cls}"><i><b style="width:${Math.round(d * 100)}%"></b></i>${word}</span>`;
  }
  function renderProfile(res) {
    const s = res.site, C = Object.fromEntries(res.criteria.map(c => [c.key, c]));
    const t = (k, v, unit, d) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}${unit ? `<small>${unit}</small>` : ''}</div>${d != null ? `<div class="s">${sevChip(d)}</div>` : ''}</div>`;
    $('#profile').innerHTML =
      t('Annual rainfall', Math.round(s.p), 'mm', C.flood.d) +
      t('Peak heat index', s.hiMax.toFixed(1), 'C', C.heat.d) +
      t('Dry-season deficit', (C.drought.d * 100).toFixed(0), '% index', C.drought.d) +
      t('Topsoil pH', s.ph.toFixed(1), '', C.ph.d) +
      t('Hydraulic conductivity', s.ksEff < 0.1 ? s.ksEff.toFixed(3) : s.ksEff.toFixed(2), 'cm/h', C.wlog.d) +
      t('Monsoon water table', s.wt.toFixed(1), 'm', null) +
      t('Salinity (EC)', s.ec.toFixed(1), 'dS/m', C.ec.d) +
      t('Mean slope', s.sl.toFixed(1), 'deg', C.slope.d) +
      t('Elevation', Math.round(s.el), 'm AMSL', null) +
      t('Winter minimum', s.tmin.toFixed(1), 'C', C.frost.d) +
      t('PM10 annual', Math.round(s.pm), 'ug/m3', C.air ? C.air.d : null) +
      t('Monsoon onset', fmtDate(res.window.onset), '', null);
    $('#soil').innerHTML = `<b>Soil typology:</b> ${esc(s.soil)}. <b>Land use:</b> ${s.lu === 'urban' ? 'dense urban core' : s.lu === 'peri' ? 'peri-urban' : 'rural or open'} (UHI +${s.uhi.toFixed(1)} C, compaction factor ${Math.min(1.6, KS_LU[s.lu] / KS_LU[s.stationLu]).toFixed(2)}). <b>Micro-topography:</b> ${esc(s.microLabel)}${s.tidal ? '. <b>Tidal creek regime present.</b>' : ''}${s.ncap ? ' <b>CPCB NCAP non-attainment city.</b>' : ''}`;
  }

  function classAPTI(a) { return !a ? null : a[0] >= 17 ? 'tolerant' : a[0] >= 12 ? 'intermediate' : 'sensitive'; }
  function aptiTag(sp) {
    if (!sp.apti) return `<span class="tag">APTI not reported</span>`;
    const c = classAPTI(sp.apti);
    return `<span class="tag ${c === 'tolerant' ? 'ok' : c === 'sensitive' ? 'bad' : ''}">APTI ${sp.apti[0]} · ${c}</span>`;
  }
  function pickCard(kind, e, res, extra) {
    if (!e) return `<div class="pick ${kind}"><p class="eyebrow">${STR_LABEL[kind]}</p><div class="empty">No native ${STR_LABEL[kind].toLowerCase()} reaches SSI 0.85 under these conditions. See the ranked table for the nearest candidates.</div></div>`;
    const sp = e.sp, crit = res.criteria;
    const bars = crit.map((c, i) => { const x = e.xs[i].x; if (c.key === 'air' && sp.st === 'ground') return `<div class="bar"><span>${esc(c.short)}</span><i></i><span class="mono">n/a</span></div>`; return `<div class="bar"><span>${esc(c.short)}</span><i><b class="${x < 0.6 ? 'low' : x < 0.9 ? 'mid' : ''}" style="width:${Math.round(x * 100)}%"></b></i><span class="mono">${x.toFixed(2)}</span></div>`; }).join('');
    const carbon = e.carbon ? `<span class="tag slate">${Math.round(e.carbon.co2PerYear)} kg CO2/yr at maturity</span>` : sp.st === 'shrub' ? `<span class="tag slate">${carbonShrub(sp).co2PerYear.toFixed(1)} kg CO2/yr</span>` : '';
    const dims = sp.st === 'tree' ? `<span class="tag">canopy r ${sp.r} m · ${sp.h} m tall</span>` : sp.st === 'shrub' ? `<span class="tag">crown r ${sp.r} m · ${sp.h} m</span>` : `<span class="tag">${sp.bio} kg/m2 biomass</span>`;
    return `<div class="pick ${kind}">
      <div class="top"><p class="eyebrow">${STR_LABEL[kind]}${kind === 'tree' ? ' · primary canopy' : ''}</p>${GLYPH[kind]}</div>
      <div class="sci">${esc(sp.sci)}</div>
      <div class="names"><b>${esc(sp.bn)}</b> · ${esc(sp.en)} · ${esc(sp.fam)}</div>
      <div class="ssi">${ssiRing(e.ssi)}<div><span class="n mono" data-count="${e.ssi.toFixed(3)}" data-dec="3">${e.ssi.toFixed(3)}</span><span class="l">Species Suitability Index, threshold 0.85</span></div></div>
      <div class="bars">${bars}</div>
      <div class="meta">${aptiTag(sp)}${sp.dust ? `<span class="tag">dust capture ${sp.dust === 'H' ? 'high' : sp.dust === 'M' ? 'medium' : 'low'}</span>` : ''}${carbon}${dims}${sp.nfix ? '<span class="tag ok">nitrogen fixer</span>' : ''}${sp.status === 'naturalised' ? '<span class="tag warn">long-naturalised</span>' : ''}</div>
      <p class="why">${esc(sp.note)}</p>
      ${extra || ''}
    </div>`;
  }
  function renderPicks(res) {
    const P = res.picks;
    const under = P.treeUnder ? `<div class="also">Understory and edge: <span class="sci">${esc(P.treeUnder.sp.sci)}</span> (${esc(P.treeUnder.sp.bn)}), SSI <span class="mono">${P.treeUnder.ssi.toFixed(3)}</span>${P.treeUnder.sp.nfix ? ', nitrogen fixer' : ''}</div>` : '';
    const alsoT = res.strata.tree.filter(e => e.status === 'selected' && e !== P.tree && e !== P.treeUnder).slice(0, 4);
    const alsoS = res.strata.shrub.filter(e => e.status === 'selected' && e !== P.shrub).slice(0, 4);
    const alsoG = res.strata.ground.filter(e => e.status === 'selected' && e !== P.ground).slice(0, 4);
    const also = list => list.length ? `<div class="also">Also qualifying: ${list.map(e => `<span class="sci">${esc(e.sp.sci)}</span> <span class="mono">${e.ssi.toFixed(2)}</span>`).join(', ')}</div>` : '';
    const gc = res.layout.gc;
    const zoneLine = `<div class="also">Zoned in the layout: ${[gc.open && ['open ground', gc.open], gc.shade && ['under canopy', gc.shade], res.layout.floodProne && gc.mound && ['mound faces', gc.mound], res.layout.areas.basin > 0 && gc.basin && ['basin floors', gc.basin]].filter(Boolean).map(([k, e]) => `${k} <span class="sci">${esc(e.sp.sci)}</span>`).join(', ')}</div>`;
    $('#picks').innerHTML = pickCard('tree', P.tree, res, under + also(alsoT)) + pickCard('shrub', P.shrub, res, also(alsoS)) + pickCard('ground', P.ground, res, zoneLine + also(alsoG));
    if (typeof FX !== 'undefined') { FX.countUp($('#picks')); FX.tilt($('#picks')); }
  }

  function renderAHP(res) {
    const A = res.ahp, C = res.criteria, top = A.w.indexOf(Math.max(...A.w));
    $('#wbars').innerHTML = C.map((c, i) => `<div class="wbar ${i === top ? 'top' : ''}"><span class="l" title="${esc(c.label)}">${esc(c.label)}</span><i><b style="width:${(A.w[i] / A.w[top] * 100).toFixed(1)}%"></b></i><span class="mono">${A.w[i].toFixed(3)}</span></div>`).join('');
    const cr = A.cons.cr;
    $('#consist').innerHTML =
      `<div class="tile"><div class="k">λ max</div><div class="v">${A.lambda.toFixed(3)}</div></div>
       <div class="tile"><div class="k">CI</div><div class="v">${A.cons.ci.toFixed(3)}</div></div>
       <div class="tile"><div class="k">CR (RI ${A.cons.ri})</div><div class="v">${cr.toFixed(3)}</div></div>`;
    $('#crbadge').innerHTML = A.repaired
      ? `<span class="badge warn">Raw CR ${A.raw.cons.cr.toFixed(3)} exceeded 0.10, matrix renormalised from the eigenvector</span>`
      : `<span class="badge ok">CR ${cr.toFixed(3)} within the 0.10 consistency bound</span>`;
    const cell = v => { const l = Math.log(v); const t = Math.min(1, Math.abs(l) / Math.log(9)); const col = l > 0 ? 'var(--accent)' : 'var(--laterite)'; return `style="background:color-mix(in srgb, ${col} ${Math.round(t * 55)}%, var(--panel))"`; };
    const label = v => v >= 1 ? (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(2)) : (Math.abs(1 / v - Math.round(1 / v)) < 1e-6 ? `1/${Math.round(1 / v)}` : v.toFixed(2));
    $('#matrix').innerHTML = `<table><thead><tr><th></th>${C.map(c => `<th>${esc(c.short)}</th>`).join('')}<th>w</th></tr></thead><tbody>${A.A.map((row, i) => `<tr><th class="row">${esc(C[i].short)}</th>${row.map(v => `<td ${cell(v)}>${label(v)}</td>`).join('')}<td class="mono"><b>${A.w[i].toFixed(3)}</b></td></tr>`).join('')}</tbody></table>`;
    $('#sevlist').innerHTML = C.map(c => `<div class="eqrow"><span>${esc(c.label)} <span class="note">${esc(c.value)}</span></span><span class="mono">s = ${c.s.toFixed(1)}</span></div>`).join('');
  }

  function renderTable(res) {
    const list = res.strata[state.tab].slice();
    const counts = { tree: res.strata.tree.filter(e => e.status === 'selected').length, shrub: res.strata.shrub.filter(e => e.status === 'selected').length, ground: res.strata.ground.filter(e => e.status === 'selected').length };
    $$('#tabs .tab').forEach(b => { b.classList.toggle('on', b.dataset.tab === state.tab); $('.mono', b).textContent = counts[b.dataset.tab] + ' selected'; });
    if (state.sort === 'apti') list.sort((a, b) => ((b.sp.apti || [0])[0]) - ((a.sp.apti || [0])[0]) || b.ssi - a.ssi);
    if (state.sort === 'carbon') list.sort((a, b) => ((b.carbon ? b.carbon.co2PerYear : b.sp.st === 'shrub' ? carbonShrub(b.sp).co2PerYear : 0) - (a.carbon ? a.carbon.co2PerYear : a.sp.st === 'shrub' ? carbonShrub(a.sp).co2PerYear : 0)) || b.ssi - a.ssi);
    const stTag = e => e.status === 'selected' ? '<span class="tag ok">selected</span>' : e.status === 'below' ? '<span class="tag warn">below 0.85</span>' : e.status === 'gated' ? '<span class="tag">habitat gate</span>' : '<span class="tag bad">exotic, screened</span>';
    const rows = list.map(e => {
      const sp = e.sp, weak = res.criteria[e.weakest];
      const co2 = e.carbon ? Math.round(e.carbon.co2PerYear) : sp.st === 'shrub' ? carbonShrub(sp).co2PerYear.toFixed(1) : '';
      return `<tr class="${e.status === 'selected' ? '' : 'dim'}">
        <td><span class="sci">${esc(sp.sci)}</span><br><span class="bn">${esc(sp.bn)}</span> <span class="en">· ${esc(sp.en)}</span></td>
        <td><span class="ssibar"><i><b class="${e.status === 'selected' ? '' : e.status === 'below' ? 'below' : 'off'}" style="width:${Math.round(e.ssi * 100)}%"></b></i><span class="mono">${e.ssi.toFixed(3)}</span></span></td>
        <td>${stTag(e)}${e.reason ? `<div class="en">${esc(e.reason)}</div>` : ''}</td>
        <td>${sp.apti ? `<span class="mono">${sp.apti[0]}</span> <span class="en">(${sp.apti[1]} to ${sp.apti[2]}) ${classAPTI(sp.apti)}</span>` : '<span class="en">not reported</span>'}</td>
        <td class="num mono">${co2}</td>
        <td><span class="en">${e.status === 'selected' ? 'tightest: ' : ''}${esc(weak.short)} <span class="mono">${e.xs[e.weakest].x.toFixed(2)}</span></span></td>
        <td class="en">${sp.roles.slice(0, 4).map(esc).join(', ')}${sp.nfix ? ', N-fixer' : ''}</td>
      </tr>`;
    }).join('');
    $('#ranktable').innerHTML = `<thead><tr><th>Species</th><th>SSI</th><th>Status</th><th>APTI</th><th class="num">kg CO2/yr</th><th>Limiting criterion</th><th>Roles</th></tr></thead><tbody>${rows}</tbody>`;
  }

  function renderScreened(res) {
    const list = res.evals.filter(e => e.status === 'screened').sort((a, b) => b.ssi - a.ssi);
    $('#screened').innerHTML = list.map(e => `<div class="scr"><span class="sci">${esc(e.sp.sci)}</span>${esc(e.sp.en)} · <span class="mono">SSI ${e.ssi.toFixed(2)}</span>${e.sp.apti ? ` · <span class="mono">APTI ${e.sp.apti[0]}</span>` : ''}<br>${esc(e.sp.note)}</div>`).join('');
  }

  /* ---------- plan drawing ---------- */
  function renderPlan(res) {
    const L = res.layout, s = res.site;
    const W = L.W, H = L.H, pad = 14;
    const sc = 900 / Math.max(W, H);
    const px = v => (v * sc).toFixed(1);
    const species = [...new Set(L.placed.map(p => p.sp.id))];
    const colour = id => CATS[species.indexOf(id) % CATS.length];
    let svg = `<svg class="plansvg" viewBox="${-pad * sc} ${-pad * sc} ${(W + pad * 2) * sc} ${(H + pad * 2 + 6) * sc}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Planting plan">`;
    /* DEM raster */
    const cell = Math.max(2, Math.round(Math.max(W, H) / 60));
    let zmin = Infinity, zmax = -Infinity; const cells = [];
    for (let y = 0; y < H; y += cell) for (let x = 0; x < W; x += cell) { const zz = L.z(x + cell / 2, y + cell / 2); zmin = Math.min(zmin, zz); zmax = Math.max(zmax, zz); cells.push([x, y, zz]); }
    svg += `<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--slate)" stroke-width="1.2" opacity=".55"/></pattern></defs>`;
    svg += `<g shape-rendering="crispEdges">`;
    cells.forEach(([x, y, zz]) => {
      const t = zmax > zmin ? (zz - zmin) / (zmax - zmin) : 0.5;
      svg += `<rect x="${px(x)}" y="${px(y)}" width="${px(cell + 0.05)}" height="${px(cell + 0.05)}" fill="color-mix(in srgb, var(--dem-hi) ${Math.round(t * 100)}%, var(--dem-lo))"/>`;
    });
    svg += `</g>`;
    /* basins */
    cells.filter(c => c[2] < L.base - 0.25).forEach(([x, y]) => { svg += `<rect x="${px(x)}" y="${px(y)}" width="${px(cell + 0.05)}" height="${px(cell + 0.05)}" fill="url(#hatch)"/>`; });
    svg += `<rect x="0" y="0" width="${px(W)}" height="${px(H)}" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="6 3"/>`;
    /* mounds */
    if (L.floodProne) L.placed.filter(p => p.kind === 'tree' && p.mound > 0).forEach(p => { svg += `<circle cx="${px(p.x)}" cy="${px(H - p.y)}" r="${px(1.2 + 1.5 * p.mound)}" fill="var(--mound)" fill-opacity=".5" stroke="var(--ochre)" stroke-width=".8" stroke-dasharray="2 2"/>`; });
    /* shrubs then trees */
    const maxD = Math.hypot(W / 2, H / 2), dl = p => Math.round(Math.hypot(p.x - W / 2, p.y - H / 2) / maxD * 1100);
    L.placed.filter(p => p.kind === 'shrub').forEach(p => { svg += `<circle class="g" style="--d:${dl(p) + 500}ms" cx="${px(p.x)}" cy="${px(H - p.y)}" r="${px(p.r)}" fill="${colour(p.sp.id)}" fill-opacity=".55" stroke="${colour(p.sp.id)}" stroke-width=".6"/>`; });
    L.placed.filter(p => p.kind === 'tree').forEach(p => { svg += `<g class="g" style="--d:${dl(p)}ms"><circle cx="${px(p.x)}" cy="${px(H - p.y)}" r="${px(p.r)}" fill="${colour(p.sp.id)}" fill-opacity=".38" stroke="${colour(p.sp.id)}" stroke-width="1.1"/><circle cx="${px(p.x)}" cy="${px(H - p.y)}" r="${px(0.35)}" fill="var(--ink)"/></g>`; });
    /* scale bar and north */
    const sb = W > 60 ? 20 : 10;
    svg += `<g font-family="IBM Plex Mono, monospace" font-size="${(3.2 * sc).toFixed(1)}" fill="var(--ink-2)">
      <line x1="0" y1="${px(H + 4)}" x2="${px(sb)}" y2="${px(H + 4)}" stroke="var(--ink)" stroke-width="1.5"/>
      <text x="${px(sb + 1.5)}" y="${px(H + 5)}">${sb} m</text>
      <text x="${px(W)}" y="${px(H + 5.2)}" text-anchor="end">${W.toFixed(0)} × ${H.toFixed(0)} m · ${s.areaHa} ha · N up</text></g>`;
    svg += `</svg>`;
    $('#plan').innerHTML = svg;
    /* legend */
    const counts = {}; L.placed.forEach(p => counts[p.sp.id] = (counts[p.sp.id] || 0) + 1);
    let leg = species.map(id => { const p = L.placed.find(q => q.sp.id === id); return `<div class="li"><span class="sw" style="background:${colour(id)};border-color:${colour(id)}"></span><span><span class="sci">${esc(p.sp.sci)}</span> <span class="mono">${p.kind}</span></span><span class="mono">${counts[id]}</span></div>`; }).join('');
    const gcRow = (k, label, area) => L.gc[k] ? `<div class="li"><span class="sw sq" style="background:${k === 'basin' ? 'var(--basin)' : k === 'mound' ? 'var(--mound)' : 'var(--panel-3)'}"></span><span>${label}: <span class="sci">${esc(L.gc[k].sp.sci)}</span></span><span class="mono">${area} m2</span></div>` : '';
    leg += gcRow('open', 'Open ground cover', L.areas.open) + gcRow('shade', 'Under-canopy cover', L.areas.shade);
    if (L.floodProne) leg += gcRow('mound', 'Mound faces', L.areas.mound);
    if (L.areas.basin > 0) leg += gcRow('basin', 'Retention basin floor', L.areas.basin);
    $('#legend').innerHTML = leg;
    const m = L.metrics;
    const t = (k, v, u) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}${u ? `<small>${u}</small>` : ''}</div></div>`;
    $('#metrics').innerHTML = t('Trees', m.treeCount) + t('Shrubs', m.shrubCount) + t('Canopy cover', m.canopyPct.toFixed(0), '%') + t('SSI density', m.ssiDensity.toFixed(2)) +
      (L.floodProne ? t('Mound earthwork', Math.round(m.moundVol).toLocaleString('en-IN'), 'm3') : t('Root collar', 'at grade')) +
      t('CO2 stock at maturity', (m.co2Stock / 1000).toFixed(0), 't') + t('Sequestration', (m.co2Year / 1000).toFixed(1), 't CO2/yr') + t('Mean tree APTI', m.aptiMean ? m.aptiMean.toFixed(1) : 'n/a');
    $('#floodnote').innerHTML = L.floodProne
      ? `Planting at the existing datum would put root collars below the projected flood line (${L.floodLine.toFixed(2)} m). Each tree sits on an engineered mound raising the root collar to ${L.collarTarget.toFixed(2)} m AMSL, 1.2 m above that line, with 1:1.5 side slopes bound by the mound-face cover. Hatched cells are DEM depressions retained as monsoon basins.`
      : s.tidal ? 'Tidal site: mangroves and associates are planted at tidal grade with no mounds. Hatched cells are creek-side depressions kept as tidal channels.'
      : 'No mounding required: root collars at existing grade. Hatched cells, where present, are DEM depressions kept unplanted as monsoon retention basins.';
    /* coordinates */
    const rows = L.placed.slice(0, 14).map(p => `<tr><td>${p.id}</td><td>${esc(p.sp.sci)}</td><td>${p.x.toFixed(1)}</td><td>${p.y.toFixed(1)}</td><td>${p.z.toFixed(2)}</td><td>${p.mound.toFixed(2)}</td><td>${p.collar.toFixed(2)}</td><td>${p.lat.toFixed(5)}</td><td>${p.lon.toFixed(5)}</td><td>${p.e.toFixed(0)}</td><td>${p.n.toFixed(0)}</td></tr>`).join('');
    $('#coords').innerHTML = `<table><thead><tr><th>id</th><th>species</th><th>x m</th><th>y m</th><th>ground z</th><th>mound h</th><th>collar z</th><th>lat</th><th>lon</th><th>UTM E</th><th>UTM N</th></tr></thead><tbody>${rows}</tbody></table>`;
    $('#coordnote').textContent = `Showing ${Math.min(14, L.placed.length)} of ${L.placed.length} planting nodes. Copy the full matrix as CSV or GeoJSON below.`;
    $('#exportbox').value = '';
    $('#exportbox').hidden = true;
  }

  function renderWindow(res) {
    const w = res.window, y = w.year;
    const start = new Date(y, 3, 1), end = new Date(y, 6, 31);
    const span = end - start, X = d => ((d - start) / span * 1000).toFixed(1);
    const months = [[3, 'April'], [4, 'May'], [5, 'June'], [6, 'July']];
    let svg = `<svg class="calsvg" viewBox="0 0 1000 96" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Planting calendar">`;
    months.forEach(([m, name], i) => { const a = new Date(y, m, 1), b = new Date(y, m + 1, 0); svg += `<rect x="${X(a)}" y="30" width="${(X(b) - X(a))}" height="26" fill="${i % 2 ? 'var(--panel-2)' : 'var(--panel-3)'}"/><text x="${(+X(a) + 4)}" y="24" font-size="12.5" fill="var(--ink-2)" font-family="IBM Plex Sans, sans-serif">${name} ${y}</text>`; });
    svg += `<rect class="win" x="${X(w.start)}" y="26" width="${X(w.end) - X(w.start)}" height="34" fill="var(--accent)" fill-opacity=".9" rx="4"/>`;
    svg += `<line x1="${X(w.target)}" y1="18" x2="${X(w.target)}" y2="68" stroke="var(--ink)" stroke-width="2"/>`;
    svg += `<text x="${X(w.target)}" y="14" text-anchor="middle" font-size="12.5" fill="var(--ink)" font-family="IBM Plex Sans, sans-serif" font-weight="500">Plant ${fmtDate(w.target)}</text>`;
    svg += `<line x1="${X(w.onset)}" y1="18" x2="${X(w.onset)}" y2="68" stroke="var(--slate)" stroke-width="2" stroke-dasharray="4 3"/>`;
    svg += `<text x="${X(w.onset)}" y="84" text-anchor="middle" font-size="12.5" fill="var(--slate)" font-family="IBM Plex Sans, sans-serif" font-weight="500">Monsoon onset ${fmtDate(w.onset)}</text>`;
    svg += `<text x="${X(w.start)}" y="72" text-anchor="end" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono, monospace">−21 d</text><text x="${+X(w.end) + 4}" y="72" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono, monospace">−15 d</text>`;
    svg += `</svg>`;
    $('#cal').innerHTML = svg;
    const t = (k, v) => `<div class="tile"><div class="k">${k}</div><div class="v" style="font-size:15px">${v}</div></div>`;
    $('#dates').innerHTML = t('Window opens', fmtDateY(w.start)) + t('Target date', fmtDateY(w.target)) + t('Window closes', fmtDateY(w.end)) + t('Mean onset (day ' + w.onsetDOY + ')', fmtDateY(w.onset));
    const L = res.layout;
    $('#seq').innerHTML = [
      [fmtDate(new Date(w.start.getTime() - 14 * 86400000)), `Earthworks: ${L.floodProne ? 'shape mounds and basins, compact cores, ' : 'grade and rip compacted zones, '}stake the coordinate matrix from the CSV`],
      [fmtDate(w.start), `Ground covers first: ${L.gc.mound ? `<span class="sci">${esc(L.gc.mound.sp.sci)}</span> on mound faces, ` : ''}${L.gc.open ? `<span class="sci">${esc(L.gc.open.sp.sci)}</span> on open ground` : ''}${L.gc.basin ? `, <span class="sci">${esc(L.gc.basin.sp.sci)}</span> on basin floors` : ''}`],
      [fmtDate(w.target), `Trees at the target date, root collar ${L.floodProne ? 'on the mound crest' : 'at grade'}, 20 days of establishment before the rains`],
      [fmtDate(w.end), `Shrubs and under-canopy cover by the close of the window${L.gc.shade ? `, <span class="sci">${esc(L.gc.shade.sp.sci)}</span> beneath the canopy` : ''}`],
      [fmtDate(w.onset), 'Southwest monsoon: no irrigation needed, check mound faces after the first 100 mm event']
    ].map(([d, txt]) => `<li><span class="mono">${d}</span><span>${txt}</span></li>`).join('');
  }

  function renderAir(res) {
    const s = res.site, P = res.picks;
    const picks = [P.tree, P.treeUnder, P.shrub].filter(Boolean);
    const trees = res.layout.placed.filter(p => p.kind === 'tree');
    const tol = trees.filter(p => p.sp.apti && p.sp.apti[0] >= 17).length;
    const naaqs = s.pm > 60 ? `${(s.pm / 60).toFixed(1)}× the NAAQS annual limit of 60 ug/m3` : 'within the NAAQS annual limit of 60 ug/m3';
    $('#aq').innerHTML = `
      <div class="card-lite"><h3>Ambient load</h3><div class="big">${Math.round(s.pm)} <small style="font-size:12px;color:var(--muted)">ug/m3 PM10</small></div>
        <div>${naaqs}${s.ncap ? '. Listed CPCB NCAP non-attainment city.' : '.'} ${s.includeAir ? `Air quality carries weight <span class="mono">${res.ahp.w[res.criteria.findIndex(c => c.key === 'air')].toFixed(3)}</span> in the AHP vector.` : 'Air-quality criterion switched off for this run.'}</div></div>
      <div class="card-lite"><h3>APTI of the prescribed palette</h3>
        <ul>${picks.map(e => `<li><span class="sci">${esc(e.sp.sci)}</span>: ${e.sp.apti ? `<span class="mono">${e.sp.apti[0]}</span> (${e.sp.apti[1]} to ${e.sp.apti[2]}), ${classAPTI(e.sp.apti)}` : 'not reported'}${e.sp.dust ? `, dust capture ${e.sp.dust === 'H' ? 'high' : e.sp.dust === 'M' ? 'medium' : 'low'}` : ''}</li>`).join('')}</ul>
        <div style="margin-top:6px">${tol} of ${trees.length} placed trees are in the tolerant class (APTI 17 and above).</div></div>
      <div class="card-lite"><h3>Carbon</h3><div class="big">${(res.layout.metrics.co2Year / 1000).toFixed(1)} <small style="font-size:12px;color:var(--muted)">t CO2 per year</small></div>
        <div>${(res.layout.metrics.co2Stock / 1000).toFixed(0)} t CO2e stored at maturity across ${trees.length} trees and ${res.layout.metrics.shrubCount} shrubs on ${s.areaHa} ha. Per-stem figures use the Chave 2014 allometry with species wood density, IPCC carbon fraction 0.47 and root to shoot ratio 0.26.</div></div>
      <div class="card-lite"><h3>Compliance context</h3>
        <div>The palette is native or long-naturalised by construction, with exotic plantation species screened out and shown separately. National Green Tribunal orders on tree felling and compensatory plantation consistently require native, site-appropriate species with multi-year survival monitoring; the SSI threshold and the coordinate matrix give a defensible, auditable basis for that schedule. Confirm species lists against the order governing your project.</div></div>`;
  }

  /* ---------- exports ---------- */
  async function copyText(txt, btn) {
    const toast = $('#toast');
    try { await navigator.clipboard.writeText(txt); toast.textContent = `Copied ${txt.length.toLocaleString('en-IN')} characters`; }
    catch (e) { const box = $('#exportbox'); box.hidden = false; box.value = txt; box.focus(); box.select(); toast.textContent = 'Clipboard refused, text shown below for manual copy'; }
    setTimeout(() => { toast.textContent = ''; }, 3500);
  }

  /* ---------- init ---------- */
  function setView(three) {
    use3d = three;
    $('#map3d').hidden = !three; $('#mapbox').hidden = three;
    $('#view3d').classList.toggle('on', three); $('#view2d').classList.toggle('on', !three);
    if (three) Map3D.setActive(true); else Map3D.setActive(false);
    placeMarker();
  }
  function init() {
    document.documentElement.classList.add('js');
    buildMap();
    const ok3d = Map3D.init($('#map3d'), { onPick: (lat, lon) => { state.trigger = 'map'; setLocation(lat, lon, true); } });
    if (ok3d) {
      $('#view3d').addEventListener('click', () => setView(true));
      $('#view2d').addEventListener('click', () => setView(false));
      $('#resetView').addEventListener('click', () => Map3D.reset());
      setView(true);
    } else { $('#map3d').hidden = true; $('#mapbox').hidden = false; $('.seg').hidden = true; }
    syncForm();
    placeMarker();
    ['#lat', '#lon', '#area'].forEach(id => $(id).addEventListener('change', () => { readForm(); placeMarker(); scheduleRun(); }));
    ['#shape', '#lu', '#micro', '#tidal', '#air'].forEach(id => $(id).addEventListener('change', scheduleRun));
    $('#run').addEventListener('click', () => { state.trigger = 'button'; runNow(true); });
    $('#tabs').addEventListener('click', ev => { const b = ev.target.closest('.tab'); if (!b) return; state.tab = b.dataset.tab; renderTable(state.res); });
    $('#sort').addEventListener('change', ev => { state.sort = ev.target.value; renderTable(state.res); });
    $('#copycsv').addEventListener('click', ev => copyText(layoutCSV(state.res), ev.target));
    $('#copygeo').addEventListener('click', ev => copyText(layoutGeoJSON(state.res), ev.target));
    $('#sort').value = state.sort;
    /* a saved run reopened from the archive arrives as ?lat=..&lon=..&area=.. */
    try {
      const qp = new URLSearchParams(location.search), la = parseFloat(qp.get('lat')), lo = parseFloat(qp.get('lon'));
      if (isFinite(la) && isFinite(lo)) {
        state.lat = la; state.lon = lo;
        if (qp.get('area')) state.areaHa = parseFloat(qp.get('area')) || state.areaHa;
        ['shape', 'lu', 'micro', 'tidal', 'air'].forEach(k => { if (qp.get(k)) state[k] = qp.get(k); });
        syncForm(); placeMarker();
      }
    } catch (e) { }
    if (typeof Store !== 'undefined') Store.init({ getState: () => state });
    state.trigger = 'load';
    runNow(true);
    FX.init(() => { if (use3d) Map3D.reset(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
