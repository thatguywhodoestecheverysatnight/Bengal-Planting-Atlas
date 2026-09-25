/* ------------------------------------------------------------------
   Bengal Planting Atlas : environmental dataset for West Bengal
   ------------------------------------------------------------------
   Every numeric field below is an embedded proxy for the gridded
   sources named in Chatterjee's framework (IMD gridded rainfall and
   temperature, ISRO Bhuvan soil and LULC layers, SRTM DEM, CPCB NAMP).
   Values are climatological normals or survey midpoints, not live
   observations. Replace any control point with official figures and
   the engine will pick it up unchanged.

   Control point fields
     n     name of station / town
     la lo latitude, longitude (WGS84)
     p     annual precipitation, mm (IMD normal, indicative)
     on    historical mean monsoon onset, day of year
     hi    rural baseline pre-monsoon peak heat index, deg C
     ph    baseline topsoil pH
     ks    saturated hydraulic conductivity, cm per hour
     soil  soil typology (NBSS&LUP / Bhuvan class, descriptive)
     el    elevation, m above MSL (SRTM)
     sl    mean slope, degrees
     ec    soil salinity as electrical conductivity, dS per m
     tmin  mean winter minimum temperature, deg C
     inu   monsoon inundation index 0..1 (ponding, flood recurrence)
     wt    monsoon water table depth below surface, m
     pm    annual mean PM10, ug per m3 (CPCB NAMP, indicative)
     lu    dominant land use: rural | peri | urban
     tidal true where tidal creeks reach the site
------------------------------------------------------------------ */

const ZONES = {
  hill:    { name: 'Northern Hill Zone',        color: '#6E8FB5', note: 'Darjeeling and Kalimpong ridges, 300 to 3600 m, acidic brown forest soils, frost above 1500 m.' },
  terai:   { name: 'Terai and Teesta Alluvial', color: '#5FA37A', note: 'Piedmont fans of the Dooars, coarse acidic alluvium, 3000 to 4300 mm rainfall, flash floods.' },
  oldall:  { name: 'Old Alluvial (Barind)',     color: '#C9B27A', note: 'Uplifted Pleistocene terraces of the Dinajpurs and Malda, compact clay loam, moderate drainage.' },
  newall:  { name: 'New Gangetic Alluvial',     color: '#9CC08D', note: 'Active delta of the Bhagirathi and Hooghly, silty clay, high water table, intensive paddy.' },
  later:   { name: 'Red and Laterite',          color: '#C97B5A', note: 'Chhota Nagpur fringe, gravelly laterite over gneiss, excessive drainage, 44 C summers.' },
  coast:   { name: 'Coastal Saline',            color: '#7FB6C2', note: 'Sundarbans and Medinipur littoral, tidal clay and dune sand, salinity 2 to 12 dS per m.' }
};

/* district code (Census 2011 / 2017 additions) -> zone, headquarters */
const DISTRICT_META = {
  '327': { zone: 'hill',   hq: 'Darjeeling' },
  '775': { zone: 'hill',   hq: 'Kalimpong' },
  '328': { zone: 'terai',  hq: 'Jalpaiguri' },
  '774': { zone: 'terai',  hq: 'Alipurduar' },
  '329': { zone: 'terai',  hq: 'Cooch Behar' },
  '330': { zone: 'oldall', hq: 'Raiganj' },
  '331': { zone: 'oldall', hq: 'Balurghat' },
  '332': { zone: 'oldall', hq: 'English Bazar (Malda)' },
  '333': { zone: 'newall', hq: 'Berhampore' },
  '334': { zone: 'later',  hq: 'Suri' },
  '336': { zone: 'newall', hq: 'Krishnanagar' },
  '335': { zone: 'newall', hq: 'Bardhaman' },
  '777': { zone: 'later',  hq: 'Asansol' },
  '340': { zone: 'later',  hq: 'Purulia' },
  '339': { zone: 'later',  hq: 'Bankura' },
  '776': { zone: 'later',  hq: 'Jhargram' },
  '344': { zone: 'later',  hq: 'Midnapore' },
  '345': { zone: 'coast',  hq: 'Tamluk' },
  '337': { zone: 'newall', hq: 'Barasat' },
  '338': { zone: 'newall', hq: 'Chinsurah' },
  '341': { zone: 'newall', hq: 'Howrah' },
  '342': { zone: 'newall', hq: 'Kolkata' },
  '343': { zone: 'coast',  hq: 'Alipore' }
};

