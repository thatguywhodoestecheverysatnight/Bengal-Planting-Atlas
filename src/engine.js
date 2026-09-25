/* ------------------------------------------------------------------
   Bengal Planting Atlas : computational engine
   ------------------------------------------------------------------
   JavaScript port of the Python-GIS pipeline in Chatterjee's framework:
     Coordinate Input -> Spatial Fetch -> Attribute Extraction ->
     AHP Optimisation -> SSI Filtering -> Layout Generation -> Window
   Everything here is pure functions over the embedded datasets.
------------------------------------------------------------------ */

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const norm = (v, lo, hi) => clamp((v - lo) / (hi - lo));

/* ---------- geodesy ---------- */
function haversineKm(la1, lo1, la2, lo2) {
  const R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* WGS84 -> UTM zone 45N (EPSG:32645), the projection named in the framework */
function toUTM45N(lat, lon) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2), e4 = e2 * e2, e6 = e4 * e2;
  const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180, lam0 = 87 * Math.PI / 180;
  const sinp = Math.sin(phi), cosp = Math.cos(phi), tanp = Math.tan(phi);
  const N = a / Math.sqrt(1 - e2 * sinp * sinp), T = tanp * tanp, C = ep2 * cosp * cosp, A = cosp * (lam - lam0);
  const M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
    - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
    - (35 * e6 / 3072) * Math.sin(6 * phi));
  const E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  const Nn = k0 * (M + N * tanp * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  return { e: E, n: Nn, zone: '45N', epsg: 32645 };
}

/* metres east/north from a site centre -> lat/lon */
function offsetLatLon(lat0, lon0, dx, dy) {
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * lat0 * Math.PI / 180);
  const mPerDegLon = 111412.84 * Math.cos(lat0 * Math.PI / 180) - 93.5 * Math.cos(3 * lat0 * Math.PI / 180);
  return { lat: lat0 + dy / mPerDegLat, lon: lon0 + dx / mPerDegLon };
}

/* ---------- spatial fetch: IDW over the control-point grid ---------- */
const CONT_FIELDS = ['p', 'on', 'hi', 'ph', 'ks', 'el', 'sl', 'ec', 'tmin', 'inu', 'wt', 'pm'];
function fetchEnvironment(lat, lon) {
  const ranked = CONTROL_POINTS.map(c => ({ c, d: haversineKm(lat, lon, c.la, c.lo) })).sort((a, b) => a.d - b.d);
  const near = ranked.slice(0, 6);
  const out = {};
  if (near[0].d < 0.05) {
    CONT_FIELDS.forEach(k => out[k] = near[0].c[k]);
  } else {
    /* inverse distance weighting, power 2, with a mild distance floor */
    let wsum = 0; const ws = near.map(n => { const w = 1 / Math.pow(Math.max(n.d, 0.3), 2); wsum += w; return w; });
    CONT_FIELDS.forEach(k => { out[k] = near.reduce((s, n, i) => s + n.c[k] * ws[i], 0) / wsum; });
    /* hydraulic conductivity spans orders of magnitude: interpolate in log space */
    out.ks = Math.pow(10, near.reduce((s, n, i) => s + Math.log10(n.c.ks) * ws[i], 0) / wsum);
  }
  const nearest = near[0].c;
  out.soil = nearest.soil;
  out.stationLu = nearest.lu;
  out.lu = near[0].d <= 6 ? nearest.lu : 'rural';
  if (out.lu === 'rural' && near[0].d > 6) out.pm = Math.min(out.pm, 85);
  out.tidal = !!nearest.tidal && near[0].d < 18;
  out.station = nearest.n;
  out.stationKm = near[0].d;
  out.ncap = NCAP_CITIES.includes(nearest.n) && near[0].d < 12;
  out.on = Math.round(out.on);
  return out;
}

/* zone lookup: the UI sets site.zone from the district polygon hit */
function DISTRICT_ZONE_OF_SITE(site) { return site.zone || null; }

