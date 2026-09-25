/* ------------------------------------------------------------------
   Bengal Planting Atlas : 3D relief map (Three.js r128)
   Districts are extruded by mean elevation (relief exaggerated), the
   selected district lifts off the map and casts a shadow, a pin marks
   the exact coordinate. Drag sideways to orbit, tap to choose a point.
------------------------------------------------------------------ */
const Map3D = (() => {
  if (typeof THREE === 'undefined') return { init: () => false, select() {}, reset() {}, setActive() {} };
  const W = MAP_META.W, H = MAP_META.H;
  const toLocal = (x, y) => new THREE.Vector2(x - W / 2, H / 2 - y);
  const toLatLon = (lx, ly) => { const x = lx + W / 2, y = H / 2 - ly; return { lon: x / (MAP_META.cosm * MAP_META.k) + MAP_META.lon0, lat: MAP_META.lat1 - y / MAP_META.k }; };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer, scene, camera, raycaster, root, container, tip, label, onPick = null, active = true;
  let pin, ringA, ringB, sun;
  const items = [];
  let selected = null, hovered = null, selPoint = new THREE.Vector2(0, 0);
  const cam = { yaw: 0, pitch: 0.92, dist: 1100, tYaw: 0, tPitch: 0.92, focus: new THREE.Vector3(0, -10, 0), tFocus: new THREE.Vector3(0, -10, 0) };
  let lastInteract = 0, t0 = performance.now(), inView = true, needsFrame = true, introT = 0, renders = 0;

  function reliefHeight(d) {
    const ll = toLatLon(d.cx - W / 2, H / 2 - d.cy);
    const env = fetchEnvironment(ll.lat, ll.lon);
    return { h: 3 + Math.sqrt(Math.max(0, env.el)) * 0.62, el: env.el };
  }

  function build() {
    root = new THREE.Group(); scene.add(root);
    /* ground: shadow catcher, soft grid, glow disc */
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.ShadowMaterial({ opacity: 0.42 }));
    ground.position.z = -0.2; ground.receiveShadow = true; scene.add(ground);
    const grid = new THREE.GridHelper(1600, 40, 0x2d5a4a, 0x173229);
    grid.rotation.x = Math.PI / 2; grid.position.z = -0.4; grid.material.transparent = true; grid.material.opacity = 0.35; scene.add(grid);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(520, 64), new THREE.MeshBasicMaterial({ color: 0x1a4a3a, transparent: true, opacity: 0.18 }));
    glow.position.z = -0.3; scene.add(glow);

    const order = DISTRICTS.slice().sort((a, b) => a.cy - b.cy);
    DISTRICTS.forEach(d => {
      const zone = DISTRICT_META[d.code].zone, col = new THREE.Color(ZONES[zone].color).convertSRGBToLinear();
      const shapes = d.rings.map(r => new THREE.Shape(r.map(([x, y]) => toLocal(x, y))));
      const rel = reliefHeight(d);
      const geo = new THREE.ExtrudeGeometry(shapes, { depth: rel.h, bevelEnabled: false, curveSegments: 1 });
      const cap = new THREE.MeshStandardMaterial({ color: col, roughness: 0.78, metalness: 0.04, emissive: col.clone(), emissiveIntensity: 0.0 });
      const side = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.42), roughness: 0.9, metalness: 0.0 });
      const mesh = new THREE.Mesh(geo, [cap, side]);
      mesh.castShadow = true; mesh.receiveShadow = true;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), new THREE.LineBasicMaterial({ color: 0x06110e, transparent: true, opacity: 0.55 }));
      mesh.add(edges);
      const outline = new THREE.Group();
      const olMat = new THREE.LineBasicMaterial({ color: 0xf6ead0, transparent: true, opacity: 0.95 });
      d.rings.forEach(r => { const pts = r.map(([x, y]) => { const v = toLocal(x, y); return new THREE.Vector3(v.x, v.y, rel.h + 0.25); }); outline.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), olMat)); });
      outline.visible = false; mesh.add(outline);
      mesh.scale.z = reduce ? 1 : 0.001;
      root.add(mesh);
      const it = { d, zone, mesh, cap, edges, outline, h: rel.h, el: rel.el, lift: 0, tLift: 0, glow: 0, tGlow: 0, delay: order.indexOf(d) * 45 };
      mesh.userData.item = it; items.push(it);
    });

    /* pin */
    pin = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 30, 10), new THREE.MeshStandardMaterial({ color: 0xf1e6cf, roughness: 0.4 }));
    stem.rotation.x = Math.PI / 2; stem.position.z = 15; stem.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshStandardMaterial({ color: 0xe3836a, emissive: 0xe3836a, emissiveIntensity: 0.45, roughness: 0.35 }));
    head.position.z = 33; head.castShadow = true;
    pin.add(stem, head); scene.add(pin);
    const ringMat = () => new THREE.MeshBasicMaterial({ color: 0xe7b85a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    ringA = new THREE.Mesh(new THREE.RingGeometry(4, 5.4, 48), ringMat());
    ringB = new THREE.Mesh(new THREE.RingGeometry(4, 5.4, 48), ringMat());
    scene.add(ringA, ringB);
  }

  function lights() {
    scene.add(new THREE.HemisphereLight(0xcfeede, 0x0a1a15, 1.05));
    sun = new THREE.DirectionalLight(0xfff1d6, 0.95);
    sun.position.set(-320, 380, 720); sun.castShadow = true;
    const sm = window.innerWidth < 700 ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm);
    const s = sun.shadow.camera; s.left = -480; s.right = 480; s.top = 480; s.bottom = -480; s.near = 100; s.far = 2000;
    sun.shadow.bias = -0.0008;
    scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight(0x86bce8, 0.35); rim.position.set(420, -300, 260); scene.add(rim);
  }

  function fitDistance() {
    const w = container.clientWidth || 400, h = container.clientHeight || 500, aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const needW = 500, needH = 560 * Math.cos(cam.pitch) + 250 * Math.sin(cam.pitch);
    return Math.max(needW / (2 * t * aspect), needH / (2 * t)) * 1.02;
  }
  function placeCamera() {
    const d = cam.dist, sp = Math.sin(cam.pitch);
    camera.position.set(cam.focus.x + d * sp * Math.sin(cam.yaw), cam.focus.y - d * sp * Math.cos(cam.yaw), cam.focus.z + d * Math.cos(cam.pitch));
    camera.up.set(0, 0, 1); camera.lookAt(cam.focus);
  }
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    cam.dist = fitDistance(); needsFrame = true;
  }

  /* ---------- interaction ---------- */
  const ptr = { down: false, x: 0, y: 0, moved: false, id: null };
  function ndc(ev) { const r = renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); }
  function hit(ev) {
    raycaster.setFromCamera(ndc(ev), camera);
    const hits = raycaster.intersectObjects(items.map(i => i.mesh), false);
    return hits.length ? hits[0] : null;
  }
  function onDown(ev) { container.classList.add('touched'); ptr.down = true; ptr.moved = false; ptr.x = ev.clientX; ptr.y = ev.clientY; ptr.id = ev.pointerId; lastInteract = performance.now(); }
  function onMove(ev) {
    if (ptr.down && ptr.id === ev.pointerId) {
      const dx = ev.clientX - ptr.x, dy = ev.clientY - ptr.y;
      if (!ptr.moved && Math.hypot(dx, dy) > 5) { ptr.moved = true; try { renderer.domElement.setPointerCapture(ev.pointerId); } catch (e) { } }
      if (ptr.moved) {
        cam.tYaw = THREE.MathUtils.clamp(cam.tYaw - dx * 0.006, -0.9, 0.9);
        cam.tPitch = THREE.MathUtils.clamp(cam.tPitch - dy * 0.004, 0.32, 1.2);
        ptr.x = ev.clientX; ptr.y = ev.clientY; lastInteract = performance.now(); needsFrame = true;
        container.classList.add('dragging');
      }
      return;
    }
    const h = hit(ev); const it = h ? h.object.userData.item : null;
    if (it !== hovered) { hovered = it; needsFrame = true; }
    if (it) {
      const r = container.getBoundingClientRect();
      tip.hidden = false;
      tip.innerHTML = `<b>${it.d.name}</b><span>${ZONES[it.zone].name} · ${Math.round(it.el)} m</span>`;
      tip.style.transform = `translate(${ev.clientX - r.left + 14}px, ${ev.clientY - r.top + 12}px)`;
      container.style.cursor = 'crosshair';
    } else { tip.hidden = true; container.style.cursor = 'grab'; }
  }
  function onUp(ev) {
    if (!ptr.down) return;
    ptr.down = false; container.classList.remove('dragging');
    try { renderer.domElement.releasePointerCapture(ev.pointerId); } catch (e) { }
    if (ptr.moved) return;
    const h = hit(ev);
    if (h && onPick) { const ll = toLatLon(h.point.x, h.point.y); onPick(ll.lat, ll.lon); }
  }
  function onLeave() { hovered = null; tip.hidden = true; needsFrame = true; }

  /* ---------- frame loop ---------- */
  const ease = t => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    requestAnimationFrame(frame);
    if (!active || !inView || document.hidden) return;
    const t = (now - t0) / 1000;
    let animating = false;
    /* intro rise, north to south */
    if (!reduce && introT < 1) {
      introT = Math.min(1, (now - t0) / 2200);
      items.forEach(it => { const k = THREE.MathUtils.clamp((now - t0 - it.delay) / 900, 0, 1); it.mesh.scale.z = Math.max(0.001, ease(k)); });
      animating = true;
    }
    /* idle sway */
    if (!reduce && !ptr.down && now - lastInteract > 5000) { cam.tYaw = Math.sin(t * 0.12) * 0.16; animating = true; }
    const k = reduce ? 1 : 0.07;
    cam.yaw += (cam.tYaw - cam.yaw) * k; cam.pitch += (cam.tPitch - cam.pitch) * k;
    cam.focus.lerp(cam.tFocus, reduce ? 1 : 0.05);
    if (Math.abs(cam.tYaw - cam.yaw) > 1e-4 || Math.abs(cam.tPitch - cam.pitch) > 1e-4 || cam.focus.distanceTo(cam.tFocus) > 0.05) animating = true;
    cam.dist = fitDistance() * (selected ? 0.97 : 1);
    placeCamera();
    items.forEach(it => {
      it.tGlow = it === selected ? 0.42 : it === hovered ? 0.2 : 0;
      it.glow += (it.tGlow - it.glow) * (reduce ? 1 : 0.12);
      it.cap.emissiveIntensity = it.glow;
      const bob = it === selected && !reduce ? Math.sin(t * 1.6) * 1.4 : 0;
      it.lift += (it.tLift - it.lift) * (reduce ? 1 : 0.085);
      it.mesh.position.z = it.lift + bob;
      if (Math.abs(it.tLift - it.lift) > 0.01 || Math.abs(it.tGlow - it.glow) > 0.002) animating = true;
    });
    if (selected) {
      const top = selected.h * selected.mesh.scale.z + selected.mesh.position.z;
      pin.position.set(selPoint.x, selPoint.y, top);
      const ph = (t % 2.4) / 2.4, ph2 = ((t + 1.2) % 2.4) / 2.4;
      [[ringA, ph], [ringB, ph2]].forEach(([r, p]) => { const s = reduce ? 2 : 1 + p * 5; r.scale.set(s, s, 1); r.material.opacity = reduce ? 0.6 : 0.85 * (1 - p); r.position.set(selPoint.x, selPoint.y, top + 0.4); });
      pin.visible = ringA.visible = ringB.visible = true;
      /* floating label */
      const v = new THREE.Vector3(selPoint.x, selPoint.y, top + 42).project(camera);
      const r = container.getBoundingClientRect();
      const lw = label.offsetWidth || 160, lx = THREE.MathUtils.clamp(((v.x + 1) / 2) * r.width, lw / 2 + 8, r.width - lw / 2 - 8);
      const ly = Math.max(((1 - v.y) / 2) * r.height, (label.offsetHeight || 30) + 8);
      label.style.transform = `translate(${lx}px, ${ly}px) translate(-50%, -100%)`;
      label.hidden = false;
      animating = true;
    } else { pin.visible = ringA.visible = ringB.visible = false; label.hidden = true; }
    if (animating || needsFrame) { renderer.render(scene, camera); needsFrame = false; renders++; }
  }

  /* ---------- public ---------- */
  function init(el, opts) {
    container = el; onPick = opts && opts.onPick;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    } catch (e) { return false; }
    if (!renderer || !renderer.getContext()) return false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.className = 'map3d-canvas';
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Three dimensional relief map of West Bengal districts. Tap a point to choose a site.');
    container.appendChild(renderer.domElement);
    tip = document.createElement('div'); tip.className = 'map3d-tip'; tip.hidden = true; container.appendChild(tip);
    label = document.createElement('div'); label.className = 'map3d-label'; label.hidden = true; container.appendChild(label);
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x06110e, 1500, 3200);
    camera = new THREE.PerspectiveCamera(34, 1, 10, 5000);
    raycaster = new THREE.Raycaster();
    lights(); build(); resize();
    const ro = new ResizeObserver(resize); ro.observe(container);
    const io = new IntersectionObserver(es => { inView = es[0].isIntersecting; needsFrame = true; }); io.observe(container);
    const c = renderer.domElement;
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', () => { ptr.down = false; container.classList.remove('dragging'); });
    c.addEventListener('pointerleave', onLeave);
    requestAnimationFrame(frame);
    return true;
  }
  function select(lat, lon, code) {
    if (!renderer) return;
    const it = items.find(i => i.d.code === code) || null;
    items.forEach(i => { i.tLift = i === it ? 18 : 0; i.outline.visible = i === it; });
    selected = it;
    const p = proj(lat, lon); selPoint = toLocal(p.x, p.y);
    cam.tFocus.set(selPoint.x * 0.12, selPoint.y * 0.12 - 18, 0);
    if (it) label.innerHTML = `<b>${it.d.name}</b><span>${ZONES[it.zone].name}</span>`;
    needsFrame = true;
  }
  function proj(lat, lon) { return { x: (lon - MAP_META.lon0) * MAP_META.cosm * MAP_META.k, y: (MAP_META.lat1 - lat) * MAP_META.k }; }
  function reset() { cam.tYaw = 0; cam.tPitch = 0.92; lastInteract = 0; needsFrame = true; }
  function setActive(v) { active = v; needsFrame = true; if (v) resize(); }
  function debug() { return { inView, active, renders, w: renderer && renderer.domElement.width, h: renderer && renderer.domElement.height, cw: container && container.clientWidth, ch: container && container.clientHeight, lost: renderer && renderer.getContext().isContextLost() }; }
  return { init, select, reset, setActive, debug };
})();
