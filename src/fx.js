/* ------------------------------------------------------------------
   Bengal Planting Atlas : motion and ambience layer
------------------------------------------------------------------ */
const FX = (() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  /* ---------- drifting seeds and leaves ---------- */
  function particles() {
    const c = $('#fxcanvas'); if (!c) return;
    const g = c.getContext('2d');
    let w, h, dpr, seeds = [], leaves = [], raf = 0;
    const leafCols = ['rgba(98,201,160,', 'rgba(231,184,90,', 'rgba(227,131,106,', 'rgba(163,201,94,'];
    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2); w = window.innerWidth; h = window.innerHeight;
      c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px'; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(90, w * h / 16000));
      seeds = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: 0.6 + Math.random() * 1.8, vy: -(0.08 + Math.random() * 0.25), ph: Math.random() * 6.28, a: 0.15 + Math.random() * 0.45 }));
      leaves = Array.from({ length: Math.round(n / 9) + 3 }, () => newLeaf(true));
    }
    function newLeaf(anywhere) {
      return { x: Math.random() * w, y: anywhere ? Math.random() * h : -30, s: 5 + Math.random() * 7, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.02,
        vy: 0.18 + Math.random() * 0.35, ph: Math.random() * 6.28, col: leafCols[Math.floor(Math.random() * leafCols.length)], a: 0.14 + Math.random() * 0.2 };
    }
    function drawLeaf(l) {
      g.save(); g.translate(l.x, l.y); g.rotate(l.rot);
      g.beginPath(); g.moveTo(0, -l.s); g.quadraticCurveTo(l.s * 0.75, 0, 0, l.s); g.quadraticCurveTo(-l.s * 0.75, 0, 0, -l.s);
      g.fillStyle = l.col + l.a + ')'; g.fill();
      g.beginPath(); g.moveTo(0, -l.s * 0.9); g.lineTo(0, l.s * 0.9); g.strokeStyle = 'rgba(6,17,14,' + (l.a * 0.9) + ')'; g.lineWidth = 0.6; g.stroke();
      g.restore();
    }
    function step(t) {
      g.clearRect(0, 0, w, h);
      const sy = window.scrollY * 0.04;
      seeds.forEach(p => {
        if (!reduce) { p.y += p.vy; p.x += Math.sin(t / 2400 + p.ph) * 0.18; if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; } }
        const y = ((p.y - sy) % h + h) % h;
        g.beginPath(); g.arc(p.x, y, p.r, 0, 6.283);
        g.fillStyle = `rgba(214, 240, 222, ${p.a * (0.6 + 0.4 * Math.sin(t / 900 + p.ph))})`; g.fill();
      });
      leaves.forEach((l, i) => {
        if (!reduce) { l.y += l.vy; l.x += Math.sin(t / 1800 + l.ph) * 0.45; l.rot += l.vr + Math.sin(t / 1400 + l.ph) * 0.004; if (l.y > h + 30) leaves[i] = newLeaf(false); }
        drawLeaf(l);
      });
      if (!reduce) raf = requestAnimationFrame(step);
    }
    size(); window.addEventListener('resize', () => { size(); if (reduce) step(0); });
    document.addEventListener('visibilitychange', () => { if (reduce) return; if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(step); });
    raf = requestAnimationFrame(step);
  }

  /* ---------- reveal on scroll ---------- */
  function reveals() {
    const els = $$('.reveal');
    if (reduce || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.06, rootMargin: '0px 0px -40px 0px' });
    els.forEach(e => { const r = e.getBoundingClientRect(); if (r.top < window.innerHeight) e.classList.add('in'); else io.observe(e); });
  }

  /* ---------- count up ---------- */
  function countUp(root) {
    $$('[data-count]', root).forEach(el => {
      const to = parseFloat(el.dataset.count), dec = parseInt(el.dataset.dec || '0', 10);
      const from = parseFloat(el.dataset.from || '0');
      if (reduce || isNaN(to)) { el.textContent = to.toFixed(dec); return; }
      const t0 = performance.now(), dur = 1100;
      const f = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = (from + (to - from) * e).toFixed(dec); if (k < 1) requestAnimationFrame(f); };
      requestAnimationFrame(f);
    });
  }

  /* ---------- tilt with glare for the palette cards ---------- */
  function tilt(root) {
    if (reduce || !window.matchMedia('(hover: hover)').matches) return;
    $$('.pick', root).forEach(card => {
      card.addEventListener('pointermove', ev => {
        const r = card.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
        card.style.setProperty('--rx', ((0.5 - y) * 7).toFixed(2) + 'deg');
        card.style.setProperty('--ry', ((x - 0.5) * 9).toFixed(2) + 'deg');
        card.style.setProperty('--gx', (x * 100).toFixed(1) + '%'); card.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
        card.classList.add('tilting');
      });
      card.addEventListener('pointerleave', () => { card.classList.remove('tilting'); card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
    });
  }

  /* ---------- cursor spotlight on cards ---------- */
  function spotlight() {
    if (!window.matchMedia('(hover: hover)').matches) return;
    let pending = null, queued = false;
    document.addEventListener('pointermove', ev => {
      pending = ev; if (queued) return; queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const e = pending; const card = e.target.closest && e.target.closest('.card'); if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px'); card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    }, { passive: true });
  }

  /* ---------- scroll progress and active nav ---------- */
  function scrollUI() {
    const bar = $('#progress'), links = $$('.nav a'), bar2 = $('#topbar');
    const secs = links.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
    const on = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
      bar2.classList.toggle('scrolled', window.scrollY > 20);
      let cur = null; secs.forEach(s => { if (s.getBoundingClientRect().top < window.innerHeight * 0.35) cur = s.id; });
      links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + cur));
    };
    window.addEventListener('scroll', on, { passive: true }); on();
  }

  /* ---------- sound controls ---------- */
  function sound() {
    const btn = $('#sndToggle'), vol = $('#sndVol'), num = $('#volNum'), box = $('#sound');
    if (!Ambient.supported) { box.hidden = true; return; }
    let saved = 40, muted = false;
    try { const v = localStorage.getItem('bpa-vol'); if (v !== null) saved = +v; muted = localStorage.getItem('bpa-muted') === '1'; } catch (e) { }
    vol.value = saved; num.textContent = saved; Ambient.setVolume(saved / 100 * 0.9);
    const paintVol = () => vol.style.setProperty('--fill', vol.value + '%');
    paintVol();
    Ambient.on(({ playing }) => {
      box.classList.toggle('playing', playing);
      btn.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
      btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
      $('#sndState').textContent = playing ? 'Ambient on' : 'Ambient off';
    });
    btn.addEventListener('click', () => {
      if (Ambient.playing) { Ambient.pause(); try { localStorage.setItem('bpa-muted', '1'); } catch (e) { } }
      else { Ambient.play(); try { localStorage.setItem('bpa-muted', '0'); } catch (e) { } }
    });
    vol.addEventListener('input', () => {
      num.textContent = vol.value; paintVol(); Ambient.setVolume(vol.value / 100 * 0.9);
      try { localStorage.setItem('bpa-vol', vol.value); } catch (e) { }
      if (+vol.value > 0 && !Ambient.playing) Ambient.play();
    });
    return { muted };
  }

  /* ---------- splash ---------- */
  function splash(onEnter) {
    const s = $('#splash'); if (!s) { onEnter(); return; }
    document.documentElement.classList.add('locked');
    const prefs = sound() || { muted: false };
    let entered = false;
    const enter = withSound => {
      if (entered) return; entered = true;
      if (withSound) Ambient.play(); else Ambient.pause();
      try { localStorage.setItem('bpa-muted', withSound ? '0' : '1'); } catch (e) { }
      s.classList.add('out'); document.documentElement.classList.remove('locked');
      setTimeout(() => { s.hidden = true; }, reduce ? 0 : 1100);
      onEnter();
    };
    $('#enter').addEventListener('click', () => enter(true));
    $('#enterQuiet').addEventListener('click', () => enter(false));
    document.addEventListener('keydown', function k(ev) { if (!entered && ev.key === 'Escape') { enter(false); document.removeEventListener('keydown', k); } });
    /* attempt real autoplay the moment the page lands */
    if (!prefs.muted) Ambient.autoplay().then(ok => { if (ok) $('#splashNote').textContent = 'The ambient score is playing. Adjust or mute it any time, top right.'; });
    /* first interaction anywhere also starts the score if the browser held it back */
    const kick = () => { if (!prefs.muted && !Ambient.playing && !entered) Ambient.play(); };
    window.addEventListener('pointerdown', kick, { once: true, capture: true });
    setTimeout(() => $('#enter').focus({ preventScroll: true }), 50);
  }

  function heroCounters() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.dataset.count = v; };
    set('cSpecies', SPECIES.filter(s => s.status !== 'exotic').length);
    set('cStations', CONTROL_POINTS.length);
    set('cDistricts', DISTRICTS.length);
    set('cCriteria', 9);
    countUp($('.hero'));
  }

  function init(onEnter) {
    particles(); spotlight(); scrollUI(); reveals();
    splash(() => { heroCounters(); onEnter && onEnter(); });
  }
  return { init, countUp, tilt, reduce };
})();