/* ---------- attribute extraction: site-specific adjustments ---------- */
function deriveSite(input) {
  const env = fetchEnvironment(input.lat, input.lon);
  const lu = input.lu === 'auto' ? env.lu : input.lu;
  const micro = input.micro;   /* auto = as surveyed at the nearest station */
  const microLabel = micro === 'auto' ? (env.inu >= 0.7 ? 'low-lying (surveyed)' : env.sl > 8 ? 'elevated slope (surveyed)' : 'level (surveyed)') : micro === 'low' ? 'low-lying depression' : micro === 'high' ? 'raised ground' : 'level';
  const tidal = input.tidal === 'auto' ? env.tidal : input.tidal === 'yes';
  let inu = env.inu, wt = env.wt;
  if (micro === 'low') { inu = clamp(inu + 0.25); wt = wt * 0.6; }
  if (micro === 'high') { inu = clamp(inu - 0.35); wt = wt + 1.5; }
  /* compaction relative to what the station already reflects */
  const ksEff = env.ks * Math.min(1.6, KS_LU[lu] / KS_LU[env.stationLu]);
  const hiMax = env.hi + UHI[lu];
  const site = Object.assign({}, env, {
    lat: input.lat, lon: input.lon, lu, micro, microLabel, tidal, inu, wt, ksEff, hiMax,
    uhi: UHI[lu], areaHa: input.areaHa, shape: input.shape, includeAir: input.includeAir, zone: input.zone || null, district: input.district || null,
    utm: toUTM45N(input.lat, input.lon)
  });
  return site;
}

/* ---------- criteria and severities (Saaty 1..9) ---------- */
const RI = { 1: 0, 2: 0, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49 };

function buildCriteria(site) {
  const rainNorm = norm(site.p, 900, 2600);
  const ksNorm = norm(Math.log10(site.ksEff), Math.log10(0.05), Math.log10(5));
  const dFlood = clamp(0.45 * rainNorm + 0.55 * site.inu * (1 - 0.5 * ksNorm));
  const dHeat = norm(site.hiMax, 32, 46);
  const dDrought = clamp(0.5 * (1 - norm(site.p, 1100, 2000)) + 0.5 * norm(site.ksEff, 1, 8) + (site.micro === 'high' ? 0.08 : site.micro === 'low' ? -0.08 : 0));
  const dPh = clamp(Math.abs(site.ph - 6.5) / 2);
  const dWlog = clamp(0.6 * (1 - ksNorm) + 0.4 * (1 - norm(site.wt, 0.3, 4)));
  const dSal = clamp(site.ec / 12);
  const dSlope = clamp(site.sl / 30);
  const dFrost = clamp((12 - site.tmin) / 12);
  const dAir = clamp((site.pm - 40) / 120);
  const sev = d => 1 + 8 * d;
  const C = [
    { key: 'flood',  label: 'Monsoon inundation',        short: 'Inundation', d: dFlood,  s: sev(dFlood),
      value: `${Math.round(site.p)} mm, ponding index ${site.inu.toFixed(2)}`, kind: 'cap', source: 'IMD gridded rainfall, DEM depressions' },
    { key: 'heat',   label: 'Peak heat index',           short: 'Heat',       d: dHeat,   s: sev(dHeat),
      value: `${site.hiMax.toFixed(1)} C incl. UHI +${site.uhi.toFixed(1)}`, kind: 'cap', source: 'IMD pre-monsoon maxima, LULC UHI multiplier' },
    { key: 'drought',label: 'Dry-season moisture deficit',short: 'Drought',   d: dDrought,s: sev(dDrought),
      value: `${Math.round(site.p)} mm, Ks ${site.ksEff.toFixed(2)} cm/h`, kind: 'cap', source: 'Rainfall normal, root-zone retention' },
    { key: 'ph',     label: 'Soil pH match',             short: 'Soil pH',    d: dPh,     s: sev(dPh),
      value: `pH ${site.ph.toFixed(1)}`, kind: 'ph', source: 'Bhuvan soil layer, NBSS&LUP' },
    { key: 'wlog',   label: 'Anaerobic root survival',   short: 'Drainage',   d: dWlog,   s: sev(dWlog),
      value: `Ks ${site.ksEff.toFixed(2)} cm/h, water table ${site.wt.toFixed(1)} m`, kind: 'cap', source: 'Hydraulic conductivity, monsoon water table' },
    { key: 'ec',     label: 'Soil salinity',             short: 'Salinity',   d: dSal,    s: sev(dSal),
      value: `EC ${site.ec.toFixed(1)} dS/m${site.tidal ? ', tidal' : ''}`, kind: 'ec', source: 'Coastal soil survey' },
    { key: 'slope',  label: 'Slope and erosion anchoring',short: 'Slope',     d: dSlope,  s: sev(dSlope),
      value: `${site.sl.toFixed(1)} deg mean slope, ${Math.round(site.el)} m AMSL`, kind: 'cap', source: 'SRTM 30 m DEM' },
    { key: 'frost',  label: 'Winter cold and frost',     short: 'Frost',      d: dFrost,  s: sev(dFrost),
      value: `T min ${site.tmin.toFixed(1)} C`, kind: 'cap', source: 'IMD winter minima' }
  ];
  if (site.includeAir) {
    C.push({ key: 'air', label: 'Air pollution load vs APTI', short: 'Air quality', d: dAir, s: sev(dAir),
      value: `PM10 ${Math.round(site.pm)} ug/m3${site.ncap ? ', NCAP city' : ''}`, kind: 'air', source: 'CPCB NAMP annual PM10, species APTI' });
  }
  return C;
}

