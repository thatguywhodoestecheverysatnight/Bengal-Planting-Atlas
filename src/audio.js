/* ------------------------------------------------------------------
   Bengal Planting Atlas : generative ambient score (Web Audio)
   Slow pads on a D major cycle (D, Bm, G, A), soft pentatonic bells
   through a tape-style delay and a synthetic hall reverb, and a faint
   filtered breeze. Nothing is downloaded; the music is synthesised
   live, so it never loops audibly and carries no licence.
------------------------------------------------------------------ */
const Ambient = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master, bus, reverb, delay, started = false, playing = false, timer = null;
  let vol = 0.4, nextChord = 0, nextBell = 0, chordIdx = 0;
  const listeners = new Set();
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const CHORDS = [
    [38, 50, 57, 62, 66, 69],   /* D  : D2 D3 A3 D4 F#4 A4 */
    [35, 47, 54, 59, 62, 66],   /* Bm : B1 B2 F#3 B3 D4 F#4 */
    [31, 43, 50, 55, 59, 62],   /* G  : G1 G2 D3 G3 B3 D4 */
    [33, 45, 52, 57, 61, 64]    /* A  : A1 A2 E3 A3 C#4 E4 */
  ];
  const BELLS = [74, 76, 78, 81, 83, 86, 88, 90];
  const CHORD_LEN = 10;

  function impulse(sec, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * sec), buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  }
  function build() {
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 5200;
    master.connect(tone); tone.connect(comp); comp.connect(ctx.destination);
    bus = ctx.createGain(); bus.gain.value = 0.55; bus.connect(master);
    reverb = ctx.createConvolver(); reverb.buffer = impulse(6, 2.6);
    const wet = ctx.createGain(); wet.gain.value = 0.7; reverb.connect(wet); wet.connect(master);
    delay = ctx.createDelay(3); delay.delayTime.value = 0.68;
    const fb = ctx.createGain(); fb.gain.value = 0.34;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2400;
    delay.connect(dl); dl.connect(fb); fb.connect(delay);
    const dOut = ctx.createGain(); dOut.gain.value = 0.4; dl.connect(dOut); dOut.connect(reverb); dOut.connect(bus);
    breeze();
  }
  function breeze() {
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 380; lfo.connect(lfoAmt); lfoAmt.connect(bp.frequency);
    const g = ctx.createGain(); g.gain.value = 0.05;
    src.connect(bp); bp.connect(g); g.connect(reverb); g.connect(bus);
    src.start(); lfo.start();
  }
  function pad(t, chord, dur) {
    chord.forEach((m, i) => {
      const f = midi(m);
      [['sine', -6, 1], ['triangle', 6, 0.42]].forEach(([type, det, amt]) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det + (Math.random() * 4 - 2);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + i * 90; lp.Q.value = 0.4;
        const g = ctx.createGain();
        const peak = (i === 0 ? 0.05 : 0.034 / (1 + i * 0.18)) * amt;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(peak, t + 3.8);
        g.gain.setValueAtTime(peak, t + dur - 0.5);
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 4.5);
        o.connect(lp); lp.connect(g); g.connect(bus); g.connect(reverb);
        o.start(t); o.stop(t + dur + 4.7);
      });
    });
  }
  function bell(t, m) {
    const f = midi(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 3.6);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    [[f, 1], [f * 2.005, 0.22], [f * 3.01, 0.07]].forEach(([fr, a]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
      const ga = ctx.createGain(); ga.gain.value = a; o.connect(ga); ga.connect(g);
      o.start(t); o.stop(t + 3.8);
    });
    let out = g;
    if (pan) { pan.pan.value = Math.random() * 1.2 - 0.6; g.connect(pan); out = pan; }
    out.connect(bus); out.connect(delay); out.connect(reverb);
  }
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    while (nextChord < now + 1.5) { pad(nextChord, CHORDS[chordIdx % CHORDS.length], CHORD_LEN); chordIdx++; nextChord += CHORD_LEN; }
    while (nextBell < now + 1.5) {
      const m = BELLS[Math.floor(Math.random() * BELLS.length)];
      bell(nextBell, m);
      if (Math.random() < 0.28) bell(nextBell + 0.42, BELLS[Math.max(0, BELLS.indexOf(m) - 1)]);
      nextBell += 2.2 + Math.random() * 4.2;
    }
  }
  function emit() { listeners.forEach(fn => fn({ playing, vol })); }
  async function play() {
    if (!AC) return false;
    if (!ctx) build();
    try { await ctx.resume(); } catch (e) { }
    if (ctx.state !== 'running') return false;
    if (!started) { started = true; nextChord = ctx.currentTime + 0.05; nextBell = ctx.currentTime + 3.5; timer = setInterval(tick, 350); tick(); }
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(vol, ctx.currentTime, 1.2);
    playing = true; emit(); return true;
  }
  function pause() {
    if (!ctx) { playing = false; emit(); return; }
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
    playing = false; emit();
    setTimeout(() => { if (!playing && ctx) ctx.suspend().catch(() => { }); }, 900);
  }
  function setVolume(v) {
    vol = Math.max(0, Math.min(1, v));
    if (ctx && playing) master.gain.setTargetAtTime(vol, ctx.currentTime, 0.15);
    emit();
  }
  /* try to start straight away; browsers that block audible autoplay
     leave the context suspended until the first click or key press */
  function autoplay() { if (!AC) return Promise.resolve(false); return play(); }
  document.addEventListener('visibilitychange', () => {
    if (!ctx || !playing) return;
    if (document.hidden) ctx.suspend().catch(() => { }); else ctx.resume().catch(() => { });
  });
  return { play, pause, setVolume, autoplay, get playing() { return playing; }, get volume() { return vol; }, get supported() { return !!AC; }, on: fn => listeners.add(fn) };
})();
