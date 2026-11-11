// 狩りの谷 — 音（すべて WebAudio でその場で合成。音声ファイルなし）
(function () {
  'use strict';
  const KT = globalThis.KT;
  const M = KT.M;
  const Au = (KT.Audio = { vol: 0.5, muted: false, ready: false });
  let ctx = null, master, sfxBus, musBus, rev, noiseBuf, wind;
  let mode = 'none', step = 0, nextT = 0, bar = 0, modeBars = 0;

  Au.init = function () {
    if (ctx || Au.muted) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = Au.vol;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1.0; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = 0.34; musBus.connect(master);
    // リバーブ（ノイズから作る）
    const len = ctx.sampleRate * 2.2;
    const ib = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ib.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    rev = ctx.createConvolver(); rev.buffer = ib;
    const rg = ctx.createGain(); rg.gain.value = 0.5;
    rev.connect(rg); rg.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // 風
    wind = ctx.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.6;
    const wg = ctx.createGain(); wg.gain.value = 0.035;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lg = ctx.createGain(); lg.gain.value = 180;
    lfo.connect(lg); lg.connect(wf.frequency); lfo.start();
    wind.connect(wf); wf.connect(wg); wg.connect(master); wind.start();
    Au.ready = true;
    nextT = ctx.currentTime + 0.1;
  };
  Au.resume = function () { if (ctx && ctx.state === 'suspended') ctx.resume(); };
  Au.setVolume = function (v) { Au.vol = v; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.03); };

  function env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(t, f0, f1, dur, gain, type, dest, wet) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, 0.005, dur, gain);
    o.connect(g); g.connect(dest || sfxBus);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(rev); }
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function noise(t, dur, gain, ftype, f0, f1, q, dest, wet, attack) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    env(g, t, attack || 0.004, dur, gain);
    s.connect(f); f.connect(g); g.connect(dest || sfxBus);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(rev); }
    s.start(t, Math.random()); s.stop(t + dur + 0.06);
  }
  const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- 効果音 ----------
  const SF = {
    swing(heavy) { const t = ctx.currentTime; noise(t, heavy ? 0.3 : 0.16, heavy ? 0.5 : 0.3, 'bandpass', heavy ? 260 : 600, heavy ? 1100 : 2400, 1.2, null, 0.1, heavy ? 0.08 : 0.03); },
    hit(mv, cls, crit) {
      const t = ctx.currentTime, v = M.clamp(0.35 + mv / 140, 0.3, 1.2);
      tone(t, 150, 46, 0.14 + mv * 0.0012, 0.75 * v, 'sine');
      noise(t, 0.09 + mv * 0.001, 0.55 * v, 'highpass', 1800, 900, 0.7, null, 0.15);
      if (cls === 2 || crit) { tone(t, 1760, 1320, 0.16, 0.14, 'triangle', null, 0.4); tone(t + 0.02, 2640, 2100, 0.12, 0.08, 'sine', null, 0.4); }
      if (cls === 0) tone(t, 900, 700, 0.06, 0.1, 'square');
      if (mv >= 60) noise(t, 0.4, 0.5 * v, 'lowpass', 500, 90, 0.7, null, 0.3);
    },
    bounce() { const t = ctx.currentTime; [1210, 1873, 2637].forEach((f, i) => tone(t, f, f * 0.98, 0.22 - i * 0.04, 0.1, 'square', null, 0.3)); },
    dodge() { noise(ctx.currentTime, 0.2, 0.22, 'bandpass', 900, 300, 0.9); },
    perfect() { const t = ctx.currentTime; tone(t, 1319, 1319, 0.6, 0.2, 'sine', null, 0.7); tone(t + 0.05, 1976, 1976, 0.7, 0.16, 'sine', null, 0.7); tone(t + 0.1, 2637, 2637, 0.6, 0.1, 'sine', null, 0.7); },
    pguard() { const t = ctx.currentTime; [820, 1240, 1990].forEach((f) => tone(t, f, f * 0.97, 0.3, 0.14, 'square', null, 0.4)); tone(t + 0.04, 1976, 1976, 0.6, 0.14, 'sine', null, 0.7); },
    guard() { const t = ctx.currentTime; [520, 790, 1310].forEach((f) => tone(t, f, f * 0.96, 0.18, 0.12, 'square', null, 0.25)); noise(t, 0.1, 0.3, 'bandpass', 1500, 800, 1); },
    hurt(blow) { const t = ctx.currentTime; tone(t, 200, 60, 0.25, 0.7, 'sine'); noise(t, 0.2, 0.5, 'lowpass', 1200, 200, 0.7); if (blow) tone(t, 420, 110, 0.4, 0.2, 'sawtooth'); },
    roar() {
      const t = ctx.currentTime;
      const out = ctx.createGain(); out.gain.value = 0.9;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1500, t + 0.3); lp.frequency.linearRampToValueAtTime(600, t + 1.4);
      const sh = ctx.createWaveShaper();
      const cv = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cv[i] = Math.tanh(x * 3.5); }
      sh.curve = cv;
      lp.connect(sh); sh.connect(out); out.connect(sfxBus);
      const w = ctx.createGain(); w.gain.value = 0.6; out.connect(w); w.connect(rev);
      [1, 1.49, 2.02, 0.5].forEach((mul, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(70 * mul, t);
        o.frequency.linearRampToValueAtTime(128 * mul, t + 0.25);
        o.frequency.linearRampToValueAtTime(84 * mul, t + 1.3);
        const lf = ctx.createOscillator(), lg = ctx.createGain();
        lf.frequency.value = 23 + i * 5; lg.gain.value = 9 * mul;
        lf.connect(lg); lg.connect(o.frequency); lf.start(t); lf.stop(t + 1.6);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3, t + 0.12); g.gain.setValueAtTime(0.3, t + 1.0); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        o.connect(g); g.connect(lp); o.start(t); o.stop(t + 1.6);
      });
      noise(t, 1.4, 0.35, 'bandpass', 500, 1400, 0.6, lp, 0, 0.15);
    },
    footfall(v) { const t = ctx.currentTime; tone(t, 72, 38, 0.14, 0.5 * v, 'sine'); noise(t, 0.12, 0.2 * v, 'lowpass', 300, 100, 0.7); },
    boom(v) { const t = ctx.currentTime; tone(t, 90, 28, 0.5, 0.95 * v, 'sine'); noise(t, 0.6, 0.6 * v, 'lowpass', 600, 80, 0.7, null, 0.4); noise(t, 0.12, 0.4 * v, 'highpass', 2500, 1200, 0.7); },
    zap() { const t = ctx.currentTime; tone(t, 1900, 180, 0.2, 0.2, 'sawtooth', null, 0.3); noise(t, 0.18, 0.3, 'highpass', 3000, 5000, 0.7, null, 0.3); },
    thunder(v) { const t = ctx.currentTime; noise(t, 0.09, 0.9 * v, 'highpass', 2200, 1500, 0.5, null, 0.5); noise(t + 0.03, 1.3, 0.75 * v, 'lowpass', 420, 60, 0.6, null, 0.6); tone(t, 70, 30, 0.7, 0.5 * v, 'sine'); },
    warn() { tone(ctx.currentTime, 660, 990, 0.12, 0.07, 'triangle'); },
    charge(lv) { const t = ctx.currentTime; const f = [0, 660, 880, 1175][lv]; tone(t, f, f, 0.3, 0.2, 'triangle', null, 0.5); tone(t, f * 1.5, f * 1.5, 0.25, 0.1, 'sine', null, 0.5); },
    heal() { const t = ctx.currentTime; [72, 76, 79, 84].forEach((m, i) => tone(t + i * 0.07, mf(m), mf(m), 0.35, 0.13, 'sine', null, 0.5)); },
    gulp() { const t = ctx.currentTime; tone(t, 300, 180, 0.09, 0.2, 'sine'); tone(t + 0.25, 320, 190, 0.09, 0.2, 'sine'); tone(t + 0.5, 340, 200, 0.09, 0.2, 'sine'); },
    sharpen() { const t = ctx.currentTime; noise(t, 0.2, 0.3, 'bandpass', 3200, 4200, 3); tone(t + 0.15, 2400, 2500, 0.4, 0.07, 'sine', null, 0.5); },
    scrape() { noise(ctx.currentTime, 0.25, 0.18, 'bandpass', 2600, 3800, 3, null, 0, 0.05); },
    shatter() { const t = ctx.currentTime; for (let i = 0; i < 9; i++) tone(t + Math.random() * 0.12, 1500 + Math.random() * 3500, 900, 0.3 + Math.random() * 0.3, 0.07, 'sine', null, 0.5); noise(t, 0.3, 0.5, 'highpass', 3500, 1500, 0.7, null, 0.4); SF.boom(0.6); },
    artReady() { const t = ctx.currentTime; tone(t, 988, 988, 0.25, 0.16, 'triangle', null, 0.6); tone(t + 0.1, 1480, 1480, 0.5, 0.16, 'triangle', null, 0.6); },
    art() { const t = ctx.currentTime; noise(t, 0.6, 0.35, 'bandpass', 300, 3000, 1.5, null, 0.4, 0.3); tone(t, 220, 880, 0.5, 0.18, 'sawtooth', null, 0.4); },
    growl() { const t = ctx.currentTime; const o = tone(t, 62, 48, 0.5, 0.3, 'sawtooth', null, 0.3); const lf = ctx.createOscillator(), lg = ctx.createGain(); lf.frequency.value = 27; lg.gain.value = 14; lf.connect(lg); lg.connect(o.frequency); lf.start(t); lf.stop(t + 0.6); },
    click() { tone(ctx.currentTime, 880, 1100, 0.06, 0.12, 'triangle'); },
    ok() { const t = ctx.currentTime; tone(t, 784, 784, 0.1, 0.14, 'triangle'); tone(t + 0.08, 1175, 1175, 0.2, 0.14, 'triangle', null, 0.3); },
    deny() { tone(ctx.currentTime, 220, 160, 0.18, 0.14, 'square'); },
    faint() { const t = ctx.currentTime; [62, 58, 55, 50].forEach((m, i) => tone(t + i * 0.22, mf(m), mf(m), 0.5, 0.16, 'triangle', null, 0.5)); },
  };
  Au.play = function (name, a, b, c) { if (!ctx || Au.muted) return; try { SF[name](a, b, c); } catch (e) { if (window.KTdbg) window.KTdbg.errors.push('音 ' + name + ': ' + e.message); } };

  Au.onEvent = function (e, s) {
    if (!ctx || Au.muted) return;
    const h = s.hunter, m = s.mon;
    const dist = Math.hypot(h.x - m.x, h.z - m.z);
    const near = M.clamp(1.3 - dist / 30, 0.25, 1);
    switch (e.type) {
      case 'swing': Au.play('swing', e.heavy); break;
      case 'hit': Au.play('hit', e.mv, e.cls, e.crit); if (e.bounce) Au.play('bounce'); break;
      case 'dodge': Au.play('dodge'); break;
      case 'perfect': Au.play('perfect'); break;
      case 'pguard': Au.play('pguard'); break;
      case 'guard': Au.play('guard'); break;
      case 'hurt': Au.play('hurt', e.kind === 'blow'); break;
      case 'roar': Au.play('roar'); break;
      case 'footfall': Au.play('footfall', near * 0.7); break;
      case 'land': case 'slam': case 'topple': Au.play('boom', near); break;
      case 'leap': Au.play('swing', true); break;
      case 'boltFire': Au.play('zap'); break;
      case 'strikeWarn': Au.play('warn'); break;
      case 'strike': Au.play('thunder', e.nova ? 1 : 0.7); break;
      case 'chargeLv': Au.play('charge', e.lv); break;
      case 'heal': Au.play('heal'); break;
      case 'sharpen': Au.play('sharpen'); break;
      case 'buff': Au.play('heal'); break;
      case 'break': Au.play('shatter'); break;
      case 'rage': Au.play('thunder', 1); break;
      case 'artReady': Au.play('artReady'); break;
      case 'art': Au.play('art'); break;
      case 'monAtk': if (e.id !== 'roar') Au.play('growl'); break;
      case 'kill': Au.play('boom', 1); Au.play('shatter'); break;
      case 'faint': Au.play('faint'); break;
      case 'focus': Au.play(e.on ? 'art' : 'dodge'); break;
    }
  };

  // ---------- 音楽（その場で演奏する。Dマイナー、138BPM） ----------
  const MEL = [
    [62, 0, 65, 67, 69, 0, 0, 67], [65, 0, 64, 62, 64, 0, 0, 0], [62, 0, 65, 69, 72, 0, 0, 70], [69, 0, 0, 0, 0, 0, 67, 69],
    [70, 0, 69, 67, 65, 0, 67, 69], [67, 0, 65, 64, 62, 0, 0, 0], [72, 0, 70, 69, 67, 0, 69, 70], [69, 0, 0, 0, 0, 0, 0, 0],
  ];
  const CH = [[50, 62, 65, 69], [48, 60, 64, 67], [46, 58, 62, 65], [45, 57, 61, 64], [43, 58, 62, 67], [50, 62, 65, 69], [48, 60, 64, 67], [45, 57, 61, 64]];
  const TAIKO = [1, 0, 0, 0.6, 0, 0, 0.7, 0, 1, 0, 0, 0.6, 0, 0.5, 0.7, 0];
  const CAMPCH = [[50, 57, 62, 65], [46, 53, 58, 62], [41, 53, 57, 60], [48, 55, 60, 64]];
  const PENT = [62, 65, 67, 69, 72, 74];

  function taiko(t, v) { tone(t, 118, 46, 0.26, 0.85 * v, 'sine', musBus, 0.25); noise(t, 0.04, 0.4 * v, 'bandpass', 1700, 900, 1, musBus); }
  function hat(t, v) { noise(t, 0.035, 0.1 * v, 'highpass', 7000, 7000, 0.7, musBus); }
  function synth(t, midi, dur, gain, type, cut, wet, attack) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type; o2.type = type;
    o.frequency.value = mf(midi); o2.frequency.value = mf(midi) * 1.006;
    f.type = 'lowpass'; f.frequency.setValueAtTime(cut * 1.6, t); f.frequency.exponentialRampToValueAtTime(cut, t + dur); f.Q.value = 1.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + (attack || 0.02));
    g.gain.setValueAtTime(gain, t + Math.max(attack || 0.02, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(musBus);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(rev); }
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  Au.music = function (m) {
    if (m === mode) return;
    mode = m; modeBars = 0; step = 0; bar = 0;
    if (ctx) nextT = Math.max(nextT, ctx.currentTime + 0.05);
  };

  Au.tick = function () {
    if (!ctx || Au.muted || mode === 'none') return;
    if (nextT < ctx.currentTime - 0.3) nextT = ctx.currentTime + 0.05; // 止まっていたら追いつく
    const rage = mode === 'rage';
    const bpm = mode === 'camp' ? 76 : rage ? 150 : 138;
    const sd = 60 / bpm / 4;
    while (nextT < ctx.currentTime + 0.14) {
      const t = nextT, st = step % 16, b = bar % 8;
      if (mode === 'camp') {
        const ch = CAMPCH[bar % 4];
        if (st === 0) ch.forEach((n) => synth(t, n, sd * 17, 0.045, 'triangle', 900, 0.5, 0.9));
        if (st % 4 === 2 && Math.random() < 0.55) synth(t, PENT[Math.floor(Math.random() * PENT.length)] + 12, 0.5, 0.05, 'sine', 3000, 0.7, 0.01);
      } else if (mode === 'battle' || rage) {
        const tv = TAIKO[st];
        if (tv) taiko(t, tv);
        if (rage && st % 2 === 1) taiko(t, 0.25);
        if (st % 2 === 0) hat(t, st % 4 === 0 ? 0.6 : 1);
        if (rage) hat(t, 0.5);
        const ch = CH[b];
        if (st % 2 === 0) {
          const k = st / 2;
          const root = ch[0] - 12;
          const bn = k === 2 ? root + 12 : k === 6 ? root + 7 : root;
          synth(t, bn, sd * 1.8, 0.2, 'sawtooth', 360, 0, 0.01);
          if (modeBars >= 2) {
            const n = MEL[b][k];
            if (n) {
              let len = 1;
              while (k + len < 8 && MEL[b][k + len] === 0) len++;
              synth(t, n + (rage ? 12 : 0), sd * 2 * len * 0.95, 0.085, 'sawtooth', 1150, 0.45, 0.04);
              synth(t, n - 12, sd * 2 * len * 0.95, 0.05, 'square', 700, 0.3, 0.05);
            }
          }
        }
        if (st === 0 || st === 6 || (rage && st === 12)) ch.slice(1).forEach((n) => synth(t, n, sd * 3, 0.04, 'sawtooth', 1500, 0.35, 0.01));
      } else if (mode === 'clear') {
        const seq = [[62, 66, 69], 0, [62, 66, 69], [62, 66, 69], [67, 71, 74], 0, [69, 73, 76], 0, [74, 78, 81], 0, 0, 0, 0, 0, 0, 0];
        if (modeBars === 0) {
          const c = seq[st];
          if (c) c.forEach((n) => { synth(t, n, st === 8 ? 1.8 : sd * 3, 0.07, 'sawtooth', 1800, 0.5, 0.02); synth(t, n - 12, st === 8 ? 1.8 : sd * 3, 0.05, 'square', 900, 0.3, 0.02); });
          if (st === 0 || st === 4 || st === 6 || st === 8) taiko(t, 1);
        }
      } else if (mode === 'fail') {
        const seq = [62, 0, 0, 0, 60, 0, 0, 0, 58, 0, 0, 0, 57, 0, 0, 0];
        if (modeBars === 0 && seq[st]) synth(t, seq[st], sd * 5, 0.09, 'triangle', 800, 0.6, 0.05);
      }
      nextT += sd;
      step++;
      if (step % 16 === 0) { bar++; modeBars++; }
    }
  };
})();