/* ---------- AHP: pairwise matrix, eigenvector, consistency ---------- */
function pairwiseMatrix(sev) {
  const n = sev.length, A = [];
  for (let i = 0; i < n; i++) {
    A.push([]);
    for (let j = 0; j < n; j++) {
      const diff = sev[i] - sev[j], k = Math.round(Math.abs(diff));
      const v = k === 0 ? 1 : Math.min(9, 1 + k);
      A[i].push(diff >= 0 ? v : 1 / v);
    }
  }
  return A;
}
function principalEigen(A) {
  const n = A.length; let w = new Array(n).fill(1 / n);
  for (let it = 0; it < 300; it++) {
    const Aw = A.map(row => row.reduce((s, a, j) => s + a * w[j], 0));
    const sum = Aw.reduce((s, v) => s + v, 0);
    const next = Aw.map(v => v / sum);
    const delta = next.reduce((s, v, i) => s + Math.abs(v - w[i]), 0);
    w = next; if (delta < 1e-12) break;
  }
  const Aw = A.map(row => row.reduce((s, a, j) => s + a * w[j], 0));
  const lambda = Aw.reduce((s, v, i) => s + v / w[i], 0) / n;
  return { w, lambda };
}
function consistency(lambda, n) {
  const ci = (lambda - n) / (n - 1), ri = RI[n] || 1.49;
  return { ci, ri, cr: ri === 0 ? 0 : ci / ri };
}
function renormalise(w) {
  /* rebuild a perfectly consistent matrix from the eigenvector, a_ij = w_i / w_j */
  return w.map(wi => w.map(wj => wi / wj));
}
function runAHP(criteria) {
  const sev = criteria.map(c => c.s);
  const A = pairwiseMatrix(sev);
  let { w, lambda } = principalEigen(A);
  const n = A.length;
  let cons = consistency(lambda, n);
  const raw = { A, w, lambda, cons };
  let repaired = false, A2 = A;
  if (cons.cr > 0.10) {
    A2 = renormalise(w);
    const e = principalEigen(A2); w = e.w; lambda = e.lambda; cons = consistency(lambda, n); repaired = true;
  }
  return { A: A2, w, lambda, cons, raw, repaired, n };
}

