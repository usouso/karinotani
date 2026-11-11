// 狩りの谷 — 狩りのルール（画面なしで動く。60分の1秒ごとに1歩。乱数は seed で固定）
(function () {
  'use strict';
  const KT = globalThis.KT || (globalThis.KT = {});
  const M = KT.M, V = M.V, D = KT.Data;
  const S = (KT.Sim = {});
  const DT = (S.DT = 1 / 60);
  const A = M.DEG;
  const tr = M.tr;

  // ---------------- 世界 ----------------
  const W = (KT.World = { R: 44, camp: [0, -36] });
  // 地面の高さ。狩り場は雨夜の都市の交差点なので、平ら（2026-11-11 に「谷」の起伏から変えた）
  W.height = function (x, z) { return 0; };

  // ---------------- 武器の動き（キーフレーム） ----------------
  function sampK(keys, t, n) {
    if (t <= keys[0][0]) return keys[0].slice(1, n + 1);
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const a = keys[i - 1], b = keys[i];
        let u = (t - a[0]) / (b[0] - a[0]);
        const ez = b[n + 1];
        u = ez === 'in' ? u * u : ez === 'lin' ? u : ez === 'out' ? 1 - (1 - u) * (1 - u) : u * u * (3 - 2 * u);
        const o = new Array(n);
        for (let k = 0; k < n; k++) o[k] = a[k + 1] + (b[k + 1] - a[k + 1]) * u;
        return o;
      }
    }
    return keys[keys.length - 1].slice(1, n + 1);
  }

  // 大剣: [t, psi, e, gx, gy, gz]
  const GS_IDLE = [160, -20, 0.3, 0.95, 0.05];
  const GS_RUN = [158, 32, 0.25, 1.42, -0.02];
  const GSP = {
    charge: [150, 15, 0.3, 1.3, 0.0],
    guard: [-80, 18, 0.38, 1.15, 0.45],
    dodge: [150, 10, 0.25, 1.1, 0.0],
    item: [95, -65, 0.5, 0.95, 0.05],
    flinch: [60, -20, 0.35, 1.0, 0.2],
    blown: [90, 0, 0.5, 0.6, 0.0],
    roarstun: [100, -50, 0.5, 0.9, 0.0],
    bounce: [20, 100, 0.2, 1.5, 0.0],
    dead: [90, -10, 0.6, 0.3, 0.0],
  };
  // 双剣: [t, psiR, eR, psiL, eL]
  const DB_IDLE = [35, -45, -35, -45];
  const DB_RUN = [160, -15, -160, -15];
  const DBP = {
    dodge: [150, -20, -150, -20],
    item: [80, -70, -80, -70],
    flinch: [70, 10, -70, 10],
    blown: [100, 20, -100, 20],
    roarstun: [60, -60, -60, -60],
    bounce: [30, 80, -30, 80],
    dead: [90, -10, -90, -10],
    guard: [35, -45, -35, -45],
    charge: [35, -45, -35, -45],
  };

  const MOVES = (S.MOVES = {
    // ---- 大剣 ----
    gs1: {
      w: 'gs', dur: 1.0, cancel: 0.6, adv: [0.9, 0.2, 0.5], next: 'gs2', nextH: 'charge',
      hits: [{ t0: 0.34, t1: 0.5, mv: 48, b: 0 }],
      keys: [[0, ...GS_IDLE], [0.32, 0, 150, 0.12, 1.5, 0.05], [0.5, 0, -32, 0.05, 0.95, 0.5, 'in'], [0.72, 0, -32, 0.05, 0.95, 0.5], [1.0, ...GS_IDLE]],
    },
    gs2: {
      w: 'gs', dur: 0.95, cancel: 0.58, adv: [0.6, 0.15, 0.45], next: 'gs3', nextH: 'charge',
      hits: [{ t0: 0.32, t1: 0.47, mv: 36, b: 0 }],
      keys: [[0, 60, 10, 0.2, 1.15, 0.3], [0.3, 125, 12, 0.25, 1.2, 0.15], [0.47, -115, -8, -0.1, 1.1, 0.35, 'in'], [0.65, -115, -8, -0.1, 1.1, 0.35], [0.95, ...GS_IDLE]],
    },
    gs3: {
      w: 'gs', dur: 1.0, cancel: 0.6, adv: [0.6, 0.15, 0.45], next: 'gs1', nextH: 'charge',
      hits: [{ t0: 0.32, t1: 0.48, mv: 44, b: 0 }],
      keys: [[0, -40, -20, 0.0, 1.0, 0.4], [0.3, -85, -40, -0.15, 0.95, 0.3], [0.48, 25, 82, 0.15, 1.5, 0.3, 'in'], [0.68, 25, 82, 0.15, 1.5, 0.3], [1.0, ...GS_IDLE]],
    },
    gsC: {
      w: 'gs', dur: 1.15, cancel: 0.7, adv: [1.2, 0.04, 0.28], next: 'gs2', nextH: 'charge', heavy: true,
      hits: [{ t0: 0.14, t1: 0.3, mv: 60, b: 0 }], // mv はため段階で差し替える
      keys: [[0, 0, 160, 0.15, 1.5, 0.0], [0.12, 0, 165, 0.12, 1.55, 0.0], [0.3, 0, -35, 0.05, 0.9, 0.55, 'in'], [0.65, 0, -35, 0.05, 0.9, 0.55], [1.15, ...GS_IDLE]],
    },
    gsA: {
      w: 'gs', dur: 2.5, cancel: 2.0, adv: [4.5, 0.5, 1.38], art: true, heavy: true, inv: [0.3, 1.45],
      hits: [{ t0: 1.2, t1: 1.42, mv: 150, b: 0 }],
      aoe: { t: 1.38, r: 3.8, f: 2.2, mv: 110 },
      yoff: (t) => { const u = tr(t, 0.5, 1.38); return 3.0 * 4 * u * (1 - u); },
      keys: [[0, ...GS_IDLE], [0.45, 160, -10, 0.3, 1.0, -0.1], [1.15, 0, 140, 0.1, 1.6, 0.0], [1.38, 0, -40, 0.05, 0.85, 0.55, 'in'], [1.9, 0, -40, 0.05, 0.85, 0.55], [2.5, ...GS_IDLE]],
    },
    // ---- 双剣 ----
    db1: {
      w: 'db', dur: 0.46, cancel: 0.3, adv: [0.5, 0.05, 0.3], next: 'db2', nextH: 'dbH',
      hits: [{ t0: 0.07, t1: 0.19, mv: 10, b: 0 }, { t0: 0.19, t1: 0.31, mv: 10, b: 1 }],
      keys: [[0, 90, 55, -60, 20], [0.07, 95, 60, -90, 55], [0.19, -55, -35, -95, 60, 'in'], [0.31, -55, -35, 55, -35, 'in'], [0.46, ...DB_IDLE]],
    },
    db2: {
      w: 'db', dur: 0.46, cancel: 0.3, adv: [0.4, 0.05, 0.3], next: 'db3', nextH: 'dbH',
      hits: [{ t0: 0.08, t1: 0.2, mv: 11, b: 0 }, { t0: 0.14, t1: 0.26, mv: 11, b: 1 }],
      keys: [[0, 110, 5, 40, 5], [0.08, 115, 5, 45, 5], [0.2, -50, 0, -20, 0, 'in'], [0.26, -50, 0, -125, -5, 'lin'], [0.46, ...DB_IDLE]],
    },
    db3: {
      w: 'db', dur: 0.46, cancel: 0.3, adv: [0.4, 0.05, 0.3], next: 'db4', nextH: 'dbH',
      hits: [{ t0: 0.08, t1: 0.2, mv: 12, b: 0 }, { t0: 0.1, t1: 0.22, mv: 12, b: 1 }],
      keys: [[0, 40, -60, -40, -60], [0.08, 45, -65, -45, -65], [0.21, -15, 75, 15, 75, 'in'], [0.46, ...DB_IDLE]],
    },
    db4: {
      w: 'db', dur: 0.95, cancel: 0.72, adv: [0.8, 0.1, 0.7], next: 'db1', nextH: 'dbH', spin: true,
      hits: [
        { t0: 0.12, t1: 0.3, mv: 9, b: 0 }, { t0: 0.2, t1: 0.38, mv: 9, b: 1 },
        { t0: 0.4, t1: 0.58, mv: 9, b: 0 }, { t0: 0.48, t1: 0.66, mv: 9, b: 1 }, { t0: 0.6, t1: 0.74, mv: 18, b: 0 },
      ],
    },
    dbH: {
      w: 'db', dur: 0.7, cancel: 0.46, adv: [4.6, 0.08, 0.4], next: 'db2', nextH: null, heavy: true,
      hits: [{ t0: 0.1, t1: 0.22, mv: 12, b: 0 }, { t0: 0.2, t1: 0.32, mv: 12, b: 1 }, { t0: 0.3, t1: 0.42, mv: 12, b: 0 }],
      keys: [[0, 75, 5, -75, 5], [0.4, 60, -5, -60, -5], [0.52, 30, -15, -30, -15], [0.7, ...DB_IDLE]],
    },
    dbA: {
      w: 'db', dur: 2.5, cancel: 2.35, adv: [0.6, 0.2, 1.9], art: true, heavy: true, inv: [0, 0.6],
      hits: (function () {
        const a = [];
        for (let i = 0; i < 12; i++) a.push({ t0: 0.25 + i * 0.137, t1: 0.25 + (i + 1) * 0.137, mv: 10, b: i % 2 });
        a.push({ t0: 2.08, t1: 2.26, mv: 42, b: 0 }, { t0: 2.1, t1: 2.28, mv: 42, b: 1 });
        return a;
      })(),
    },
  });
  for (const k in MOVES) MOVES[k].id = k;

  // ハンターの体から見た武器の姿勢（psi/e/握りの位置）。当たり判定と絵の両方がこれを使う
  function rawWeaponPose(h) {
    const st = h.state;
    if (h.weapon === 'gs') {
      let p;
      if (st === 'atk') {
        p = sampK(h.move.keys, h.mt, 5);
      } else if (st === 'charge') {
        p = GSP.charge.slice();
        const sh = Math.sin(h.t * 50) * (0.5 + h.chargeLv);
        p[0] += sh; p[1] += sh * 0.6;
      } else if (GSP[st]) {
        p = GSP[st];
      } else if (st === 'guardhit') {
        p = GSP.guard;
      } else if (st === 'down' || st === 'getup') {
        p = GSP.blown;
      } else {
        const b = h.runBlend;
        p = [0, 0, 0, 0, 0];
        for (let i = 0; i < 5; i++) p[i] = M.lerp(GS_IDLE[i], GS_RUN[i], b);
      }
      return [p];
    }
    // 双剣
    let q;
    if (st === 'atk') {
      const mv = h.move, t = h.mt;
      if (mv.id === 'db4') {
        const spin = 720 * M.ease.inOut(tr(t, 0.1, 0.72));
        q = [90 + spin, 5, -90 + spin, 5];
        if (t > 0.74) {
          const u = M.ease.inOut(tr(t, 0.74, 0.95));
          q = [M.lerp(90, DB_IDLE[0], u), M.lerp(5, DB_IDLE[1], u), M.lerp(-90, DB_IDLE[2], u), M.lerp(5, DB_IDLE[3], u)];
        }
      } else if (mv.id === 'dbA') {
        if (t < 1.95) {
          const ph = Math.PI * 2 * 3.65 * (t - 0.25);
          const u = tr(t, 0.1, 0.25);
          q = [20 + 75 * Math.sin(ph) * u, 45 * Math.cos(ph) * u, -20 + 75 * Math.sin(ph) * u, -45 * Math.cos(ph) * u];
        } else {
          q = sampK([[1.95, 20, 0, -20, 0], [2.08, 45, 80, -45, 80], [2.26, -35, -40, 35, -40, 'in'], [2.38, -35, -40, 35, -40], [2.5, ...DB_IDLE]], t, 4);
        }
      } else {
        q = sampK(mv.keys, t, 4);
      }
    } else if (DBP[st]) {
      q = DBP[st];
    } else if (st === 'down' || st === 'getup' || st === 'guardhit') {
      q = DBP.blown;
    } else {
      const b = h.runBlend;
      q = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) q[i] = M.lerp(DB_IDLE[i], DB_RUN[i], b);
    }
    const out = [];
    for (let i = 0; i < 2; i++) {
      const psi = q[i * 2], e = q[i * 2 + 1];
      const d = V.dir(psi * A, e * A);
      const sx = i === 0 ? 0.24 : -0.24;
      const a = V.norm([d[0], d[1], d[2] + 0.35]);
      out.push([psi, e, sx + a[0] * 0.55, 1.38 + a[1] * 0.55, 0.05 + a[2] * 0.55]);
    }
    return out;
  }

  function updateWeaponPose(h, dt) {
    const raw = rawWeaponPose(h);
    if (!h.wp || h.wp.length !== raw.length) { h.wp = raw.map((p) => p.slice()); h.wpFrom = null; }
    if (h.wpFrom) {
      h.wpBlend += dt;
      const u = M.smooth(0, 0.1, h.wpBlend);
      for (let i = 0; i < raw.length; i++) {
        const f = h.wpFrom[i], r = raw[i], o = h.wp[i];
        o[0] = f[0] + M.wrapPi((r[0] - f[0]) * A) / A * u;
        for (let k = 1; k < 5; k++) o[k] = f[k] + (r[k] - f[k]) * u;
      }
      if (u >= 1) h.wpFrom = null;
    } else {
      for (let i = 0; i < raw.length; i++) for (let k = 0; k < 5; k++) h.wp[i][k] = raw[i][k];
    }
  }
  function poseBreak(h) {
    if (h.wp) { h.wpFrom = h.wp.map((p) => p.slice()); h.wpBlend = 0; }
  }

  // 世界座標での刃（握りの位置 g、向き d、長さ len）
  S.hunterBlades = function (h) {
    const wd = D.weapons[h.weapon];
    const out = [];
    const spin = h.spin || 0;
    for (let i = 0; i < h.wp.length; i++) {
      const p = h.wp[i];
      const dl = V.dir(p[0] * A, p[1] * A);
      const gl = [p[2], p[3], p[4]];
      const yaw = h.yaw;
      let g = V.rotY(gl, yaw + (h.weapon === 'db' ? spin : 0));
      const d = V.rotY(dl, yaw);
      g = [h.x + g[0], h.y + h.yOff + g[1], h.z + g[2]];
      out.push({ g, d, len: wd.len });
    }
    return out;
  };

  // ---------------- ハンター ----------------
  function mkHunter(cfg) {
    const wd = D.weapons[cfg.weapon], wl = wd.levels[cfg.wlv || 0];
    return {
      x: W.camp[0], z: W.camp[1], y: 0, yaw: 0, yOff: 0, vx: 0, vz: 0, spin: 0,
      hp: 100, hpMax: 100, red: 100, st: 100, stMax: 100, stDelay: 0,
      weapon: cfg.weapon, wlv: cfg.wlv || 0, atk: wl.atk, aff: wl.aff, top: wl.top,
      sharp: wd.sharpMax, sharpMax: wd.sharpMax, def: D.armor[cfg.alv || 0].def,
      state: 'idle', t: 0, mt: 0, move: null, hitReg: null, counter: false,
      charge: 0, chargeLv: 0, inv: 0, armor: false, perfDone: false, perfectT: 0, focus: false, art: 0, buffT: 0,
      items: [{ id: 'potion', n: 10 }, { id: 'whet', n: -1 }, { id: 'power', n: 2 }], itemSel: 0, itemDone: false,
      faints: 0, buf: { atk: 0, heavy: 0, dodge: 0, art: 0, item: 0 }, prev: {},
      runBlend: 0, sprinting: false, dodgeDir: 0, dodgeDur: 0.6, guardT: 0, kbx: 0, kbz: 0, wp: null, wpFrom: null, wpBlend: 0,
    };
  }

  function sharpTier(h) {
    const r = h.sharp / h.sharpMax;
    if (r > 0.55) return h.top;
    if (r > 0.3) return Math.min(h.top + 1, 3);
    if (r > 0.12) return 3;
    return 4;
  }
  S.sharpTier = sharpTier;

  function setState(h, st) {
    poseBreak(h);
    h.state = st;
    h.t = 0;
    h.armor = false;
    if (st !== 'atk') { h.move = null; h.spin = 0; h.yOff = st === 'blown' ? h.yOff : 0; }
  }

  function startMove(s, h, id, opt) {
    const mv = MOVES[id];
    poseBreak(h);
    h.state = 'atk';
    h.t = 0;
    h.mt = 0;
    h.move = mv;
    h.hitReg = {};
    h.aoeDone = false;
    h.swung = false;
    h.mvMul = 1;
    h.counter = h.perfectT > 0;
    h.perfectT = 0;
    h.armor = !!mv.art;
    if (opt && opt.mul) h.mvMul = opt.mul;
    if (mv.art) { h.art = 0; s.events.push({ type: 'art', w: h.weapon }); }
  }

  function tryFreeActions(s, h, inp, mag, dirAng) {
    const b = h.buf;
    if (b.art > 0 && h.art >= 100) { b.art = 0; startMove(s, h, h.weapon === 'gs' ? 'gsA' : 'dbA'); return true; }
    if (b.dodge > 0 && h.st > 0) { b.dodge = 0; startDodge(s, h, mag, dirAng); return true; }
    if (b.atk > 0) { b.atk = 0; if (mag > 0.2) h.yaw = dirAng; startMove(s, h, h.weapon === 'gs' ? 'gs1' : 'db1'); return true; }
    if (b.heavy > 0) {
      b.heavy = 0;
      if (mag > 0.2) h.yaw = dirAng;
      if (h.weapon === 'gs') {
        if (h.perfectT > 0) { startMove(s, h, 'gsC'); h.chargeLv = 2; h.mvMul = 90 / 60; }
        else { setState(h, 'charge'); h.charge = 0; h.chargeLv = 0; }
      } else startMove(s, h, 'dbH');
      return true;
    }
    if (b.item > 0) {
      b.item = 0;
      const it = h.items[h.itemSel];
      if (it.n !== 0) { setState(h, 'item'); h.itemDone = false; return true; }
    }
    return false;
  }

  function startDodge(s, h, mag, dirAng) {
    const db = h.weapon === 'db';
    h.st -= db ? 18 : 22;
    h.stDelay = 0.7;
    if (mag > 0.2) h.yaw = dirAng;
    setState(h, 'dodge');
    h.dodgeDur = db ? (h.focus ? 0.42 : 0.52) : 0.62;
    h.inv = Math.max(h.inv, db && h.focus ? 0.34 : 0.3);
    h.perfDone = false;
    s.events.push({ type: 'dodge' });
  }

  function hunterStep(s, inp, dt) {
    const h = s.hunter;
    const pr = h.prev;
    const keys = ['atk', 'heavy', 'dodge', 'art', 'item'];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (inp[k] && !pr[k]) h.buf[k] = 0.3;
      else h.buf[k] = Math.max(0, h.buf[k] - dt);
    }
    if (inp.itemNext && !pr.itemNext) h.itemSel = (h.itemSel + 1) % h.items.length;
    if (inp.itemPrev && !pr.itemPrev) h.itemSel = (h.itemSel + h.items.length - 1) % h.items.length;
    const guardPressed = inp.guard && !pr.guard;
    h.prev = { atk: inp.atk, heavy: inp.heavy, dodge: inp.dodge, art: inp.art, item: inp.item, itemNext: inp.itemNext, itemPrev: inp.itemPrev, guard: inp.guard };

    const ox = h.x, oz = h.z;
    h.t += dt;
    h.inv = Math.max(0, h.inv - dt);
    h.perfectT = Math.max(0, h.perfectT - dt);
    h.buffT = Math.max(0, h.buffT - dt);
    h.stDelay = Math.max(0, h.stDelay - dt);
    if (h.hp < h.red && h.state !== 'dead') h.hp = Math.min(h.red, h.hp + 0.9 * dt);

    let mx = inp.mx || 0, mz = inp.mz || 0;
    let mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; mag = 1; }
    const dirAng = Math.atan2(mx, mz);
    const wd = D.weapons[h.weapon];
    const st = h.state;
    let regen = 0;
    h.sprinting = false;

    if (st === 'idle') {
      if (!tryFreeActions(s, h, inp, mag, dirAng)) {
        if (inp.guard && h.weapon === 'gs') { setState(h, 'guard'); h.guardT = 0; }
        else {
          if (guardPressed && h.weapon === 'db') {
            if (h.focus) { h.focus = false; s.events.push({ type: 'focus', on: false }); }
            else if (h.st > 20) { h.focus = true; s.events.push({ type: 'focus', on: true }); }
          }
          if (mag > 0.1) {
            const sprint = inp.sprint && h.st > 0 && mag > 0.5;
            const spd = (sprint ? wd.sprint : wd.run) * M.clamp(mag, 0.35, 1);
            h.yaw = M.angApproach(h.yaw, dirAng, 12 * dt);
            h.x += Math.sin(dirAng) * spd * dt;
            h.z += Math.cos(dirAng) * spd * dt;
            if (sprint) { h.st -= 8 * dt; h.sprinting = true; h.stDelay = 0.3; if (h.st <= 0) { h.st = 0; h.stDelay = 1.2; } }
            else regen = 25;
          } else regen = 25;
        }
      }
    } else if (st === 'dodge') {
      const u = h.t / h.dodgeDur;
      const dist = h.weapon === 'db' ? (h.focus ? 4.4 : 4.0) : 4.2;
      const v = (dist / h.dodgeDur) * 1.6 * (1 - 0.75 * u);
      h.x += Math.sin(h.yaw) * v * dt;
      h.z += Math.cos(h.yaw) * v * dt;
      if (u >= 1) setState(h, 'idle');
    } else if (st === 'atk') {
      const mv = h.move;
      const ts = h.weapon === 'db' && h.focus && !mv.art ? 1.2 : 1;
      const t0 = h.mt;
      h.mt += dt * ts;
      const t = h.mt;
      if (t < 0.18 && mag > 0.2) h.yaw = M.angApproach(h.yaw, dirAng, 9 * dt);
      if (mv.adv && t > mv.adv[1] && t0 < mv.adv[2]) {
        const v = mv.adv[0] / (mv.adv[2] - mv.adv[1]);
        h.x += Math.sin(h.yaw) * v * dt * ts;
        h.z += Math.cos(h.yaw) * v * dt * ts;
      }
      if (mv.inv && t >= mv.inv[0] && t <= mv.inv[1]) h.inv = Math.max(h.inv, 0.05);
      h.yOff = mv.yoff ? mv.yoff(t) : 0;
      h.spin = mv.spin ? Math.PI * 4 * M.ease.inOut(tr(t, 0.1, 0.72)) : 0;
      if (!h.swung && t >= mv.hits[0].t0 - 0.03) { h.swung = true; s.events.push({ type: 'swing', heavy: !!mv.heavy || h.weapon === 'gs' }); }
      regen = 8;
      // 当たり判定は weaponPose 更新後（step の最後）に行う
      if (t >= mv.cancel) {
        const b = h.buf;
        if (b.art > 0 && h.art >= 100) { b.art = 0; startMove(s, h, h.weapon === 'gs' ? 'gsA' : 'dbA'); }
        else if (b.dodge > 0 && h.st > 0) { b.dodge = 0; startDodge(s, h, mag, dirAng); }
        else if (b.atk > 0 && mv.next) { b.atk = 0; if (mag > 0.2) h.yaw = M.angApproach(h.yaw, dirAng, 1.2); startMove(s, h, mv.next); }
        else if (b.heavy > 0 && mv.nextH) {
          b.heavy = 0;
          if (mv.nextH === 'charge') { setState(h, 'charge'); h.charge = 0; h.chargeLv = 0; }
          else startMove(s, h, mv.nextH);
        }
      }
      if (h.state === 'atk' && h.move === mv && t >= mv.dur) setState(h, 'idle');
    } else if (st === 'charge') {
      h.charge += dt;
      const lv = h.charge >= 1.9 ? 3 : h.charge >= 1.2 ? 2 : h.charge >= 0.55 ? 1 : 0;
      if (lv > h.chargeLv) { h.chargeLv = lv; s.events.push({ type: 'chargeLv', lv }); }
      if (mag > 0.2) h.yaw = M.angApproach(h.yaw, dirAng, 3.2 * dt);
      if (h.buf.dodge > 0 && h.st > 0) { h.buf.dodge = 0; startDodge(s, h, mag, dirAng); }
      else if (!inp.heavy || h.charge > 2.9) {
        const lvl = h.chargeLv;
        startMove(s, h, 'gsC');
        h.chargeLv = lvl;
        h.mvMul = [55, 72, 95, 132][lvl] / 60;
      }
    } else if (st === 'guard') {
      h.guardT += dt;
      if (mag > 0.2) h.yaw = M.angApproach(h.yaw, dirAng, 4 * dt);
      if (h.buf.dodge > 0 && h.st > 0) { h.buf.dodge = 0; startDodge(s, h, mag, dirAng); }
      else if (h.buf.atk > 0) { h.buf.atk = 0; startMove(s, h, 'gs2'); }
      else if (h.buf.heavy > 0 && h.perfectT > 0) { h.buf.heavy = 0; startMove(s, h, 'gsC'); h.chargeLv = 2; h.mvMul = 95 / 60; }
      else if (!inp.guard) setState(h, 'idle');
      regen = 6;
    } else if (st === 'guardhit') {
      h.x += h.kbx * dt; h.z += h.kbz * dt;
      h.kbx *= 0.86; h.kbz *= 0.86;
      if (h.t >= 0.35) { if (inp.guard) { setState(h, 'guard'); h.guardT = 1; } else setState(h, 'idle'); }
    } else if (st === 'flinch' || st === 'bounce') {
      h.x += h.kbx * dt; h.z += h.kbz * dt;
      h.kbx *= 0.88; h.kbz *= 0.88;
      if (h.t >= 0.55) setState(h, 'idle');
    } else if (st === 'blown') {
      const u = h.t / 0.9;
      h.x += h.kbx * dt; h.z += h.kbz * dt;
      h.yOff = 1.4 * 4 * u * (1 - u);
      h.inv = Math.max(h.inv, 0.1);
      if (u >= 1) { h.yOff = 0; setState(h, 'down'); }
    } else if (st === 'down') {
      h.x += h.kbx * dt; h.z += h.kbz * dt;
      h.kbx *= 0.8; h.kbz *= 0.8;
      h.inv = Math.max(h.inv, 0.1);
      if (h.t >= 0.45) setState(h, 'getup');
    } else if (st === 'getup') {
      h.inv = Math.max(h.inv, 0.1);
      if (h.t >= 0.5) { h.inv = 0.7; setState(h, 'idle'); }
    } else if (st === 'roarstun') {
      if (h.t >= 1.3) setState(h, 'idle');
    } else if (st === 'item') {
      const it = h.items[h.itemSel], def = D.items[it.id];
      if (!h.itemDone && h.t >= def.at) {
        h.itemDone = true;
        if (it.n > 0) it.n--;
        if (it.id === 'potion') { h.hp = Math.min(h.hpMax, h.hp + 45); h.red = Math.max(h.red, h.hp); s.events.push({ type: 'heal' }); }
        else if (it.id === 'whet') { h.sharp = h.sharpMax; s.events.push({ type: 'sharpen' }); }
        else if (it.id === 'power') { h.buffT = 150; s.events.push({ type: 'buff' }); }
      }
      if (h.buf.dodge > 0 && h.st > 0 && h.t > 0.15) { h.buf.dodge = 0; startDodge(s, h, mag, dirAng); }
      else if (h.t >= def.dur) setState(h, 'idle');
      regen = 15;
    }

    if (h.focus) {
      h.st -= 5 * dt;
      regen = 0;
      if (h.st <= 0) { h.st = 0; h.focus = false; h.stDelay = 1.0; s.events.push({ type: 'focus', on: false }); }
    }
    if (regen > 0 && h.stDelay <= 0) h.st = Math.min(h.stMax, h.st + regen * dt);
    if (h.st < 0) h.st = 0;
    if (h.art >= 100 && !h.artReady) { h.artReady = true; s.events.push({ type: 'artReady' }); }
    if (h.art < 100) h.artReady = false;

    const moving = (h.state === 'idle' && mag > 0.1) ? 1 : 0;
    h.runBlend = M.approach(h.runBlend, moving, dt * 5);

    // モンスターの体に押し出される
    const m = s.mon;
    if (m.p.yOff < 1.2 && h.yOff < 1.5 && m.state !== 'dead') {
      const ps = s.pose;
      const cores = [[ps.chest, 1.15], [ps.belly, 1.25], [ps.hips, 1.15], [ps.neck, 0.7]];
      for (let i = 0; i < 4; i++) {
        const c = cores[i][0], rr = cores[i][1] + 0.35;
        const dx = h.x - c[0], dz = h.z - c[2];
        const d = Math.hypot(dx, dz);
        if (d < rr && d > 1e-4) { h.x = c[0] + (dx / d) * rr; h.z = c[2] + (dz / d) * rr; }
      }
    }
    const r = Math.hypot(h.x, h.z);
    if (r > W.R - 0.6) { h.x *= (W.R - 0.6) / r; h.z *= (W.R - 0.6) / r; }
    h.y = W.height(h.x, h.z);
    h.vx = (h.x - ox) / dt;
    h.vz = (h.z - oz) / dt;
    updateWeaponPose(h, dt);
  }

  // ハンターの攻撃 → モンスター
  function hunterHits(s) {
    const h = s.hunter, m = s.mon;
    if (h.state !== 'atk' || m.state === 'dead') return;
    const mv = h.move, t = h.mt;
    const wd = D.weapons[h.weapon];
    let blades = null, spheres = null;
    for (let i = 0; i < mv.hits.length; i++) {
      const hw = mv.hits[i];
      if (h.hitReg[i] || t < hw.t0 || t > hw.t1) continue;
      if (!blades) { blades = S.hunterBlades(h); spheres = S.monSpheres(s); }
      const bl = blades[hw.b] || blades[0];
      let best = null, bestPen = 0, bx = 0, by = 0, bz = 0;
      for (let k = 0; k < 3; k++) {
        const f = k === 0 ? 0.35 : k === 1 ? 0.68 : 1.0;
        const px = bl.g[0] + bl.d[0] * bl.len * f, py = bl.g[1] + bl.d[1] * bl.len * f, pz = bl.g[2] + bl.d[2] * bl.len * f;
        for (let j = 0; j < spheres.length; j++) {
          const sp = spheres[j];
          const d = Math.hypot(px - sp.x, py - sp.y, pz - sp.z);
          const pen = sp.r + wd.rad - d;
          if (pen > bestPen) { bestPen = pen; best = sp; bx = px; by = py; bz = pz; }
        }
      }
      if (best) {
        h.hitReg[i] = true;
        const dx = best.x - bx, dy = best.y - by, dz = best.z - bz;
        const dl = Math.hypot(dx, dy, dz) || 1;
        const k = Math.max(0, dl - best.r) / dl;
        hitMonster(s, best.part, hw.mv * h.mvMul, [bx + dx * k, by + dy * k, bz + dz * k], mv);
        if (h.state !== 'atk') return;
      }
    }
    if (mv.aoe && !h.aoeDone && t >= mv.aoe.t) {
      h.aoeDone = true;
      const cx = h.x + Math.sin(h.yaw) * mv.aoe.f, cz = h.z + Math.cos(h.yaw) * mv.aoe.f;
      s.events.push({ type: 'slam', x: cx, z: cz, r: mv.aoe.r, big: true });
      const sp = S.monSpheres(s);
      let best = null, bd = 1e9;
      for (let j = 0; j < sp.length; j++) {
        const d = Math.hypot(sp[j].x - cx, sp[j].z - cz) - sp[j].r;
        if (d < mv.aoe.r && d < bd && sp[j].y < 4.5 + h.y) { bd = d; best = sp[j]; }
      }
      if (best) hitMonster(s, best.part, mv.aoe.mv, [best.x, best.y, best.z], mv);
    }
  }

  function hitzone(m, part) {
    if (part === 'head') return m.parts.head.broken ? 1.4 : 1.25;
    if (part === 'back') return m.parts.back.broken ? 0.9 : m.rage.on ? 1.25 : 0.45;
    if (part === 'leg') return 0.85;
    if (part === 'tail') return 1.0;
    return 0.7;
  }
  S.hitzone = hitzone;

  function hitMonster(s, part, mvv, pos, mv) {
    const h = s.hunter, m = s.mon;
    const tier = sharpTier(h);
    const sm = D.sharpMods[tier];
    const hz = hitzone(m, part);
    let raw = h.atk * (mvv / 100) * sm;
    if (h.buffT > 0) raw *= 1.1;
    if (h.counter) raw *= 1.4;
    if (h.weapon === 'db' && h.focus) raw *= 1.15;
    const crit = s.rng.next() < h.aff;
    if (crit) raw *= 1.25;
    const dmg = Math.max(1, Math.round(raw * hz));
    const bounce = sm * hz < 0.5 && !mv.art && !h.counter;
    h.sharp = Math.max(0, h.sharp - (bounce ? 2 : 1));
    h.art = Math.min(100, h.art + mvv * (h.weapon === "db" ? 0.1 : 0.07));
    s.stats.dmg += dmg;
    s.stats.hits++;
    s.events.push({ type: 'hit', x: pos[0], y: pos[1], z: pos[2], dmg, cls: hz >= 1.2 ? 2 : hz <= 0.5 ? 0 : 1, crit, mv: mvv, part, bounce });
    s.hitstop = Math.max(s.hitstop, M.clamp(Math.round(mvv * 0.1), 1, 12));
    if (bounce) {
      setState(h, 'bounce');
      h.kbx = -Math.sin(h.yaw) * 2; h.kbz = -Math.cos(h.yaw) * 2;
    }
    damageMonster(s, part, dmg);
  }

  function damageMonster(s, part, dmg) {
    const m = s.mon, R = s.rank;
    if (m.state === 'dead') return;
    if (!m.aware) { m.aware = true; m.pendingRoar = true; if (m.state === 'graze') enterStalk(s, m, 0.1); }
    m.hp -= dmg;
    if (m.hp <= 0) {
      m.hp = 0;
      m.state = 'dead';
      m.t = 0;
      m.downSide = s.rng.next() < 0.5 ? 1 : -1;
      s.result = 'clear';
      s.endT = 0;
      s.slow = 70;
      s.stats.time = s.t;
      s.stats.faints = s.hunter.faints;
      s.events.push({ type: 'kill' });
      return;
    }
    const P = m.parts;
    const air = m.state === 'atk' && m.p.yOff > 0.4;
    let react = null;
    if (part === 'head') {
      P.head.acc += dmg; P.head.fl += dmg;
      if (!P.head.broken && P.head.acc >= 700 * R.part) { P.head.broken = true; s.stats.breaks.head = true; s.events.push({ type: 'break', part: 'head' }); react = 'big'; }
      else if (P.head.fl >= 320 * R.part) { P.head.fl = 0; react = 'small'; }
    } else if (part === 'back') {
      P.back.acc += dmg;
      if (!P.back.broken && P.back.acc >= 560 * R.part) {
        P.back.broken = true; s.stats.breaks.back = true; s.events.push({ type: 'break', part: 'back' }); react = 'down';
        if (m.rage.on) { m.rage.on = false; m.rage.t = 0; m.tiredT = 12; s.events.push({ type: 'calm' }); }
      }
    } else if (part === 'tail') {
      P.tail.acc += dmg;
      if (!P.tail.cut && P.tail.acc >= 780 * R.part) {
        P.tail.cut = true; s.stats.breaks.tail = true;
        const tp = s.pose.tail[4];
        s.events.push({ type: 'tailcut', x: tp[0], y: tp[1], z: tp[2], yaw: m.yaw });
        s.events.push({ type: 'break', part: 'tail' });
        react = 'big';
      }
    } else if (part === 'leg') {
      P.leg.acc += dmg;
      if (P.leg.acc >= P.leg.need) { P.leg.acc = 0; P.leg.need *= 1.3; react = 'down'; }
    } else {
      P.body.fl += dmg;
      if (P.body.fl >= 600 * R.part) { P.body.fl = 0; react = 'small'; }
    }
    if (!m.rage.on && m.tiredT <= 0) {
      m.rage.meter += dmg;
      if (m.rage.meter >= m.hpMax * 0.2) { m.rage.meter = 0; m.pendingRage = true; }
    }
    if (react && !air && m.state !== 'down') {
      if (react === 'down') {
        m.state = 'down'; m.t = 0; m.downDur = 5.2; m.downSide = s.rng.next() < 0.5 ? 1 : -1;
        s.events.push({ type: 'topple' });
      } else {
        m.state = 'flinch'; m.t = 0; m.flDur = react === 'big' ? 1.7 : 0.9;
        s.events.push({ type: 'flinch', big: react === 'big' });
      }
      m.hitDone = true;
    }
  }

  // モンスターの攻撃 → ハンター。戻り値: 'hit' | 'guard' | 'dodge' | 'miss'
  function hurtHunter(s, dmg, kind, sx, sz) {
    const h = s.hunter;
    if (h.state === 'dead' || s.result) return 'miss';
    if (h.inv > 0) {
      if (h.state === 'dodge' && h.t < 0.34 && !h.perfDone) {
        h.perfDone = true;
        h.perfectT = 1.6;
        h.inv = Math.max(h.inv, 0.55);
        h.art = Math.min(100, h.art + 14);
        h.st = Math.min(h.stMax, h.st + 25);
        s.slow = Math.max(s.slow, 26);
        s.stats.perfect++;
        s.events.push({ type: 'perfect', x: h.x, y: h.y + 1, z: h.z });
      }
      return 'dodge';
    }
    const dx = sx - h.x, dz = sz - h.z;
    const dl = Math.hypot(dx, dz) || 1;
    if (h.state === 'guard' || h.state === 'guardhit') {
      const da = Math.abs(M.angDiff(h.yaw, Math.atan2(dx, dz)));
      if (da < 85 * A) {
        if (h.state === 'guard' && h.guardT < 0.22) {
          h.perfectT = 1.6;
          h.art = Math.min(100, h.art + 16);
          s.slow = Math.max(s.slow, 14);
          s.stats.perfect++;
          s.events.push({ type: 'pguard', x: h.x, y: h.y + 1.2, z: h.z });
          setState(h, 'guardhit');
          h.kbx = (-dx / dl) * 2; h.kbz = (-dz / dl) * 2;
          return 'guard';
        }
        const d2 = dmg * s.rank.dmg * (100 / (100 + h.def)) * 0.2;
        h.hp -= d2;
        h.red = Math.min(h.red, h.hp + d2 * 0.5);
        h.st -= 14 + dmg * 0.45;
        h.sharp = Math.max(0, h.sharp - 1);
        h.stDelay = 0.8;
        s.events.push({ type: 'guard', x: h.x, y: h.y + 1.2, z: h.z });
        if (h.st <= 0) { h.st = 0; setState(h, 'flinch'); }
        else setState(h, 'guardhit');
        h.kbx = (-dx / dl) * 5; h.kbz = (-dz / dl) * 5;
        if (h.hp <= 0) faint(s);
        return 'guard';
      }
    }
    let d2 = dmg * s.rank.dmg * (100 / (100 + h.def));
    if (h.armor) d2 *= 0.6;
    h.hp -= d2;
    h.red = Math.min(h.red, h.hp + d2 * 0.4);
    h.focus = false;
    s.stats.taken += d2;
    s.events.push({ type: 'hurt', dmg: d2, kind, src: s.hurtSrc || s.mon.atk || s.mon.last, x: h.x, y: h.y + 1.1, z: h.z });
    if (h.hp <= 0) { faint(s); return 'hit'; }
    if (h.armor) return 'hit';
    if (kind === 'blow') {
      setState(h, 'blown');
      h.yOff = 0;
      h.kbx = (-dx / dl) * 9; h.kbz = (-dz / dl) * 9;
      h.yaw = Math.atan2(dx, dz);
    } else {
      setState(h, 'flinch');
      h.kbx = (-dx / dl) * 4; h.kbz = (-dz / dl) * 4;
      h.inv = 0.25;
    }
    return 'hit';
  }

  function faint(s) {
    const h = s.hunter;
    h.hp = 0; h.red = 0;
    setState(h, 'dead');
    h.yOff = 0;
    h.focus = false;
    s.events.push({ type: 'faint' });
  }

  // ---------------- モンスター ----------------
  const Q0 = { rear: 0, roll: 0, crouch: 0, headYaw: 0, headPitch: 0, neckExt: 0, jaw: 0, tailYaw: 0, tailPitch: 0, lunge: 0, yOff: 0, glow: 0, claw: 0 };

  function mkMonster(cfg, rank, rng) {
    return {
      x: 5, z: 16, y: 0, yaw: rng.range(-3, 3), hp: rank.hp, hpMax: rank.hp,
      state: 'graze', t: 0, atk: null, arg: 0, phase: 0, wait: 1, wait0: 1, last: null, cd: {}, close: 0,
      aware: false, pendingRoar: false, pendingRage: false, hitDone: false, fired: 0, chain: 0,
      rage: { on: false, meter: 0, t: 0 }, tiredT: 0, downDur: 5, downSide: 1, flDur: 1, tailPhase: 0, moved: 0,
      parts: { head: { acc: 0, fl: 0, broken: false }, back: { acc: 0, broken: false }, tail: { acc: 0, cut: false }, leg: { acc: 0, need: 480 * rank.part }, body: { fl: 0 } },
      p: Object.assign({}, Q0), q: Object.assign({}, Q0), k: 8, tx: 0, tz: 0, sx: 0, sz: 0,
    };
  }

  // 体の点（世界座標）。当たり判定と絵の両方がこれを使う
  S.monPose = function (m) {
    const p = m.p;
    const sy = Math.sin(m.yaw), cy = Math.cos(m.yaw);
    const gy = m.y + p.yOff;
    const cr = p.crouch * 0.9;
    const sr = Math.sin(p.roll), crl = Math.cos(p.roll);
    const sp = Math.sin(p.rear), cp = Math.cos(p.rear);
    const HZ = -1.6, HY = 2.0;
    function L2W(lx, ly, lz, noPitch) {
      if (!noPitch) {
        const dz = lz - HZ, dy = ly - HY;
        lz = HZ + dz * cp - dy * sp;
        ly = HY + dz * sp + dy * cp;
      }
      ly -= cr;
      if (p.roll !== 0) {
        const dy = ly - 1.1;
        const nx = lx * crl - dy * sr;
        ly = 1.1 + lx * sr + dy * crl;
        lx = nx;
      }
      if (ly < 0.15) ly = 0.15;
      return [m.x + lx * cy + lz * sy, gy + ly, m.z - lx * sy + lz * cy];
    }
    const lg = p.lunge;
    const o = {};
    o.L2W = L2W;
    o.hips = L2W(0, 2.0, -1.6 + lg * 0.4);
    o.belly = L2W(0, 2.15, lg * 0.7);
    o.chest = L2W(0, 2.25, 1.6 + lg);
    o.back = L2W(0, 3.25, 0.3 + lg * 0.7);
    const nz = 2.7 + lg, ny = 2.5;
    o.neck = L2W(Math.sin(p.headYaw * 0.4) * 0.3, ny, nz);
    const hd = V.dir(p.headYaw, -p.headPitch);
    const hl = 1.25 + p.neckExt;
    o.headDirL = hd;
    o.head = L2W(hd[0] * hl, ny - 0.1 + hd[1] * hl, nz + hd[2] * hl);
    o.snout = L2W(hd[0] * (hl + 1.05), ny - 0.2 + hd[1] * (hl + 1.05), nz + hd[2] * (hl + 1.05));
    // 尻尾
    const n = 7;
    const tail = [];
    let tx = 0, ty = 1.95, tz = -1.9 + lg * 0.4;
    tail.push(L2W(tx, ty, tz, true));
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      const th = p.tailYaw * Math.pow(f, 0.7) + Math.sin(m.tailPhase - i * 0.7) * 0.1 * f;
      const ph = (i <= 4 ? -0.18 : 0.06) + p.tailPitch * Math.pow(f, 0.8);
      const cph = Math.cos(ph);
      tx += Math.sin(th) * cph * 1.0;
      ty += Math.sin(ph) * 1.0;
      tz -= Math.cos(th) * cph * 1.0;
      if (ty < 0.3) ty = 0.3;
      tail.push(L2W(tx, ty, tz, true));
    }
    o.tail = tail;
    o.tailN = m.parts.tail.cut ? 3 : n;
    o.legRoot = [L2W(1.0, 1.9, 1.5), L2W(-1.0, 1.9, 1.5), L2W(0.95, 1.8, -1.5), L2W(-0.95, 1.8, -1.5)];
    o.legMid = [L2W(1.25, 0.95, 1.65), L2W(-1.25, 0.95, 1.65), L2W(1.15, 0.9, -1.5), L2W(-1.15, 0.9, -1.5)];
    return o;
  };

  S.monSpheres = function (s) {
    if (s.sphFrame === s.frame && s.sph) return s.sph;
    const ps = s.pose, m = s.mon;
    const a = [];
    const add = (p, r, part) => a.push({ x: p[0], y: p[1], z: p[2], r, part });
    add(ps.head, 0.8, 'head'); add(ps.snout, 0.6, 'head');
    add(ps.neck, 0.65, 'body');
    add(ps.chest, 1.05, 'body'); add(ps.belly, 1.1, 'body'); add(ps.hips, 1.0, 'body');
    add(ps.back, 0.75, 'back');
    for (let i = 0; i < 4; i++) add(ps.legMid[i], 0.62, 'leg');
    for (let i = 1; i <= ps.tailN; i++) add(ps.tail[i], 0.62 - i * 0.045, 'tail');
    s.sph = a;
    s.sphFrame = s.frame;
    return a;
  };

  function enterStalk(s, m, wait) {
    const R = s.rank;
    m.state = 'stalk';
    m.t = 0;
    m.atk = null;
    let w = wait !== undefined ? wait : s.rng.range(R.wait[0], R.wait[1]);
    if (m.tiredT > 0) w += 1.2;
    if (m.rage.on) w *= 0.7;
    m.wait = m.wait0 = w;
  }

  function startAtk(s, m, id, arg) {
    m.state = 'atk';
    m.atk = id;
    m.arg = arg || 0;
    m.t = 0;
    m.phase = 0;
    m.hitDone = false;
    m.fired = 0;
    m.last = id;
    s.events.push({ type: 'monAtk', id });
  }

  function chooseAttack(s, m) {
    const h = s.hunter, R = s.rank;
    const dx = h.x - m.x, dz = h.z - m.z;
    const d = Math.hypot(dx, dz);
    const ang = M.angDiff(m.yaw, Math.atan2(dx, dz));
    const a = Math.abs(ang), side = ang >= 0 ? 1 : -1;
    const opts = [];
    const add = (id, w, arg) => {
      if ((m.cd[id] || 0) > 0 || w <= 0) return;
      if (m.last === id) w *= 0.3;
      opts.push([id, w, arg]);
    };
    const cut = m.parts.tail.cut;
    if (d < 6.5) {
      if (a < 1.0) { add('bite', 3); add('claw', 3, side); add('tailsweep', 1.2, side); if (m.close > 7) add('backhop', 4); }
      else if (a > 2.0) { add('tailslam', cut ? 1 : 2.6); add('tailsweep', 3, side); }
      else { add('tailsweep', 3, side); add('claw', 2, side); add('bite', 1); }
    } else if (d < 15) {
      add('pounce', 3); add('charge', 2); add('bolt', 2.2);
      if (a > 2.2 && d < 10) add('tailslam', 1.5);
    } else {
      add('charge', 3); add('bolt', 3); if (d < 18) add('pounce', 1.5);
    }
    if (m.rage.on && R.thunder) add('thunder', 2.4);
    let tot = 0;
    for (let i = 0; i < opts.length; i++) tot += opts[i][1];
    let r = s.rng.next() * tot;
    for (let i = 0; i < opts.length; i++) {
      r -= opts[i][1];
      if (r <= 0) return opts[i];
    }
    return opts[0] || ['bite', 1, 0];
  }

  function monHurtSphere(s, p, r, dmg, kind) {
    const m = s.mon, h = s.hunter;
    if (m.hitDone) return;
    const d = Math.hypot(p[0] - h.x, p[1] - (h.y + h.yOff + 1.0), p[2] - h.z);
    if (d < r + 0.6) {
      const res = hurtHunter(s, dmg, kind, m.x, m.z);
      if (res !== 'miss') m.hitDone = true;
    }
  }

  function turnToward(m, tx, tz, rate, dt) {
    m.yaw = M.angApproach(m.yaw, Math.atan2(tx - m.x, tz - m.z), rate * dt);
  }
  function fwdMove(m, dist) {
    m.x += Math.sin(m.yaw) * dist;
    m.z += Math.cos(m.yaw) * dist;
    m.moved += Math.abs(dist);
  }

  const ATK = {
    bite(s, m, t, dt) {
      const q = m.q, h = s.hunter;
      if (t < 0.65) {
        if (t < 0.5) turnToward(m, h.x, h.z, 1.7, dt);
        q.crouch = 0.35; q.neckExt = -0.45; q.headPitch = -0.3; q.jaw = 0.8 * tr(t, 0.2, 0.6);
      } else if (t < 0.92) {
        m.k = 22;
        q.lunge = 1.5; q.neckExt = 1.0; q.headPitch = 0.3; q.jaw = t < 0.8 ? 0.9 : 0; q.crouch = 0.2;
        fwdMove(m, 9 * dt);
        monHurtSphere(s, s.pose.head, 1.2, 26, 'flinch');
        monHurtSphere(s, s.pose.snout, 1.05, 26, 'flinch');
      } else { q.crouch = 0.15; q.headPitch = 0.2; }
      return t >= 1.9;
    },
    claw(s, m, t, dt) {
      const q = m.q, h = s.hunter, side = m.arg;
      if (t < 0.6) {
        if (t < 0.45) turnToward(m, h.x, h.z, 1.6, dt);
        q.rear = 0.2; q.roll = side * 0.14; q.claw = side * tr(t, 0, 0.5);
      } else if (t < 0.84) {
        m.k = 20;
        const u = tr(t, 0.6, 0.84);
        q.rear = -0.06; q.roll = -side * 0.18; q.claw = side * (1 - 2 * u); q.lunge = 0.8;
        fwdMove(m, 4 * dt);
        const lp = s.pose.L2W(side * M.lerp(2.3, -1.6, u), 1.15, 2.5 + Math.sin(Math.PI * u) * 1.1 + m.p.lunge);
        monHurtSphere(s, lp, 1.45, 24, 'flinch');
        m.clawPos = lp;
      } else {
        q.roll = -side * 0.08;
        if (m.chain === 0 && t > 1.0 && s.rng.next() < s.rank.combo * dt * 6 + (m.rage.on ? dt * 3 : 0)) {
          m.chain = 1; m.t = 0.3; m.arg = -side; m.hitDone = false;
          return false;
        }
      }
      return t >= 1.7;
    },
    tailsweep(s, m, t, dt) {
      const q = m.q, dir = m.arg || 1;
      if (t < 0.75) {
        q.tailYaw = -dir * 1.0; q.crouch = 0.25; q.headYaw = -dir * 0.5;
        m.yaw -= dir * 0.4 * dt;
      } else if (t < 1.45) {
        m.k = 14;
        m.yaw += dir * ((Math.PI * 2 + 0.3) / 0.7) * dt;
        q.tailYaw = -dir * 0.85; q.crouch = 0.3; q.tailPitch = -0.05;
        const ps = s.pose;
        for (let i = 2; i <= ps.tailN; i++) monHurtSphere(s, ps.tail[i], 0.95 - i * 0.04, 30, 'blow');
        monHurtSphere(s, ps.hips, 1.3, 22, 'blow');
        monHurtSphere(s, ps.head, 1.0, 22, 'blow');
      } else { q.crouch = 0.2; q.tailYaw = dir * 0.3 * (1 - tr(t, 1.45, 2.2)); }
      return t >= 2.45;
    },
    charge(s, m, t, dt) {
      const q = m.q, h = s.hunter;
      if (m.phase === 0) {
        turnToward(m, h.x, h.z, 2.3, dt);
        q.crouch = 0.45; q.headPitch = 0.35; q.tailPitch = 0.35;
        if (t >= 0.9) { m.phase = 1; m.pt = 0; }
      } else if (m.phase === 1) {
        m.pt += dt;
        const dx = h.x - m.x, dz = h.z - m.z;
        const ahead = dx * Math.sin(m.yaw) + dz * Math.cos(m.yaw);
        if (ahead > 0) turnToward(m, h.x, h.z, 0.55, dt);
        fwdMove(m, 15 * s.rank.spd * dt);
        q.crouch = 0.3; q.headPitch = 0.4; q.tailPitch = 0.3; m.k = 12;
        monHurtSphere(s, s.pose.head, 1.5, 34, 'blow');
        monHurtSphere(s, s.pose.chest, 1.6, 34, 'blow');
        const r = Math.hypot(m.x, m.z);
        if (m.pt > 1.7 || r > W.R - 5 || (ahead < -6 && m.pt > 0.4)) { m.phase = 2; m.pt = 0; }
      } else {
        m.pt += dt;
        const v = 9 * Math.max(0, 1 - m.pt / 0.7);
        fwdMove(m, v * dt);
        q.crouch = 0.35; q.rear = 0.12; q.roll = 0.1;
        if (m.pt >= 1.0) return true;
      }
      return false;
    },
    pounce(s, m, t, dt) {
      const q = m.q, h = s.hunter;
      const w = m.chain ? 0.5 : 0.85;
      if (m.phase === 0) {
        turnToward(m, h.x, h.z, 2.2, dt);
        q.crouch = 0.75; q.rear = -0.1; q.tailPitch = 0.4;
        if (t >= w) {
          m.phase = 1; m.pt = 0;
          const dx = h.x - m.x, dz = h.z - m.z;
          let d = Math.hypot(dx, dz) || 1;
          const dd = M.clamp(d - 1.8, 2, 15);
          m.sx = m.x; m.sz = m.z;
          m.tx = m.x + (dx / d) * dd; m.tz = m.z + (dz / d) * dd;
          const tr2 = Math.hypot(m.tx, m.tz);
          if (tr2 > W.R - 4) { m.tx *= (W.R - 4) / tr2; m.tz *= (W.R - 4) / tr2; }
          m.yaw = Math.atan2(dx, dz);
          s.events.push({ type: 'leap' });
        }
      } else if (m.phase === 1) {
        m.pt += dt;
        const u = Math.min(1, m.pt / 0.65);
        m.x = M.lerp(m.sx, m.tx, u); m.z = M.lerp(m.sz, m.tz, u);
        m.k = 30;
        q.yOff = 4.2 * 4 * u * (1 - u);
        q.rear = M.lerp(0.5, -0.3, u); q.crouch = 0.2; q.claw = 0;
        if (u >= 1) {
          m.phase = 2; m.pt = 0; m.p.yOff = 0;
          const cx = m.x + Math.sin(m.yaw) * 1.6, cz = m.z + Math.cos(m.yaw) * 1.6;
          s.events.push({ type: 'land', x: cx, z: cz, r: 4.3 });
          if (Math.hypot(h.x - cx, h.z - cz) < 4.3 && h.yOff < 2) hurtHunter(s, 36, 'blow', cx, cz);
        }
      } else {
        m.pt += dt;
        q.crouch = 0.6 * (1 - tr(m.pt, 0.3, 1.1)); q.rear = -0.15 * (1 - tr(m.pt, 0, 0.8));
        if (m.chain === 0 && m.pt > 0.35 && s.rank.combo > 0.5 && s.rng.next() < 0.3 * dt * 4) { m.chain = 1; m.phase = 0; m.t = 0; return false; }
        if (m.pt >= 1.2) return true;
      }
      return false;
    },
    bolt(s, m, t, dt) {
      const q = m.q, h = s.hunter;
      const vol = m.rage.on || s.rank.star >= 3 ? 3 : s.rank.star >= 2 ? 2 : 1;
      const last = 1.0 + (vol - 1) * 0.4;
      if (t < last + 0.15) {
        turnToward(m, h.x, h.z, 1.5, dt);
        q.rear = 0.32; q.jaw = 0.9; q.headPitch = -0.15; q.glow = 1; q.crouch = 0.1;
        while (m.fired < vol && t >= 1.0 + m.fired * 0.4) {
          const sn = s.pose.snout;
          const angs = m.fired % 2 === 0 ? [-0.32, 0, 0.32] : [-0.16, 0.16];
          for (let i = 0; i < angs.length; i++) {
            const a = m.yaw + angs[i];
            s.shots.push({ x: sn[0], z: sn[2], vx: Math.sin(a) * 12, vz: Math.cos(a) * 12, life: 2.4, r: 0.85, dmg: 20 });
          }
          m.fired++;
          m.p.headPitch = 0.3;
          s.events.push({ type: 'boltFire', x: sn[0], y: sn[1], z: sn[2] });
        }
      } else { q.crouch = 0.2; q.headPitch = 0.2; }
      return t >= last + 1.25;
    },
    tailslam(s, m, t, dt) {
      const q = m.q, h = s.hunter;
      if (t < 0.8) {
        const want = Math.atan2(h.x - m.x, h.z - m.z) + Math.PI;
        m.yaw = M.angApproach(m.yaw, want, 5 * dt);
        q.tailPitch = 0.9 * tr(t, 0, 0.7); q.crouch = 0.2; q.headYaw = 0.6;
      } else if (t < 1.12) {
        q.tailPitch = 1.15; q.crouch = 0.3; q.rear = -0.12;
      } else if (t < 2.2) {
        m.k = t < 1.3 ? 34 : 10;
        q.tailPitch = -0.4; q.crouch = 0.35; q.rear = 0.1;
        if (t >= 1.18 && t < 1.34) {
          const ps = s.pose;
          for (let i = 2; i <= ps.tailN; i++) if (ps.tail[i][1] - m.y < 1.6) monHurtSphere(s, ps.tail[i], 1.05, 38, 'blow');
          if (!m.fired) {
            m.fired = 1;
            const tp = ps.tail[Math.min(5, ps.tailN)];
            s.events.push({ type: 'slam', x: tp[0], z: tp[2], r: 2.5 });
          }
        }
      } else { q.tailPitch = 0; }
      return t >= 2.65;
    },
    thunder(s, m, t, dt) {
      const q = m.q, h = s.hunter;
      const n = s.rank.star >= 3 ? 7 : 5;
      if (t < 3.3) {
        q.rear = 0.28; q.headPitch = -0.6; q.jaw = t < 2.6 ? 1 : 0.3; q.glow = 1; q.crouch = 0.1;
        while (m.fired < n && t >= 0.5 + m.fired * 0.38) {
          let x, z;
          if (m.fired % 2 === 0) { x = h.x + h.vx * 0.35; z = h.z + h.vz * 0.35; }
          else { const a = s.rng.range(0, 6.283), r = s.rng.range(2, 6); x = h.x + Math.sin(a) * r; z = h.z + Math.cos(a) * r; }
          s.strikes.push({ x, z, t: 0, delay: 0.95, r: 2.4, dmg: 28 });
          s.events.push({ type: 'strikeWarn', x, z, r: 2.4, delay: 0.95 });
          m.fired++;
        }
        if (m.phase === 0 && t >= 2.5) {
          m.phase = 1;
          s.strikes.push({ x: m.x, z: m.z, t: 0, delay: 0.8, r: 6.5, dmg: 34, nova: true });
          s.events.push({ type: 'strikeWarn', x: m.x, z: m.z, r: 6.5, delay: 0.8 });
        }
      } else { q.crouch = 0.4; q.headPitch = 0.4; q.jaw = 0.4; }
      return t >= 4.7;
    },
    roar(s, m, t, dt) {
      const q = m.q, h = s.hunter;
      if (t < 0.5) { q.rear = 0.15; q.headPitch = 0.3; q.crouch = 0.3; q.jaw = 0.2; }
      else if (t < 1.8) {
        m.k = 14;
        q.rear = 0.25; q.headPitch = -0.55; q.jaw = 1; q.tailPitch = 0.5; q.glow = m.rage.on ? 1 : 0;
        if (!m.fired) {
          m.fired = 1;
          s.events.push({ type: 'roar', x: m.x, z: m.z });
          const d = Math.hypot(h.x - m.x, h.z - m.z);
          if (d < 20 && h.inv <= 0 && h.state !== 'guard' && h.state !== 'dead' && !h.armor && h.state !== 'blown' && h.state !== 'down') {
            setState(h, 'roarstun');
            h.focus = false;
          } else if (d < 20 && h.state === 'dodge' && !h.perfDone) {
            hurtHunter(s, 0, 'flinch', m.x, m.z);
          }
        }
      }
      return t >= 2.3;
    },
    backhop(s, m, t, dt) {
      const q = m.q;
      if (t < 0.25) { q.crouch = 0.6; }
      else if (t < 0.75) {
        const u = tr(t, 0.25, 0.75);
        const r = Math.hypot(m.x, m.z);
        if (r < W.R - 5 || (m.x * Math.sin(m.yaw) + m.z * Math.cos(m.yaw)) > 0) fwdMove(m, -16 * dt);
        m.k = 30; q.yOff = 1.6 * 4 * u * (1 - u); q.rear = 0.15;
      } else { q.crouch = 0.4; m.p.yOff = 0; }
      if (t >= 1.05) { m.close = 0; m.quick = true; return true; }
      return false;
    },
  };

  function monStep(s, dt0) {
    const m = s.mon, h = s.hunter, R = s.rank;
    let spd = R.spd;
    if (m.rage.on) spd *= 1.15;
    else if (m.tiredT > 0) spd *= 0.85;
    const dt = dt0 * (m.state === 'atk' || m.state === 'stalk' ? spd : 1);
    m.t += dt;
    for (const k in m.cd) if (m.cd[k] > 0) m.cd[k] -= dt0;
    if (m.rage.on) {
      m.rage.t -= dt0;
      if (m.rage.t <= 0) { m.rage.on = false; m.tiredT = 16; s.events.push({ type: 'calm' }); }
    } else if (m.tiredT > 0) m.tiredT -= dt0;
    const dx = h.x - m.x, dz = h.z - m.z;
    const d = Math.hypot(dx, dz);
    const angTo = Math.atan2(dx, dz);
    if (d < 5.5) m.close += dt0; else m.close = Math.max(0, m.close - dt0 * 2);

    // 目標の姿勢を既定に戻す
    const q = m.q;
    for (const k in Q0) q[k] = 0;
    m.k = 8;
    if (m.rage.on) q.glow = 0.6;
    m.tailPhase += dt0 * (m.rage.on ? 3.2 : 1.6);
    const lookYaw = M.clamp(M.angDiff(m.yaw, angTo), -0.8, 0.8);

    const hunterDown = h.state === 'dead' || s.result === 'fail';
    switch (m.state) {
      case 'graze': {
        q.headPitch = 0.75 + Math.sin(m.t * 1.3) * 0.06; q.neckExt = 0.2; q.jaw = 0.15 + Math.sin(m.t * 5) * 0.1;
        if (d < 21 && !hunterDown) { m.aware = true; m.pendingRoar = false; m.yawGoal = angTo; m.state = 'notice'; m.t = 0; }
        break;
      }
      case 'notice': {
        q.headYaw = lookYaw; q.headPitch = -0.1;
        turnToward(m, h.x, h.z, 2.2, dt);
        if (m.t > 0.9) startAtk(s, m, 'roar');
        break;
      }
      case 'stalk': {
        if (m.noAI) break; // テスト用：動かない
        q.headYaw = lookYaw;
        if (hunterDown) { q.headPitch = 0.1; break; }
        if (m.tiredT > 0) { q.headPitch = 0.35; q.jaw = 0.35; q.crouch = 0.1; }
        const a = Math.abs(M.angDiff(m.yaw, angTo));
        turnToward(m, h.x, h.z, (m.rage.on ? 2.7 : 1.9), dt);
        if (d > 6 && a < 0.7) fwdMove(m, (m.rage.on ? 4.6 : 3.3) * dt);
        m.wait -= dt;
        if (m.pendingRage && m.wait < m.wait0 - 0.2) {
          m.pendingRage = false; m.rage.on = true; m.rage.t = 45;
          s.events.push({ type: 'rage' });
          startAtk(s, m, 'roar');
        } else if (m.pendingRoar) {
          m.pendingRoar = false;
          startAtk(s, m, 'roar');
        } else if (m.wait <= 0 && (a < 0.5 || m.wait < -1.2 || (a > 2.0 && d < 8))) {
          m.chain = 0;
          const c = chooseAttack(s, m);
          if (c[0] === 'thunder') m.cd.thunder = 20;
          if (c[0] === 'backhop') m.cd.backhop = 12;
          startAtk(s, m, c[0], c[2]);
        }
        break;
      }
      case 'atk': {
        if (hunterDown && m.atk !== 'roar' && m.phase !== 1) { enterStalk(s, m, 2.5); break; }
        const done = ATK[m.atk](s, m, m.t, dt);
        if (done) {
          const quick = m.quick;
          m.quick = false;
          m.p.yOff = 0;
          enterStalk(s, m, quick ? 0.15 : undefined);
        }
        break;
      }
      case 'flinch': {
        const u = m.t / m.flDur;
        q.rear = 0.25 * (1 - u); q.headPitch = -0.4 * (1 - u); q.headYaw = 0.6 * (1 - u); q.jaw = 0.8 * (1 - u); q.roll = 0.12 * Math.sin(u * 9) * (1 - u);
        m.k = 16;
        if (m.t >= m.flDur) enterStalk(s, m, 0.5);
        break;
      }
      case 'down': {
        const up = tr(m.t, m.downDur - 0.9, m.downDur);
        q.roll = m.downSide * 1.25 * (1 - up); q.crouch = 0.55 * (1 - up);
        q.headPitch = 0.2; q.jaw = 0.5 + 0.4 * Math.sin(m.t * 9); q.headYaw = 0.3 * Math.sin(m.t * 4);
        q.tailYaw = 0.5 * Math.sin(m.t * 6);
        m.k = m.t < 0.6 ? 12 : 6;
        if (m.t >= m.downDur) enterStalk(s, m, 0.4);
        break;
      }
      case 'dead': {
        const u = tr(m.t, 0.0, 1.2);
        if (m.t < 1.2) { q.rear = 0.4 * Math.sin(u * Math.PI); q.headPitch = -0.5; q.jaw = 1; m.k = 6; }
        else { q.roll = m.downSide * 1.3; q.crouch = 0.6; q.headPitch = 0.3; q.jaw = 0.25; m.k = 4; }
        q.glow = 0;
        break;
      }
    }
    // 目標へなめらかに近づける
    const p = m.p;
    const kk = 1 - Math.exp(-m.k * dt0);
    for (const k in Q0) {
      if (k === 'yOff') continue;
      p[k] += (q[k] - p[k]) * kk;
    }
    p.yOff = q.yOff;
    const r = Math.hypot(m.x, m.z);
    if (r > W.R - 3) { m.x *= (W.R - 3) / r; m.z *= (W.R - 3) / r; }
    m.y = W.height(m.x, m.z);
    m.yaw = M.wrapPi(m.yaw);
  }

  // ---------------- 全体 ----------------
  S.create = function (cfg) {
    const seed = cfg.seed || 1;
    const rng = new M.RNG(seed);
    const rank = D.ranks[cfg.rank || 0];
    const s = {
      cfg, seed, rng, rank, rankIdx: cfg.rank || 0, t: 0, frame: 0, events: [], hitstop: 0, slow: 0,
      result: null, endT: 0, faintT: 0, timeLimit: 900, shots: [], strikes: [],
      stats: { dmg: 0, hits: 0, perfect: 0, taken: 0, time: 0, faints: 0, breaks: { head: false, back: false, tail: false } },
      hunter: mkHunter(cfg), mon: null, pose: null, sph: null, sphFrame: -1,
    };
    s.mon = mkMonster(cfg, rank, rng);
    s.hunter.y = W.height(s.hunter.x, s.hunter.z);
    s.mon.y = W.height(s.mon.x, s.mon.z);
    updateWeaponPose(s.hunter, DT);
    s.pose = S.monPose(s.mon);
    return s;
  };

  const NOINPUT = {};
  S.step = function (s, inp) {
    s.frame++;
    if (s.hitstop > 0) { s.hitstop--; return; }
    let dt = DT;
    if (s.slow > 0) { s.slow--; dt *= 0.3; }
    const h = s.hunter, m = s.mon;
    if (!s.result) s.t += dt; else s.endT += DT;

    if (h.state === 'dead') {
      s.faintT += dt;
      h.t += dt;
      updateWeaponPose(h, dt);
      if (!s.result && s.faintT >= 3.2) {
        h.faints++;
        s.stats.faints = h.faints;
        if (h.faints >= 3) { s.result = 'fail'; s.stats.time = s.t; s.events.push({ type: 'fail' }); }
        else {
          h.x = W.camp[0]; h.z = W.camp[1]; h.yaw = 0;
          h.hp = h.hpMax; h.red = h.hpMax; h.st = h.stMax; h.inv = 3;
          setState(h, 'idle');
          s.faintT = 0;
          s.events.push({ type: 'respawn' });
          if (m.state !== 'dead' && m.state !== 'graze') enterStalk(s, m, 2.0);
        }
      }
    } else {
      s.faintT = 0;
      hunterStep(s, s.result ? NOINPUT : inp || NOINPUT, dt);
    }
    monStep(s, dt);
    s.pose = S.monPose(m);
    hunterHits(s);

    // 雷の玉
    for (let i = s.shots.length - 1; i >= 0; i--) {
      const b = s.shots[i];
      b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      let dead = b.life <= 0 || Math.hypot(b.x, b.z) > W.R + 2;
      if (!dead && Math.hypot(b.x - h.x, b.z - h.z) < b.r + 0.5 && h.yOff < 1.6) {
        s.hurtSrc = 'bolt';
        const res = hurtHunter(s, b.dmg, 'flinch', b.x - b.vx, b.z - b.vz);
        s.hurtSrc = null;
        if (res === 'hit' || res === 'guard') dead = true;
      }
      if (dead) { s.events.push({ type: 'boltEnd', x: b.x, z: b.z }); s.shots.splice(i, 1); }
    }
    // 落雷
    for (let i = s.strikes.length - 1; i >= 0; i--) {
      const k = s.strikes[i];
      k.t += dt;
      if (k.t >= k.delay) {
        s.events.push({ type: 'strike', x: k.x, z: k.z, r: k.r, nova: !!k.nova });
        s.hurtSrc = 'thunder';
        if (Math.hypot(k.x - h.x, k.z - h.z) < k.r) hurtHunter(s, k.dmg, 'blow', k.x, k.z);
        s.hurtSrc = null;
        s.strikes.splice(i, 1);
      }
    }
    if (!s.result && s.t >= s.timeLimit) { s.result = 'fail'; s.stats.time = s.t; s.events.push({ type: 'fail' }); }
  };

  // ボットや画面が使う読み取り用
  S.monStatus = function (s) {
    const m = s.mon;
    if (m.state === 'dead') return 'dead';
    if (m.rage.on) return 'rage';
    if (m.hp < m.hpMax * 0.2) return 'weak';
    if (m.tiredT > 0) return 'tired';
    return 'normal';
  };
})();