const CONTROL_POINTS = [
  /* ---------------- Northern hills ---------------- */
  { n:'Darjeeling',   la:27.041, lo:88.263, p:3090, on:156, hi:24,   ph:5.0, ks:4.0, soil:'Brown forest soil (Umbric Inceptisol), stony loam over phyllite', el:2045, sl:25, ec:0.1, tmin:1,   inu:0.10, wt:8,   pm:45, lu:'peri' },
  { n:'Kurseong',     la:26.880, lo:88.278, p:3900, on:156, hi:27,   ph:5.2, ks:4.5, soil:'Brown forest soil, humic loam on steep colluvium',             el:1480, sl:24, ec:0.1, tmin:4,   inu:0.10, wt:8,   pm:45, lu:'peri' },
  { n:'Mirik',        la:26.887, lo:88.187, p:2800, on:156, hi:26,   ph:5.2, ks:4.0, soil:'Brown forest soil, loam',                                     el:1495, sl:18, ec:0.1, tmin:3,   inu:0.10, wt:7,   pm:40, lu:'rural' },
  { n:'Kalimpong',    la:27.060, lo:88.470, p:2200, on:156, hi:29,   ph:5.5, ks:3.5, soil:'Brown forest soil, sandy loam on gneiss',                     el:1250, sl:20, ec:0.1, tmin:6,   inu:0.08, wt:8,   pm:45, lu:'peri' },
  { n:'Lava',         la:27.088, lo:88.663, p:3200, on:155, hi:22,   ph:4.9, ks:4.0, soil:'Podzolic brown forest soil, humic',                            el:2100, sl:26, ec:0.1, tmin:0,   inu:0.08, wt:8,   pm:35, lu:'rural' },
  { n:'Rimbik',       la:27.10, lo:88.10,   p:3300, on:155, hi:21,   ph:4.8, ks:4.0, soil:'Alpine brown forest soil',                                    el:2300, sl:28, ec:0.1, tmin:-1,  inu:0.08, wt:8,   pm:30, lu:'rural' },
  /* ---------------- Terai and Dooars ---------------- */
  { n:'Siliguri',     la:26.727, lo:88.395, p:3300, on:156, hi:35.5, ph:5.8, ks:3.5, soil:'Terai piedmont alluvium, coarse sandy loam',                  el:120,  sl:1.5, ec:0.2, tmin:9,   inu:0.35, wt:4,   pm:80, lu:'urban' },
  { n:'Bagdogra',     la:26.700, lo:88.320, p:3100, on:156, hi:35.5, ph:5.7, ks:3.5, soil:'Terai alluvium, sandy loam with gravel',                      el:130,  sl:1.2, ec:0.2, tmin:9,   inu:0.30, wt:4,   pm:70, lu:'peri' },
  { n:'Jalpaiguri',   la:26.517, lo:88.727, p:3400, on:156, hi:35,   ph:5.6, ks:3.0, soil:'Teesta alluvium, fine sandy loam',                            el:90,   sl:0.8, ec:0.2, tmin:9,   inu:0.45, wt:3,   pm:70, lu:'peri' },
  { n:'Malbazar',     la:26.856, lo:88.740, p:3800, on:155, hi:34,   ph:5.4, ks:4.0, soil:'Dooars piedmont alluvium, gravelly sandy loam',               el:140,  sl:1.5, ec:0.2, tmin:8,   inu:0.35, wt:4,   pm:60, lu:'rural' },
  { n:'Alipurduar',   la:26.485, lo:89.522, p:3900, on:155, hi:34.5, ph:5.5, ks:4.0, soil:'Dooars alluvium, coarse sandy loam',                          el:100,  sl:1.0, ec:0.2, tmin:8.5, inu:0.40, wt:3.5, pm:65, lu:'peri' },
  { n:'Jaigaon',      la:26.848, lo:89.375, p:4300, on:155, hi:33,   ph:5.3, ks:5.0, soil:'Bhutan foothill fan, gravelly loam',                          el:200,  sl:2.5, ec:0.2, tmin:8,   inu:0.30, wt:4,   pm:60, lu:'peri' },
  { n:'Cooch Behar',  la:26.324, lo:89.451, p:3200, on:156, hi:34.5, ph:5.6, ks:2.5, soil:'Terai alluvium, fine sandy loam to silt loam',                el:45,   sl:0.4, ec:0.2, tmin:9,   inu:0.50, wt:2.5, pm:70, lu:'peri' },
  { n:'Dinhata',      la:26.130, lo:89.470, p:2900, on:156, hi:35,   ph:5.8, ks:2.0, soil:'Recent alluvium, silt loam',                                  el:40,   sl:0.3, ec:0.2, tmin:9.5, inu:0.50, wt:2.5, pm:65, lu:'rural' },
  { n:'Mathabhanga',  la:26.340, lo:89.220, p:3100, on:156, hi:34.5, ph:5.7, ks:2.5, soil:'Terai alluvium, sandy loam',                                  el:50,   sl:0.4, ec:0.2, tmin:9,   inu:0.45, wt:3,   pm:60, lu:'rural' },
  /* ---------------- Old alluvium, Barind ---------------- */
  { n:'Islampur',     la:26.267, lo:88.194, p:2600, on:157, hi:36,   ph:5.8, ks:2.0, soil:'Old alluvium fringe, silt loam',                              el:60,   sl:0.4, ec:0.2, tmin:9.5, inu:0.40, wt:3,   pm:70, lu:'rural' },
  { n:'Raiganj',      la:25.617, lo:88.124, p:1950, on:157, hi:37.5, ph:6.0, ks:1.5, soil:'Old alluvium (Barind fringe), silt loam',                     el:40,   sl:0.4, ec:0.3, tmin:10,  inu:0.40, wt:3,   pm:85, lu:'peri' },
  { n:'Balurghat',    la:25.222, lo:88.777, p:1750, on:157, hi:38,   ph:6.4, ks:0.8, soil:'Barind tract old alluvium, compact clay loam',                el:30,   sl:0.3, ec:0.3, tmin:10.5,inu:0.50, wt:2.5, pm:80, lu:'peri' },
  { n:'Gangarampur',  la:25.400, lo:88.520, p:1800, on:157, hi:38,   ph:6.3, ks:0.9, soil:'Barind old alluvium, clay loam',                              el:35,   sl:0.3, ec:0.3, tmin:10.5,inu:0.45, wt:2.5, pm:70, lu:'rural' },
  { n:'Chanchal',     la:25.390, lo:88.000, p:1500, on:158, hi:38.5, ph:6.7, ks:1.0, soil:'Barind old alluvium, clay loam',                              el:30,   sl:0.2, ec:0.3, tmin:10.5,inu:0.45, wt:2.5, pm:75, lu:'rural' },
  { n:'Malda',        la:25.010, lo:88.141, p:1450, on:158, hi:39,   ph:6.9, ks:1.0, soil:'Diara and Tal alluvium, silty clay loam',                     el:25,   sl:0.2, ec:0.4, tmin:10.5,inu:0.55, wt:2.5, pm:100,lu:'urban' },
  { n:'Farakka',      la:24.820, lo:87.920, p:1400, on:158, hi:39.5, ph:7.0, ks:1.0, soil:'Ganga levee alluvium, silt loam',                             el:25,   sl:0.2, ec:0.4, tmin:11,  inu:0.55, wt:2.5, pm:90, lu:'peri' },
  /* ---------------- Murshidabad, Nadia, new alluvium ---------------- */
  { n:'Jangipur',     la:24.470, lo:88.070, p:1400, on:158, hi:40,   ph:7.0, ks:0.9, soil:'Bagri new alluvium, silt loam',                               el:22,   sl:0.2, ec:0.4, tmin:11,  inu:0.50, wt:3,   pm:80, lu:'peri' },
  { n:'Berhampore',   la:24.104, lo:88.252, p:1450, on:159, hi:40,   ph:7.3, ks:0.7, soil:'Bagri new alluvium, silty clay loam',                         el:20,   sl:0.2, ec:0.4, tmin:11,  inu:0.50, wt:3,   pm:85, lu:'urban' },
  { n:'Domkal',       la:24.130, lo:88.560, p:1500, on:159, hi:39.5, ph:7.5, ks:0.6, soil:'Padma char alluvium, silty clay',                             el:18,   sl:0.1, ec:0.5, tmin:11,  inu:0.60, wt:2,   pm:70, lu:'rural' },
  { n:'Kandi',        la:23.950, lo:88.030, p:1400, on:159, hi:40.5, ph:6.6, ks:1.2, soil:'Rarh older alluvium, sandy clay loam',                        el:25,   sl:0.3, ec:0.3, tmin:11,  inu:0.40, wt:4,   pm:70, lu:'rural' },
  { n:'Tehatta',      la:23.710, lo:88.530, p:1450, on:159, hi:39.5, ph:7.5, ks:0.7, soil:'Jalangi alluvium, silty clay',                                el:15,   sl:0.1, ec:0.5, tmin:11,  inu:0.60, wt:2,   pm:70, lu:'rural' },
  { n:'Krishnanagar', la:23.405, lo:88.502, p:1450, on:159, hi:39.5, ph:7.4, ks:0.8, soil:'New alluvium, silt loam',                                     el:12,   sl:0.2, ec:0.5, tmin:11,  inu:0.50, wt:2.5, pm:80, lu:'urban' },
  { n:'Ranaghat',     la:23.180, lo:88.570, p:1500, on:159, hi:39,   ph:7.3, ks:0.7, soil:'New alluvium, silty clay loam',                               el:11,   sl:0.15,ec:0.5, tmin:11.5,inu:0.50, wt:2,   pm:80, lu:'peri' },
  { n:'Kalyani',      la:22.975, lo:88.434, p:1550, on:158, hi:39,   ph:7.2, ks:0.5, soil:'Hooghly levee alluvium, silty clay loam',                     el:10,   sl:0.15,ec:0.5, tmin:12,  inu:0.55, wt:1.8, pm:85, lu:'peri' },
  /* ---------------- Birbhum, Bardhaman, Rarh ---------------- */
  { n:'Rampurhat',    la:24.176, lo:87.785, p:1400, on:159, hi:41,   ph:6.2, ks:2.0, soil:'Rarh lateritic sandy loam',                                   el:40,   sl:1.0, ec:0.2, tmin:10,  inu:0.20, wt:5,   pm:75, lu:'peri' },
  { n:'Suri',         la:23.910, lo:87.527, p:1350, on:160, hi:41.5, ph:5.9, ks:3.0, soil:'Rarh red lateritic sandy loam',                               el:60,   sl:1.5, ec:0.2, tmin:10,  inu:0.15, wt:6,   pm:75, lu:'peri' },
  { n:'Bolpur',       la:23.667, lo:87.683, p:1350, on:160, hi:41.5, ph:5.8, ks:3.5, soil:'Lateritic khoai, gravelly sandy loam',                        el:55,   sl:2.0, ec:0.2, tmin:10.5,inu:0.10, wt:7,   pm:70, lu:'peri' },
  { n:'Katwa',        la:23.650, lo:88.130, p:1450, on:159, hi:40.5, ph:7.1, ks:0.8, soil:'Ajay and Bhagirathi alluvium, silty clay loam',               el:22,   sl:0.2, ec:0.4, tmin:11,  inu:0.55, wt:2.5, pm:75, lu:'peri' },
  { n:'Bardhaman',    la:23.240, lo:87.869, p:1450, on:160, hi:40.5, ph:6.7, ks:0.9, soil:'New alluvium, clay loam under paddy',                         el:30,   sl:0.3, ec:0.3, tmin:11,  inu:0.45, wt:3,   pm:90, lu:'urban' },
  { n:'Kalna',        la:23.220, lo:88.370, p:1500, on:159, hi:40,   ph:7.2, ks:0.7, soil:'Hooghly alluvium, silty clay',                                el:15,   sl:0.15,ec:0.4, tmin:11.5,inu:0.50, wt:2,   pm:80, lu:'peri' },
  { n:'Durgapur',     la:23.520, lo:87.312, p:1400, on:161, hi:42,   ph:6.0, ks:2.5, soil:'Lateritic gravelly loam over Gondwana sandstone',             el:70,   sl:1.5, ec:0.3, tmin:10,  inu:0.10, wt:8,   pm:130,lu:'urban' },
  { n:'Asansol',      la:23.683, lo:86.983, p:1350, on:161, hi:42.5, ph:5.9, ks:2.5, soil:'Lateritic gravelly loam over Gondwana sandstone',             el:100,  sl:2.0, ec:0.3, tmin:10,  inu:0.10, wt:8,   pm:115,lu:'urban' },
  { n:'Raniganj',     la:23.620, lo:87.130, p:1350, on:161, hi:42.5, ph:5.9, ks:2.5, soil:'Coal-belt lateritic loam, disturbed overburden',              el:90,   sl:1.5, ec:0.4, tmin:10,  inu:0.10, wt:8,   pm:125,lu:'urban' },
  /* ---------------- Kolkata metropolitan and North 24 Parganas ---------------- */
  { n:'Barasat',      la:22.723, lo:88.481, p:1650, on:158, hi:38.5, ph:7.1, ks:0.3, soil:'Gangetic alluvial clay',                                      el:8,    sl:0.15,ec:0.6, tmin:12,  inu:0.75, wt:1.0, pm:90, lu:'peri' },
  { n:'Basirhat',     la:22.657, lo:88.867, p:1750, on:158, hi:37.5, ph:7.5, ks:0.2, soil:'Deltaic alluvial clay, brackish influence',                   el:6,    sl:0.1, ec:2.0, tmin:12.5,inu:0.75, wt:0.8, pm:70, lu:'peri' },
  { n:'Hingalganj',   la:22.450, lo:88.950, p:1800, on:157, hi:36.5, ph:7.7, ks:0.15,soil:'Tidal deltaic clay, saline',                                  el:4,    sl:0.05,ec:4.5, tmin:13,  inu:0.90, wt:0.5, pm:55, lu:'rural', tidal:true },
  { n:'Barrackpore',  la:22.760, lo:88.375, p:1650, on:158, hi:38.5, ph:7.2, ks:0.3, soil:'Gangetic alluvial clay, urban fill',                          el:8,    sl:0.1, ec:0.5, tmin:12.5,inu:0.65, wt:1.2, pm:100,lu:'urban' },
  { n:'Bidhannagar',  la:22.583, lo:88.417, p:1700, on:158, hi:38,   ph:7.2, ks:0.10,soil:'Compacted Gangetic alluvial clay over reclaimed wetland fill', el:5,    sl:0.1, ec:0.5, tmin:12.5,inu:0.90, wt:0.5, pm:100,lu:'urban' },
  { n:'Kolkata Alipore', la:22.533, lo:88.333, p:1700, on:158, hi:38, ph:7.4, ks:0.15,soil:'Gangetic alluvial clay, deep urban fill',                    el:6,    sl:0.1, ec:0.6, tmin:12.5,inu:0.80, wt:1.0, pm:105,lu:'urban' },
  { n:'Howrah',       la:22.590, lo:88.310, p:1650, on:158, hi:38,   ph:7.3, ks:0.2, soil:'Hooghly levee alluvial clay, industrial fill',                 el:6,    sl:0.1, ec:0.7, tmin:12.5,inu:0.80, wt:1.0, pm:115,lu:'urban' },
  { n:'Uluberia',     la:22.470, lo:88.110, p:1650, on:158, hi:37.5, ph:7.4, ks:0.25,soil:'Alluvial clay, low-lying',                                    el:5,    sl:0.1, ec:1.2, tmin:12.5,inu:0.75, wt:1.0, pm:95, lu:'peri' },
  { n:'Chinsurah',    la:22.900, lo:88.390, p:1550, on:158, hi:39,   ph:7.0, ks:0.4, soil:'Hooghly levee alluvium, silty clay loam',                     el:10,   sl:0.15,ec:0.5, tmin:12,  inu:0.55, wt:1.8, pm:95, lu:'urban' },
  { n:'Tarakeswar',   la:22.890, lo:88.020, p:1500, on:159, hi:39.5, ph:6.9, ks:0.7, soil:'New alluvium, clay loam under paddy',                         el:12,   sl:0.15,ec:0.4, tmin:11.5,inu:0.55, wt:2,   pm:75, lu:'rural' },
  { n:'Arambagh',     la:22.880, lo:87.780, p:1500, on:159, hi:40,   ph:6.8, ks:0.7, soil:'Damodar fan alluvium, silty clay loam',                       el:15,   sl:0.2, ec:0.3, tmin:11.5,inu:0.65, wt:1.8, pm:70, lu:'peri' },
  /* ---------------- South 24 Parganas and Sundarbans ---------------- */
  { n:'Baruipur',     la:22.360, lo:88.430, p:1750, on:158, hi:37.5, ph:7.4, ks:0.2, soil:'Deltaic alluvial clay',                                       el:5,    sl:0.1, ec:1.0, tmin:13,  inu:0.75, wt:0.8, pm:80, lu:'peri' },
  { n:'Diamond Harbour', la:22.190, lo:88.190, p:1750, on:158, hi:36.5, ph:7.6, ks:0.2, soil:'Coastal saline alluvium, clay',                            el:4,    sl:0.05,ec:2.5, tmin:13.5,inu:0.80, wt:0.8, pm:80, lu:'peri' },
  { n:'Canning',      la:22.310, lo:88.670, p:1800, on:157, hi:36.5, ph:7.7, ks:0.15,soil:'Tidal saline clay',                                           el:4,    sl:0.05,ec:4.0, tmin:13.5,inu:0.85, wt:0.6, pm:70, lu:'peri', tidal:true },
  { n:'Kakdwip',      la:21.880, lo:88.190, p:1850, on:157, hi:35.5, ph:7.8, ks:0.15,soil:'Tidal saline clay, estuarine',                                el:3,    sl:0.05,ec:5.0, tmin:14,  inu:0.90, wt:0.5, pm:60, lu:'rural', tidal:true },
  { n:'Sagar Island', la:21.650, lo:88.080, p:1900, on:157, hi:35,   ph:7.9, ks:0.3, soil:'Estuarine sandy clay, saline',                                el:3,    sl:0.05,ec:6.0, tmin:14,  inu:0.90, wt:0.5, pm:55, lu:'rural', tidal:true },
  { n:'Gosaba',       la:22.160, lo:88.800, p:1850, on:157, hi:35.5, ph:8.0, ks:0.10,soil:'Sundarbans tidal mangrove mud, saline clay',                  el:3,    sl:0.05,ec:9.0, tmin:14,  inu:0.95, wt:0.3, pm:55, lu:'rural', tidal:true },
  { n:'Jharkhali',    la:22.050, lo:88.700, p:1850, on:157, hi:35.5, ph:8.1, ks:0.10,soil:'Sundarbans tidal mangrove mud, strongly saline',              el:3,    sl:0.05,ec:11.0,tmin:14,  inu:0.95, wt:0.3, pm:50, lu:'rural', tidal:true },
  /* ---------------- Purba Medinipur coast ---------------- */
  { n:'Tamluk',       la:22.300, lo:87.920, p:1650, on:158, hi:37.5, ph:7.0, ks:0.4, soil:'Rupnarayan alluvium, silty clay',                             el:6,    sl:0.1, ec:0.8, tmin:12.5,inu:0.70, wt:1.0, pm:80, lu:'peri' },
  { n:'Haldia',       la:22.060, lo:88.070, p:1700, on:158, hi:37,   ph:7.5, ks:0.3, soil:'Estuarine alluvium, saline patches, industrial fill',         el:5,    sl:0.1, ec:2.5, tmin:13,  inu:0.70, wt:1.0, pm:90, lu:'urban' },
  { n:'Contai',       la:21.780, lo:87.750, p:1700, on:158, hi:36.5, ph:7.2, ks:1.5, soil:'Coastal sandy alluvium with saline patches',                  el:6,    sl:0.2, ec:2.0, tmin:13,  inu:0.50, wt:1.5, pm:70, lu:'peri' },
  { n:'Digha',        la:21.630, lo:87.510, p:1650, on:158, hi:35.5, ph:7.5, ks:4.0, soil:'Coastal dune sand',                                           el:4,    sl:0.5, ec:3.0, tmin:14,  inu:0.35, wt:1.5, pm:60, lu:'peri' },
  { n:'Egra',         la:21.900, lo:87.530, p:1600, on:159, hi:38,   ph:6.8, ks:1.0, soil:'Coastal plain alluvium, sandy clay loam',                     el:8,    sl:0.2, ec:0.8, tmin:12.5,inu:0.50, wt:2,   pm:65, lu:'rural' },
  /* ---------------- Paschim Medinipur, Jhargram ---------------- */
  { n:'Ghatal',       la:22.660, lo:87.720, p:1550, on:159, hi:39.5, ph:6.8, ks:0.5, soil:'Shilabati basin alluvium, silty clay, flood bowl',            el:10,   sl:0.1, ec:0.4, tmin:12,  inu:0.85, wt:1.0, pm:70, lu:'peri' },
  { n:'Midnapore',    la:22.420, lo:87.320, p:1500, on:160, hi:41,   ph:6.2, ks:2.0, soil:'Lateritic to alluvial transition, sandy loam',                el:40,   sl:1.0, ec:0.3, tmin:11,  inu:0.30, wt:5,   pm:80, lu:'urban' },
  { n:'Kharagpur',    la:22.330, lo:87.320, p:1500, on:160, hi:41,   ph:6.0, ks:2.5, soil:'Lateritic sandy loam',                                        el:45,   sl:1.0, ec:0.3, tmin:11,  inu:0.25, wt:6,   pm:85, lu:'urban' },
  { n:'Jhargram',     la:22.450, lo:86.990, p:1400, on:161, hi:42,   ph:5.6, ks:5.0, soil:'Red laterite, gravelly sandy loam',                           el:90,   sl:2.0, ec:0.2, tmin:10,  inu:0.10, wt:8,   pm:65, lu:'peri' },
  { n:'Belpahari',    la:22.600, lo:86.650, p:1400, on:161, hi:41.5, ph:5.4, ks:6.0, soil:'Hill laterite, rocky sandy loam',                             el:200,  sl:5.0, ec:0.2, tmin:9,   inu:0.05, wt:9,   pm:55, lu:'rural' },
  /* ---------------- Bankura, Purulia ---------------- */
  { n:'Bishnupur',    la:23.080, lo:87.320, p:1450, on:160, hi:42.5, ph:6.1, ks:2.5, soil:'Red lateritic sandy loam',                                    el:60,   sl:1.2, ec:0.2, tmin:10.5,inu:0.15, wt:6,   pm:70, lu:'peri' },
  { n:'Bankura',      la:23.230, lo:87.070, p:1400, on:161, hi:43,   ph:6.0, ks:3.0, soil:'Red lateritic loam',                                          el:80,   sl:1.5, ec:0.2, tmin:10.5,inu:0.15, wt:7,   pm:75, lu:'urban' },
  { n:'Khatra',       la:22.980, lo:86.850, p:1350, on:161, hi:43,   ph:5.7, ks:5.0, soil:'Gravelly laterite over gneiss',                               el:130,  sl:3.0, ec:0.2, tmin:9.5, inu:0.05, wt:9,   pm:55, lu:'rural' },
  { n:'Raghunathpur', la:23.550, lo:86.670, p:1300, on:162, hi:44,   ph:6.0, ks:5.0, soil:'Red laterite, gravelly',                                      el:150,  sl:2.5, ec:0.2, tmin:8.5, inu:0.05, wt:9,   pm:80, lu:'peri' },
  { n:'Purulia',      la:23.330, lo:86.360, p:1300, on:162, hi:44,   ph:5.9, ks:5.5, soil:'Red laterite over Chhota Nagpur gneiss, gravelly',            el:230,  sl:3.0, ec:0.2, tmin:8,   inu:0.05, wt:9,   pm:75, lu:'urban' },
  { n:'Jhalda',       la:23.370, lo:85.970, p:1250, on:162, hi:43.5, ph:5.8, ks:5.5, soil:'Red laterite, rocky',                                         el:300,  sl:4.0, ec:0.2, tmin:7,   inu:0.05, wt:9,   pm:60, lu:'rural' },
  { n:'Ayodhya Hills',la:23.190, lo:86.100, p:1400, on:162, hi:40,   ph:5.5, ks:6.0, soil:'Hill laterite, rocky sandy loam',                             el:600,  sl:12,  ec:0.1, tmin:6,   inu:0.03, wt:10,  pm:45, lu:'rural' },
  { n:'Bandwan',      la:22.880, lo:86.450, p:1350, on:161, hi:43,   ph:5.7, ks:5.5, soil:'Red laterite, gravelly',                                      el:250,  sl:3.0, ec:0.2, tmin:8.5, inu:0.05, wt:9,   pm:50, lu:'rural' }
];