/* ---------- SSI evaluation ---------- */
function toleranceX(sp, crit, site) {
  const t = sp.tol;
  switch (crit.kind) {
    case 'ph': {
      const [lo, hi] = t.ph, v = site.ph;
      const dist = v < lo ? lo - v : v > hi ? v - hi : 0;
      return { x: clamp(1 - dist / 1.0), c: null, margin: dist === 0 ? Math.min(v - lo, hi - v) / 1.0 : -dist };
    }
    case 'ec': {
      const [lo, hi] = t.ec, v = site.ec;
      if (v < lo) return { x: clamp(1 - (lo - v) / 2), c: null, margin: -(lo - v) / 2 };
      if (v > hi) return { x: clamp(1 - (v - hi) / 3), c: null, margin: -(v - hi) / 3 };
      return { x: 1, c: null, margin: Math.min((v - lo) / 2, (hi - v) / 3, 1) };
    }
    case 'air': {
      const c = sp.apti ? clamp((sp.apti[0] - 8) / 12) : 0.5;
      return { x: clamp(1 - 1.5 * Math.max(0, crit.d - c)), c, margin: c - crit.d, assumed: !sp.apti };
    }
    default: {
      const c = t[crit.key];
      return { x: clamp(1 - 1.5 * Math.max(0, crit.d - c)), c, margin: c - crit.d };
    }
  }
}

function stratumWeights(criteria, w, st) {
  /* ground covers intercept little particulate matter and have almost no
     published APTI, so the air criterion is redistributed for that stratum */
  if (st !== 'ground') return w;
  const ai = criteria.findIndex(c => c.key === 'air');
  if (ai < 0) return w;
  const rest = 1 - w[ai];
  return w.map((v, i) => i === ai ? 0 : v / rest);
}
function evaluateSpecies(site, criteria, w) {
  return SPECIES.map(sp => {
    const ws = stratumWeights(criteria, w, sp.st);
    const xs = criteria.map(c => toleranceX(sp, c, site));
    const ssi = xs.reduce((s, x, i) => s + ws[i] * x.x, 0);
    const zoneBonus = (sp.zones && DISTRICT_ZONE_OF_SITE(site) && sp.zones.includes(DISTRICT_ZONE_OF_SITE(site))) ? 0.05 : 0;
    const margin = xs.reduce((s, x, i) => s + ws[i] * clamp(x.margin, -1, 0.5), 0) + zoneBonus;
    let weakest = 0; xs.forEach((x, i) => { if (ws[i] * (1 - x.x) > ws[weakest] * (1 - xs[weakest].x)) weakest = i; });
    let status, reason = '';
    const gated = (sp.hab === 'tidal' && !site.tidal) || (sp.hab === 'brackish' && !(site.tidal || site.ec >= 1.0));
    if (gated) { status = 'gated'; reason = sp.hab === 'tidal' ? 'Obligate tidal mangrove, site has no tidal regime' : 'Needs brackish water, site is fresh'; }
    else if (sp.status === 'exotic') { status = 'screened'; reason = 'Exotic, screened by the native-flora database filter'; }
    else if (ssi >= 0.85) { status = 'selected'; }
    else { status = 'below'; reason = `Fails ${criteria[weakest].label.toLowerCase()} (x = ${xs[weakest].x.toFixed(2)})`; }
    return { sp, xs, ws, ssi, margin, weakest, status, reason, carbon: sp.st === 'tree' ? carbonTree(sp) : null };
  });
}

/* ---------- carbon: Chave 2014 pan-tropical allometry ---------- */
function carbonTree(sp) {
  /* AGB (kg) = 0.0673 * (rho * D^2 * H)^0.976 ; rho g/cm3, D cm, H m */
  const agb = 0.0673 * Math.pow(sp.wd * sp.dbh * sp.dbh * sp.h, 0.976);
  const total = agb * 1.26;              /* IPCC root:shoot 0.26 for tropical moist forest */
  const carbon = total * 0.47;           /* IPCC carbon fraction of dry biomass */
  const co2 = carbon * 44 / 12;
  return { agbKg: agb, biomassKg: total, carbonKg: carbon, co2Kg: co2, co2PerYear: co2 / sp.mat, years: sp.mat };
}
function carbonShrub(sp) { const co2 = sp.bio * 1.3 * 0.47 * 44 / 12; return { co2Kg: co2, co2PerYear: co2 / 8 }; }

