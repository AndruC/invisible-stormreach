/* Storm sound, synthesized: rain, sea swell, wind, thunder, and a low hum near the Emperor. Starts only from a click. */
const Storm = (() => {
  let ctx, master, rainG, seaG, windG, humG, thunderBuf, on = false, level = { rain: .9, calm: 0, hum: 0 };
  function noiseBuffer(brown) {
    const len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return b;
  }
  function loop(buf) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }
  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    const white = noiseBuffer(false), brown = noiseBuffer(true); thunderBuf = brown;
    // rain: bright hiss
    const r = loop(white), rhp = ctx.createBiquadFilter(); rhp.type = "highpass"; rhp.frequency.value = 1100;
    const rlp = ctx.createBiquadFilter(); rlp.type = "lowpass"; rlp.frequency.value = 7500; rainG = ctx.createGain(); rainG.gain.value = 0;
    r.connect(rhp).connect(rlp).connect(rainG).connect(master);
    // sea: brown noise breathing slowly
    const s = loop(brown), slp = ctx.createBiquadFilter(); slp.type = "lowpass"; slp.frequency.value = 420; seaG = ctx.createGain(); seaG.gain.value = .0;
    const swell = ctx.createGain(); swell.gain.value = .5; const lfo = ctx.createOscillator(); lfo.frequency.value = .085; const lfoG = ctx.createGain(); lfoG.gain.value = .45;
    lfo.connect(lfoG).connect(swell.gain); lfo.start();
    s.connect(slp).connect(swell).connect(seaG).connect(master);
    // wind: a wandering band of noise
    const w = loop(white), wbp = ctx.createBiquadFilter(); wbp.type = "bandpass"; wbp.frequency.value = 380; wbp.Q.value = .9; windG = ctx.createGain(); windG.gain.value = 0;
    const wl = ctx.createOscillator(); wl.frequency.value = .05; const wlG = ctx.createGain(); wlG.gain.value = 220; wl.connect(wlG).connect(wbp.frequency); wl.start();
    w.connect(wbp).connect(windG).connect(master);
    // the Emperor's hum: two low tones, a fifth apart
    humG = ctx.createGain(); humG.gain.value = 0; humG.connect(master);
    [55, 82.4, 110.2].forEach((f, i) => { const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = [.5, .3, .12][i]; o.connect(g).connect(humG); o.start(); });
  }
  function apply() {
    if (!ctx) return; const t = ctx.currentTime;
    rainG.gain.setTargetAtTime(level.rain * .16, t, 1.2);
    seaG.gain.setTargetAtTime(.32 * (1 - level.calm * .6), t, 1.5);
    windG.gain.setTargetAtTime(.02 + level.rain * .05, t, 1.5);
    humG.gain.setTargetAtTime(level.hum * .05, t, 2);
  }
  return {
    get on() { return on; },
    toggle() {
      if (!ctx) build();
      on = !on; if (on && ctx.state === "suspended") ctx.resume();
      master.gain.setTargetAtTime(on ? .9 : 0, ctx.currentTime, .4); apply();
      clearTimeout(Storm.sus); if (!on) Storm.sus = setTimeout(() => { if (!on) ctx.suspend().then(() => { if (on) ctx.resume(); }); }, 1600); else ctx.resume();
      return on;
    },
    set(st) { Object.assign(level, st); apply(); },
    thunder(delay, strength) {
      if (!ctx || !on) return; const t = ctx.currentTime + delay;
      const src = ctx.createBufferSource(); src.buffer = thunderBuf;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(260, t); lp.frequency.exponentialRampToValueAtTime(70, t + 3);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.9 * Math.min(1, strength + .2), t + .08); g.gain.exponentialRampToValueAtTime(.001, t + 3.6);
      src.connect(lp).connect(g).connect(master); src.start(t, Math.random() * .3); src.stop(t + 3.8);
    }
  };
})();