/* Quick picks for the location panel */
const PRESETS = [
  { n:'Bidhannagar, Kolkata (paper case study)', la:22.583, lo:88.417, lu:'urban', area:2.5, micro:'auto' },
  { n:'Sundarbans, Gosaba tidal edge',           la:22.160, lo:88.800, lu:'rural', area:2.0, micro:'auto' },
  { n:'Darjeeling ridge',                         la:27.041, lo:88.263, lu:'peri',  area:1.0, micro:'auto' },
  { n:'Ayodhya Hills, Purulia',                   la:23.190, lo:86.100, lu:'rural', area:3.0, micro:'auto' },
  { n:'Digha coast',                              la:21.630, lo:87.510, lu:'peri',  area:1.5, micro:'auto' },
  { n:'Durgapur industrial belt',                 la:23.520, lo:87.312, lu:'urban', area:2.0, micro:'auto' },
  { n:'Siliguri terai',                           la:26.727, lo:88.395, lu:'urban', area:2.0, micro:'auto' },
  { n:'Santiniketan khoai, Bolpur',               la:23.667, lo:87.683, lu:'peri',  area:2.0, micro:'auto' }
];

/* Urban heat island increments by land use, deg C added to rural HI_max */
const UHI = { rural: 0, peri: 1.5, urban: 3.0 };
/* Compaction multipliers on hydraulic conductivity by land use */
const KS_LU = { rural: 1.0, peri: 0.75, urban: 0.45 };

/* CPCB NCAP non-attainment cities in West Bengal (PM10 above NAAQS for five years) */
const NCAP_CITIES = ['Kolkata Alipore','Howrah','Barrackpore','Asansol','Durgapur','Raniganj','Haldia'];