/* ---------- deterministic PRNG for layout ---------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* uniform grid index so canopy intersection tests stay near-linear */
function SpatialIndex(cell) {
  const m = new Map();
  const key = (i, j) => i * 100003 + j;
  return {
    add(p) { const i = Math.floor(p.x / cell), j = Math.floor(p.y / cell); const k = key(i, j); (m.get(k) || m.set(k, []).get(k)).push(p); },
    near(x, y, r) {
      const out = [], n = Math.ceil(r / cell), i0 = Math.floor(x / cell), j0 = Math.floor(y / cell);
      for (let i = i0 - n; i <= i0 + n; i++) for (let j = j0 - n; j <= j0 + n; j++) { const b = m.get(key(i, j)); if (b) for (const p of b) out.push(p); }
      return out;
    }
  };
}

/* ---------- spatial layout optimisation ---------- */
function generateLayout(site, evals) {
  const areaM2 = site.areaHa * 10000;
  const ratio = site.shape === 'linear' ? 4.5 : site.shape === 'elongated' ? 2.2 : 1.25;
  const W = Math.sqrt(areaM2 * ratio), H = areaM2 / W;
  const rnd = mulberry32(Math.round(site.lat * 1e4) * 31 + Math.round(site.lon * 1e4));

  /* synthetic micro-DEM standing in for the Rasterio focal statistics */
  const base = site.el;
  const gradDir = rnd() * Math.PI * 2, gradMag = (site.sl / 30) * 0.8 + 0.003;
  const nDep = site.inu >= 0.6 ? 2 : site.inu >= 0.3 ? 1 : 0;
  const deps = [];
  for (let i = 0; i < nDep; i++) {
    deps.push({ x: lerp(0.2, 0.8, rnd()) * W, y: lerp(0.2, 0.8, rnd()) * H,
      r: lerp(0.1, 0.16, rnd()) * Math.min(W, H) + 3, depth: lerp(0.45, 0.9, rnd()) * (0.5 + site.inu) });
  }
  const noiseA = 0.08 + 0.1 * site.inu;
  const z = (x, y) => {
    let v = base + ((x - W / 2) * Math.cos(gradDir) + (y - H / 2) * Math.sin(gradDir)) * gradMag / 10;
    v += noiseA * (Math.sin(x * 0.21 + 1.3) * Math.cos(y * 0.17 + 0.4) + 0.5 * Math.sin(x * 0.53 - y * 0.31));
    deps.forEach(d => { const dd = Math.hypot(x - d.x, y - d.y) / d.r; if (dd < 1) v -= d.depth * (1 - dd * dd) ** 2; });
    return v;
  };
  const floodProne = site.inu >= 0.55 && !site.tidal;   /* mangrove sites stay at tidal grade */
  const floodLine = base + (floodProne ? 0.6 * Math.max(0, site.inu - 0.5) : 0);
  const collarTarget = floodLine + 1.2;                 /* root-collar datum from the framework case study */
  const inBasin = (x, y) => z(x, y) < base - 0.25;

  /* species mixes */
  const pick = (st, cap) => evals.filter(e => e.status === 'selected' && e.sp.st === st).sort((a, b) => b.ssi - a.ssi || b.margin - a.margin).slice(0, cap);
  const trees = pick('tree', 5), shrubs = pick('shrub', 4), grounds = pick('ground', 8);
  const share = arr => { const s = arr.map(e => Math.pow(e.ssi, 6) * (1 + e.margin)); const t = s.reduce((a, b) => a + b, 0); return s.map(v => v / t); };
  const tShare = share(trees), sShare = share(shrubs);

  const placed = [];
  const treeIdx = SpatialIndex(8), shrubIdx = SpatialIndex(4);
  let maxTreeR = 0;
  const g = 2;
  const nodesTried = { trees: 0, shrubs: 0 };
  /* trees: greedy non-intersecting canopy packing on an offset grid, centre-out order */
  const nodes = [];
  for (let j = 0, y = g; y < H - g / 2; y += g, j++) for (let x = g + (j % 2) * g / 2; x < W - g / 2; x += g) nodes.push({ x, y });
  nodes.sort((a, b) => Math.hypot(a.x - W / 2, a.y - H / 2) - Math.hypot(b.x - W / 2, b.y - H / 2));
  const counts = trees.map(() => 0);
  const tooClose = (x, y, r, buffer) => treeIdx.near(x, y, maxTreeR + r + buffer).some(p => Math.hypot(p.x - x, p.y - y) < p.r + r + buffer);
  const tryPlace = (nd, e) => {
    const r = e.sp.r;
    const edge = Math.min(nd.x, nd.y, W - nd.x, H - nd.y);
    if (edge < Math.min(r * 0.6, 4)) return false;
    if (tooClose(nd.x, nd.y, r, 0.5)) return false;
    const zg = z(nd.x, nd.y);
    const mound = floodProne ? Math.max(0, collarTarget - zg) : 0;
    const rec = { sp: e.sp, ssi: e.ssi, x: nd.x, y: nd.y, z: zg, mound, r, kind: 'tree' };
    placed.push(rec); treeIdx.add(rec); maxTreeR = Math.max(maxTreeR, r);
    return true;
  };
  /* usable ground and canopy-cover target set the count budget per species */
  let basinCells = 0, cells = 0;
  for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) { cells++; if (inBasin(x, y)) basinCells++; }
  const usable = areaM2 * (1 - basinCells / Math.max(1, cells));
  const coverTarget = 0.62;
  const targets = trees.map((e, i) => Math.max(1, Math.floor(tShare[i] * usable * coverTarget / (Math.PI * e.sp.r * e.sp.r))));
  const used = new Set();
  /* pass 1: largest canopies first, up to their target counts */
  trees.map((e, i) => ({ e, i })).sort((a, b) => b.e.sp.r - a.e.sp.r).forEach(({ e, i }) => {
    for (let k = 0; k < nodes.length && counts[i] < targets[i]; k++) {
      if (used.has(k)) continue;
      const nd = nodes[k]; nodesTried.trees++;
      if (inBasin(nd.x, nd.y)) { used.add(k); continue; }
      if (tryPlace(nd, e)) { used.add(k); counts[i]++; }
    }
  });
  /* pass 2: fill remaining gaps, no species beyond twice its target */
  for (let k = 0; k < nodes.length; k++) {
    if (used.has(k)) continue;
    const nd = nodes[k]; nodesTried.trees++;
    if (inBasin(nd.x, nd.y)) continue;
    for (let i = 0; i < trees.length; i++) {
      if (counts[i] >= 2 * targets[i]) continue;
      if (tryPlace(nd, trees[i])) { counts[i]++; break; }
    }
  }
  /* shrubs: fill gaps outside root zones, leave open ground */
  const sCounts = shrubs.map(() => 0);
  const rndS = mulberry32(7 + Math.round(site.lon * 1000));
  for (let y = 2; y < H - 1; y += 2) for (let x = 2 + ((Math.round(y / 2) % 2) * 1); x < W - 1; x += 2) {
    if (!shrubs.length) break;
    nodesTried.shrubs++;
    if (rndS() > 0.30) continue;
    if (inBasin(x, y)) continue;
    const order = shrubs.map((e, i) => ({ i, deficit: sShare[i] - sCounts[i] / Math.max(1, sCounts.reduce((a, b) => a + b, 0)) })).sort((a, b) => b.deficit - a.deficit);
    for (const o of order) {
      const e = shrubs[o.i], r = e.sp.r;
      let ok = true;
      for (const p of treeIdx.near(x, y, Math.max(0.55 * maxTreeR, 2.5))) { if (Math.hypot(p.x - x, p.y - y) < Math.max(0.55 * p.r, 2.5)) { ok = false; break; } }
      if (ok) for (const p of shrubIdx.near(x, y, r + 3)) { if (Math.hypot(p.x - x, p.y - y) < p.r + r + 0.3) { ok = false; break; } }
      if (!ok) continue;
      const zg = z(x, y);
      const mound = floodProne ? Math.max(0, Math.min(0.6, collarTarget - zg) ) : 0;
      const rec = { sp: e.sp, ssi: e.ssi, x, y, z: zg, mound, r, kind: 'shrub' };
      placed.push(rec); shrubIdx.add(rec);
      sCounts[o.i]++;
      break;
    }
  }
  /* ground cover zoning */
  const gc = {
    basin: grounds.filter(e => e.sp.tol.flood >= 0.9 && e.sp.tol.wlog >= 0.9)[0] || null,
    mound: grounds.filter(e => e.sp.tol.slope >= 0.8)[0] || null,
    shade: grounds.filter(e => e.sp.roles.includes('shade'))[0] || null,
    open: grounds.filter(e => e.sp.roles.includes('turf'))[0] || grounds[0] || null
  };
  /* raster sampling for areas: 1 m cells */
  let basinA = 0, shadeA = 0, moundA = 0, total = 0;
  const treeList = placed.filter(p => p.kind === 'tree');
  const cs = 2; /* 2 m sampling cells */
  for (let y = cs / 2; y < H; y += cs) for (let x = cs / 2; x < W; x += cs) {
    total++;
    if (inBasin(x, y)) { basinA++; continue; }
    const nearT = treeIdx.near(x, y, maxTreeR);
    const onMound = floodProne && nearT.some(p => Math.hypot(p.x - x, p.y - y) < 1.2 + 1.5 * p.mound);
    if (onMound) { moundA++; continue; }
    if (nearT.some(p => Math.hypot(p.x - x, p.y - y) < p.r * 0.8)) shadeA++;
  }
  const scale = cs * cs; basinA *= scale; shadeA *= scale; moundA *= scale; total *= scale;
  const openA = total - basinA - shadeA - moundA;
  const canopyA = treeList.reduce((s, p) => s + Math.PI * p.r * p.r, 0);
  const moundVol = treeList.reduce((s, p) => { const h = p.mound; if (h <= 0) return s; const R = 1.2 + 1.5 * h, r = 1.2; return s + Math.PI * h / 3 * (R * R + R * r + r * r); }, 0);
  const co2Stock = treeList.reduce((s, p) => s + carbonTree(p.sp).co2Kg, 0) + placed.filter(p => p.kind === 'shrub').reduce((s, p) => s + carbonShrub(p.sp).co2Kg, 0);
  const co2Year = treeList.reduce((s, p) => s + carbonTree(p.sp).co2PerYear, 0) + placed.filter(p => p.kind === 'shrub').reduce((s, p) => s + carbonShrub(p.sp).co2PerYear, 0);
  const aptiVals = treeList.filter(p => p.sp.apti).map(p => p.sp.apti[0]);
  const aptiMean = aptiVals.length ? aptiVals.reduce((a, b) => a + b, 0) / aptiVals.length : null;
  const ssiDensity = treeList.reduce((s, p) => s + p.ssi * Math.PI * p.r * p.r, 0) / areaM2;

  /* enrich placements with coordinates */
  const utm0 = site.utm;
  placed.forEach((p, i) => {
    p.id = `${p.kind === 'tree' ? 'T' : 'S'}${String(i + 1).padStart(3, '0')}`;
    const dx = p.x - W / 2, dy = p.y - H / 2;
    const ll = offsetLatLon(site.lat, site.lon, dx, dy);
    p.lat = ll.lat; p.lon = ll.lon; p.e = utm0.e + dx; p.n = utm0.n + dy; p.collar = p.z + p.mound;
  });
  return { W, H, z, deps, base, floodLine, floodProne, collarTarget, placed, trees, shrubs, grounds, gc,
    areas: { basin: basinA, shade: shadeA, mound: moundA, open: openA, total },
    metrics: { treeCount: treeList.length, shrubCount: placed.length - treeList.length, canopyPct: 100 * Math.min(1, canopyA / areaM2),
      ssiDensity, moundVol, co2Stock, co2Year, aptiMean, nodesTried } };
}

/* ---------- temporal window ---------- */
function plantingWindow(site) {
  const now = new Date();
  let year = now.getFullYear();
  const doyNow = Math.floor((now - new Date(year, 0, 0)) / 86400000);
  if (doyNow > site.on - 15) year += 1;
  const fromDOY = d => new Date(year, 0, d);
  return { year, onset: fromDOY(site.on), start: fromDOY(site.on - 21), target: fromDOY(site.on - 20), end: fromDOY(site.on - 15), onsetDOY: site.on };
}

/* ---------- full pipeline ---------- */
function runPipeline(input) {
  const site = deriveSite(input);
  const criteria = buildCriteria(site);
  const ahp = runAHP(criteria);
  const evals = evaluateSpecies(site, criteria, ahp.w);
  const layout = generateLayout(site, evals);
  const window = plantingWindow(site);
  const byStratum = st => evals.filter(e => e.sp.st === st).sort((a, b) => {
    const rank = s => s.status === 'selected' ? 0 : s.status === 'below' ? 1 : s.status === 'gated' ? 2 : 3;
    return rank(a) - rank(b) || b.ssi - a.ssi || b.margin - a.margin;
  });
  const strata = { tree: byStratum('tree'), shrub: byStratum('shrub'), ground: byStratum('ground') };
  const selT = strata.tree.filter(e => e.status === 'selected');
  const canopy = selT.find(e => e.sp.roles.includes('canopy')) || selT[0] || null;
  const under = selT.find(e => e !== canopy && (e.sp.roles.includes('understory') || e.sp.roles.includes('edge'))) || selT.find(e => e !== canopy) || null;
  const picks = {
    tree: canopy, treeUnder: under,
    shrub: strata.shrub.find(e => e.status === 'selected') || null,
    ground: strata.ground.find(e => e.status === 'selected') || null
  };
  return { site, criteria, ahp, evals, layout, window, strata, picks };
}

/* ---------- exports ---------- */
function layoutCSV(res) {
  const rows = [['id','stratum','scientific_name','bengali_name','x_m','y_m','ground_z_m','mound_h_m','root_collar_z_m','canopy_r_m','ssi','lat','lon','utm45n_e','utm45n_n']];
  res.layout.placed.forEach(p => rows.push([p.id, p.kind, p.sp.sci, p.sp.bn, p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2), p.mound.toFixed(2), p.collar.toFixed(2), p.r, p.ssi.toFixed(3), p.lat.toFixed(6), p.lon.toFixed(6), p.e.toFixed(1), p.n.toFixed(1)]));
  return rows.map(r => r.map(v => (String(v).includes(',') ? `"${v}"` : v)).join(',')).join('\n');
}
function layoutGeoJSON(res) {
  return JSON.stringify({ type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'EPSG:4326' } },
    features: res.layout.placed.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [+p.lon.toFixed(6), +p.lat.toFixed(6), +p.collar.toFixed(2)] },
      properties: { id: p.id, stratum: p.kind, species: p.sp.sci, bengali: p.sp.bn, canopy_r_m: p.r, ground_z_m: +p.z.toFixed(2), mound_h_m: +p.mound.toFixed(2), ssi: +p.ssi.toFixed(3), utm45n_e: +p.e.toFixed(1), utm45n_n: +p.n.toFixed(1) } })) }, null, 1);
}
