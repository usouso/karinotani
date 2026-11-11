// 狩りの谷 — 演出（パーティクル・雷・地面の輪・剣の軌跡・ダメージ数字・画面ゆれ）
(function () {
  'use strict';
  const KT = globalThis.KT;
  const M = KT.M, V = M.V, G = KT.GL, W = KT.World, S = KT.Sim;
  const F = (KT.Fx = {});
  let parts, glows, rings, bolts, nums, trails, rnd, ambT;

  F.reset = function () {
    parts = []; glows = []; rings = []; bolts = []; nums = []; trails = [[], []];
    rnd = new M.RNG(99);
    F.trauma = 0;
    ambT = 0;
  };
  F.reset();
  const rr = (a, b) => rnd.range(a, b);

  // a: 0=光（加算）, 1=けむり（アルファ）
  function spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav, drag, stretch) {
    if (parts.length > 3400) return;
    parts.push({ x, y, z, vx, vy, vz, t: 0, life, s0, s1, r, g, b, a: a || 0, grav: grav || 0, drag: drag || 0, st: stretch || 0 });
  }
  F.spawn = spawn;
  function burst(p, n, speed, life, size, col, opt) {
    opt = opt || {};
    for (let i = 0; i < n; i++) {
      const a = rr(0, 6.283), e = rr(-0.5, 1.2), sp = speed * rr(0.3, 1);
      const ce = Math.cos(e);
      spawn(p[0], p[1], p[2], Math.sin(a) * ce * sp + (opt.vx || 0), Math.sin(e) * sp + (opt.vy || 0), Math.cos(a) * ce * sp + (opt.vz || 0),
        life * rr(0.5, 1), size * rr(0.6, 1.2), size * 0.1, col[0], col[1], col[2], opt.a || 0, opt.grav === undefined ? 9 : opt.grav, opt.drag || 1.5, opt.st === undefined ? 0.12 : opt.st);
    }
  }
  function dust(x, z, n, spread, up, size) {
    const y = W.height(x, z);
    for (let i = 0; i < n; i++) {
      const a = rr(0, 6.283), d = rr(0, spread);
      spawn(x + Math.sin(a) * d, y + 0.2, z + Math.cos(a) * d, Math.sin(a) * rr(1, 4), rr(0.5, up), Math.cos(a) * rr(1, 4), rr(0.6, 1.4), size * rr(0.5, 1), size * rr(1.6, 2.6), 0.55, 0.48, 0.38, 0.5, -0.5, 2.2, 0);
    }
  }
  function debris(x, z, n, sp) {
    const y = W.height(x, z);
    for (let i = 0; i < n; i++) {
      const a = rr(0, 6.283);
      spawn(x + Math.sin(a) * rr(0, 1.5), y + 0.2, z + Math.cos(a) * rr(0, 1.5), Math.sin(a) * rr(1, sp), rr(3, sp * 1.5), Math.cos(a) * rr(1, sp), rr(0.6, 1.2), rr(0.08, 0.2), 0.06, 0.25, 0.21, 0.17, 1, 18, 0.2, 0);
    }
  }
  function ring(x, z, r, dur, kind) { rings.push({ x, z, r, t: 0, dur, kind }); }
  function lightning(x, z, big) {
    const y = W.height(x, z);
    const top = [x + rr(-8, 8), y + 55, z + rr(-8, 8)];
    const mk = (a, b, n, amp) => {
      const pts = [a];
      for (let i = 1; i < n; i++) {
        const u = i / n;
        pts.push([M.lerp(a[0], b[0], u) + rr(-amp, amp), M.lerp(a[1], b[1], u), M.lerp(a[2], b[2], u) + rr(-amp, amp)]);
      }
      pts.push(b);
      return pts;
    };
    const main = mk(top, [x, y, z], 14, big ? 2.4 : 1.6);
    bolts.push({ pts: main, t: 0, dur: 0.26, w: big ? 0.2 : 0.13 });
    for (let k = 0; k < (big ? 4 : 2); k++) {
      const st = main[3 + Math.floor(rr(0, 8))];
      bolts.push({ pts: mk(st, [st[0] + rr(-9, 9), st[1] - rr(6, 14), st[2] + rr(-9, 9)], 5, 1.0), t: 0, dur: 0.18, w: 0.06 });
    }
  }
  F.num = function (p, txt, cls, crit, big) {
    if (nums.length >= 7) nums.shift();
    nums.push({ p: p.slice(), txt, cls, crit, t: 0, big: !!big, ox: rr(-52, 52), oy: rr(-26, 22) });
  };
  F.shake = function (a) { F.trauma = Math.min(1, F.trauma + a); };

  const HITCOL = [[0.7, 0.75, 0.8], [1.6, 2.2, 3.0], [3.4, 2.0, 0.6]];

  F.onEvent = function (e, s, rs) {
    const h = s.hunter, m = s.mon;
    switch (e.type) {
      case 'hit': {
        const p = [e.x, e.y, e.z];
        const col = e.crit ? [3.6, 3.0, 0.9] : HITCOL[e.cls];
        const n = Math.round(M.clamp(e.mv * 0.35, 5, 46));
        burst(p, n, 5 + e.mv * 0.09, 0.4, 0.1 + e.mv * 0.0012, col, { st: 0.14 });
        spawn(p[0], p[1], p[2], 0, 0, 0, 0.12, 0.4 + e.mv * 0.012, 0.1, col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, 0);
        if (e.cls === 2 || e.crit) burst(p, 6, 9, 0.5, 0.16, [3.5, 3.0, 1.6], { st: 0.25, grav: 4 });
        if (e.bounce) burst(p, 14, 7, 0.3, 0.07, [3, 2.6, 1.6], { st: 0.2 });
        F.num(p, String(e.dmg), e.cls, e.crit, e.mv >= 60);
        if (e.mv >= 90) F.shake(0.45); else if (e.mv >= 60) F.shake(0.22);
        break;
      }
      case 'dodge': dust(h.x, h.z, 6, 0.4, 1.5, 0.35); break;
      case 'perfect':
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * 6.283;
          spawn(e.x, e.y, e.z, Math.sin(a) * 7, rr(-1, 2), Math.cos(a) * 7, 0.45, 0.16, 0.03, 0.8, 2.4, 3.6, 0, 0, 3, 0.2);
        }
        ring(e.x, e.z, 3.2, 0.4, 'blue');
        break;
      case 'pguard':
        burst([e.x + Math.sin(h.yaw) * 0.6, e.y, e.z + Math.cos(h.yaw) * 0.6], 30, 9, 0.4, 0.11, [3.4, 3.0, 1.8], { st: 0.2 });
        ring(e.x, e.z, 2.6, 0.35, 'gold');
        break;
      case 'guard': burst([e.x + Math.sin(h.yaw) * 0.6, e.y, e.z + Math.cos(h.yaw) * 0.6], 14, 6, 0.3, 0.08, [3, 2.4, 1.2], { st: 0.2 }); break;
      case 'hurt':
        burst([e.x, e.y, e.z], 16, 6, 0.4, 0.1, [3.2, 0.5, 0.3]);
        if (e.kind === 'blow') F.shake(0.4);
        break;
      case 'roar': ring(e.x, e.z, 20, 0.9, 'roar'); ring(e.x, e.z, 14, 1.2, 'roar'); F.shake(0.75); dust(e.x, e.z, 26, 4, 3, 0.9); break;
      case 'leap': dust(m.x, m.z, 18, 2.5, 3, 0.8); break;
      case 'land': ring(e.x, e.z, e.r, 0.5, 'shock'); dust(e.x, e.z, 40, e.r * 0.7, 4, 1.1); debris(e.x, e.z, 26, 7); F.shake(0.65); break;
      case 'slam': ring(e.x, e.z, e.r, 0.45, 'shock'); dust(e.x, e.z, 24, e.r * 0.6, 4, 0.9); debris(e.x, e.z, 18, 7); F.shake(e.big ? 0.7 : 0.5); break;
      case 'topple': dust(m.x, m.z, 40, 3.5, 3, 1.2); F.shake(0.4); break;
      case 'boltFire': burst([e.x, e.y, e.z], 22, 8, 0.35, 0.12, [0.8, 2.6, 3.6]); spawn(e.x, e.y, e.z, 0, 0, 0, 0.16, 1.5, 0.3, 0.3, 1.0, 1.5, 0); break;
      case 'boltEnd': burst([e.x, W.height(e.x, e.z) + 0.8, e.z], 12, 5, 0.3, 0.1, [0.8, 2.6, 3.6]); break;
      case 'strikeWarn': ring(e.x, e.z, e.r, e.delay, 'warn'); break;
      case 'strike': {
        const y = W.height(e.x, e.z);
        lightning(e.x, e.z, e.nova);
        ring(e.x, e.z, e.r, 0.4, 'flash');
        burst([e.x, y + 0.4, e.z], e.nova ? 50 : 22, 10, 0.5, 0.11, [0.6, 1.8, 2.6], { grav: 6 });
        spawn(e.x, y + 1, e.z, 0, 0, 0, 0.2, e.r * 1.5, e.r * 0.6, 0.35, 0.9, 1.3, 0);
        debris(e.x, e.z, 8, 6);
        F.shake(e.nova ? 0.7 : 0.3);
        break;
      }
      case 'break': {
        const ps = s.pose;
        const p = e.part === 'head' ? ps.head : e.part === 'back' ? ps.back : ps.tail[3];
        const col = e.part === 'back' ? [0.8, 2.8, 3.6] : [2.6, 2.4, 2.0];
        burst(p, 70, 10, 0.9, 0.16, col, { grav: 12, st: 0.1 });
        spawn(p[0], p[1], p[2], 0, 0, 0, 0.25, 2.4, 0.6, col[0] * 0.35, col[1] * 0.35, col[2] * 0.35, 0);
        F.shake(0.5);
        break;
      }
      case 'tailcut':
        rs.tailPiece = { x: e.x, y: e.y, z: e.z, vx: Math.sin(e.yaw + Math.PI) * 5 + rr(-2, 2), vy: 9, vz: Math.cos(e.yaw + Math.PI) * 5 + rr(-2, 2), yaw: e.yaw + Math.PI, spin: 0, rest: false };
        break;
      case 'rage': {
        const p = s.pose.back;
        burst(p, 60, 12, 0.7, 0.14, [0.8, 2.8, 3.8], { grav: 2 });
        break;
      }
      case 'chargeLv': {
        const col = e.lv === 1 ? [3, 2.6, 0.8] : e.lv === 2 ? [3.4, 1.6, 0.4] : [3.8, 0.9, 0.5];
        const p = [h.x, h.y + 1.1, h.z];
        burst(p, 16 + e.lv * 6, 5, 0.35, 0.1, col, { grav: -2 });
        spawn(p[0], p[1], p[2], 0, 0, 0, 0.18, 1.0 + e.lv * 0.3, 0.2, col[0] * 0.4, col[1] * 0.4, col[2] * 0.4, 0);
        break;
      }
      case 'heal': for (let i = 0; i < 24; i++) spawn(h.x + rr(-0.5, 0.5), h.y + rr(0.2, 1.4), h.z + rr(-0.5, 0.5), 0, rr(0.8, 2.2), 0, rr(0.6, 1.1), 0.12, 0.02, 0.6, 3.0, 1.0, 0, -0.5, 0.5, 0); break;
      case 'sharpen': { const bl = S.hunterBlades(h)[0]; burst(V.mad(bl.g, bl.d, bl.len * 0.6), 30, 5, 0.4, 0.07, [3.4, 2.8, 1.4]); break; }
      case 'buff': for (let i = 0; i < 24; i++) spawn(h.x + rr(-0.5, 0.5), h.y + rr(0.2, 1.4), h.z + rr(-0.5, 0.5), 0, rr(0.8, 2.2), 0, rr(0.6, 1.1), 0.12, 0.02, 3.4, 0.9, 0.4, 0, -0.5, 0.5, 0); break;
      case 'art': { const p = [h.x, h.y + 1, h.z]; burst(p, 40, 7, 0.6, 0.13, [0.9, 2.6, 3.6], { grav: -3 }); ring(h.x, h.z, 3, 0.4, 'blue'); break; }
      case 'kill': { const p = s.pose.chest; burst(p, 80, 12, 1.2, 0.18, [3.2, 2.8, 2.0], { grav: 5 }); F.shake(0.6); break; }
      case 'footfall': dust(e.x, e.z, 5, 0.4, 1.4, 0.55); break;
      case 'focus': if (e.on) burst([h.x, h.y + 1, h.z], 24, 5, 0.5, 0.1, [3.4, 1.0, 0.5], { grav: -3 }); break;
    }
  };

  // 毎フレーム: パーティクルを進め、GPU へ渡す配列を作る
  F.update = function (dt, time, s, rs, eye, simDt) {
    const R = G.R;
    const h = s.hunter, m = s.mon;
    glows.length = 0;
    // 出す量は 60分の1秒を1として数える（144Hz や 240Hz の画面でも同じ量になる）
    const fk = Math.min(dt * 60, 3);
    const chance = (p) => rnd.next() < p * fk;
    const count = (n) => Math.floor(n * fk + rnd.next());
    // ---- 出しっぱなしの演出 ----
    if (KT.WorldBuild.fire) {
      const f = KT.WorldBuild.fire;
      for (let i = count(2); i > 0; i--) spawn(f[0] + rr(-0.2, 0.2), f[1], f[2] + rr(-0.2, 0.2), rr(-0.2, 0.2), rr(1.4, 2.8), rr(-0.2, 0.2), rr(0.35, 0.7), rr(0.3, 0.5), 0.05, 3.0, 1.2, 0.25, 0, -1, 0.5, 0);
      if (chance(0.15)) spawn(f[0], f[1] + 0.3, f[2], rr(-0.6, 0.6), rr(2, 4), rr(-0.6, 0.6), rr(0.8, 1.6), 0.04, 0.02, 3.4, 1.6, 0.4, 0, -0.3, 0.3, 0.2);
      glows.push([f[0], f[1] + 0.4, f[2], 1.8 + Math.sin(time * 13) * 0.2, 0.9, 0.4, 0.1]);
    }
    ambT += dt;
    if (ambT > 0.06) {
      ambT = 0;
      const a = rr(0, 6.283), d = rr(3, 22);
      const x = eye[0] + Math.sin(a) * d, z = eye[2] + Math.cos(a) * d;
      spawn(x, W.height(x, z) + rr(0.3, 3.5), z, rr(-0.4, 0.4), rr(-0.05, 0.25), rr(-0.4, 0.4), rr(2.5, 5), 0.026, 0.026, 2.4, 1.8, 0.8, 0, 0, 0, 0);
      // 落ち葉（ふちの木から、ときどき）
      if (rnd.next() < 0.35 && R.storm < 0.5) {
        const a2 = rr(0, 6.283), d2 = rr(6, 30);
        const lx = eye[0] + Math.sin(a2) * d2, lz = eye[2] + Math.cos(a2) * d2;
        const warm = rnd.next();
        spawn(lx, W.height(lx, lz) + rr(4, 9), lz, rr(0.6, 1.8), rr(-0.9, -0.3), rr(-0.5, 0.9), rr(5, 8), 0.05, 0.05, 0.75, 0.2 + warm * 0.3, 0.04, 0.95, 0.25, 0.25, 0);
      }
    }
    // 嵐（怒り）のあいだは雨
    if (R.storm > 0.15 && dt > 0) {
      for (let i = count(R.storm * 8); i > 0; i--) {
        const a2 = rr(0, 6.283), d2 = rr(1, 20);
        const x = eye[0] + Math.sin(a2) * d2, z = eye[2] + Math.cos(a2) * d2;
        spawn(x, eye[1] + rr(2, 9), z, 2.5, -24, 1.2, 0.5, 0.016, 0.016, 0.3, 0.38, 0.5, 0, 0, 0, 0.055);
      }
    }
    if (KT.WorldBuild.lantern) { const l = KT.WorldBuild.lantern; glows.push([l[0], l[1], l[2], 0.9 + Math.sin(time * 7) * 0.05, 0.7, 0.4, 0.12]); }
    if (m.state !== 'dead') {
      const ps = s.pose;
      if (m.p.glow > 0.2) {
        if (chance(m.p.glow * 0.9)) {
          const p = V.add(ps.back, [rr(-1.2, 1.2), rr(-0.3, 1.2), rr(-1.6, 1.6)]);
          spawn(p[0], p[1], p[2], rr(-2, 2), rr(0, 4), rr(-2, 2), rr(0.2, 0.5), 0.09, 0.02, 0.8, 2.6, 3.6, 0, 3, 1, 0.25);
        }
        if (chance(m.p.glow * 0.22)) {
          const a = V.add(ps.back, [rr(-0.8, 0.8), rr(0.2, 1.0), rr(-1.4, 1.4)]);
          const bq = V.add(a, [rr(-2, 2), rr(-1.5, 1.2), rr(-2, 2)]);
          bolts.push({ pts: [a, V.add(V.lerp(a, bq, 0.5), [rr(-0.4, 0.4), rr(-0.4, 0.4), rr(-0.4, 0.4)]), bq], t: 0, dur: 0.1, w: 0.06 });
        }
        glows.push([ps.back[0], ps.back[1] + 0.5, ps.back[2], 2.6 * m.p.glow, 0.05, 0.2, 0.3]);
      }
      if (m.rage.on && chance(0.14)) {
        const a = V.add(ps.back, [rr(-0.7, 0.7), rr(0.3, 1.2), rr(-1.5, 1.5)]);
        const bq = V.add(a, [rr(-1.4, 1.4), rr(-0.8, 1.0), rr(-1.6, 1.6)]);
        bolts.push({ pts: [a, V.add(V.lerp(a, bq, 0.5), [rr(-0.3, 0.3), rr(-0.3, 0.3), rr(-0.3, 0.3)]), bq], t: 0, dur: 0.09, w: 0.04 });
      }
      if (m.tiredT > 0 && chance(0.2)) {
        const sn = ps.snout;
        spawn(sn[0], sn[1] - 0.3, sn[2], 0, -0.5, 0, 0.7, 0.07, 0.04, 0.7, 0.8, 0.9, 0.5, 9, 0, 0.3);
      }
      if (m.state === 'atk' && m.atk === 'charge' && m.phase === 1 && chance(0.6)) dust(m.x, m.z, 2, 1.5, 2, 0.8);
    }
    for (let i = 0; i < s.shots.length; i++) {
      const o = s.shots[i];
      const y = W.height(o.x, o.z) + 0.85;
      glows.push([o.x, y, o.z, 1.0 + Math.sin(time * 40 + i) * 0.12, 0.12, 0.5, 0.8]);
      glows.push([o.x, y, o.z, 0.42, 1.6, 2.4, 3.0]);
      if (chance(1)) spawn(o.x + rr(-0.3, 0.3), y + rr(-0.3, 0.3), o.z + rr(-0.3, 0.3), rr(-2, 2), rr(-1, 3), rr(-2, 2), 0.25, 0.1, 0.02, 0.8, 2.6, 3.6, 0, 0, 1, 0.2);
    }
    if (h.state === 'charge') {
      const lv = h.chargeLv;
      const col = lv === 0 ? [1.6, 1.6, 1.4] : lv === 1 ? [3, 2.6, 0.8] : lv === 2 ? [3.4, 1.6, 0.4] : [3.8, 0.9, 0.5];
      const a = rr(0, 6.283), d = rr(1.2, 2.2);
      const px = h.x + Math.sin(a) * d, pz = h.z + Math.cos(a) * d, py = h.y + rr(0.2, 2.2);
      if (chance(1)) spawn(px, py, pz, (h.x - px) * 3.2, (h.y + 1.2 - py) * 3.2, (h.z - pz) * 3.2, 0.3, 0.09, 0.03, col[0], col[1], col[2], 0, 0, 0, 0.15);
      const bl = S.hunterBlades(h)[0];
      const tp = V.mad(bl.g, bl.d, bl.len * 0.7);
      glows.push([tp[0], tp[1], tp[2], 0.5 + lv * 0.35, col[0] * 0.5, col[1] * 0.5, col[2] * 0.5]);
    }
    if (h.focus && chance(0.6)) spawn(h.x + rr(-0.3, 0.3), h.y + rr(0.2, 1.5), h.z + rr(-0.3, 0.3), rr(-0.3, 0.3), rr(1, 2.4), rr(-0.3, 0.3), 0.5, 0.12, 0.02, 3.2, 0.8, 0.3, 0, -1, 0.5, 0.1);
    if (h.art >= 100 && chance(0.3)) spawn(h.x + rr(-0.4, 0.4), h.y + rr(0.1, 1.2), h.z + rr(-0.4, 0.4), 0, rr(0.8, 1.6), 0, 0.6, 0.07, 0.02, 0.8, 2.6, 3.6, 0, 0, 0.5, 0);
    if (h.perfectT > 0) { glows.push([h.x, h.y + 1.1, h.z, 1.3, 0.25, 0.8, 1.2]); }

    // ---- パーティクル ----
    const pd = R.partData;
    let n = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.vy -= p.grav * dt;
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.grav > 5) { const gy = W.height(p.x, p.z) + 0.03; if (p.y < gy) { p.y = gy; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; } }
    }
    for (let i = 0; i < parts.length && n < R.partMax - 40; i++) {
      const p = parts[i];
      const u = p.t / p.life;
      const f = p.a > 0 ? Math.min(1, u * 6) * (1 - u) : 1 - u * u;
      const o = n * 12;
      pd[o] = p.x; pd[o + 1] = p.y; pd[o + 2] = p.z; pd[o + 3] = M.lerp(p.s0, p.s1, u);
      pd[o + 4] = p.r * f; pd[o + 5] = p.g * f; pd[o + 6] = p.b * f; pd[o + 7] = p.a * f;
      pd[o + 8] = p.vx; pd[o + 9] = p.vy; pd[o + 10] = p.vz; pd[o + 11] = p.st;
      n++;
    }
    for (let i = 0; i < glows.length && n < R.partMax; i++) {
      const g = glows[i], o = n * 12;
      pd[o] = g[0]; pd[o + 1] = g[1]; pd[o + 2] = g[2]; pd[o + 3] = g[3];
      pd[o + 4] = g[4]; pd[o + 5] = g[5]; pd[o + 6] = g[6]; pd[o + 7] = 0;
      pd[o + 8] = 0; pd[o + 9] = 0; pd[o + 10] = 0; pd[o + 11] = 0;
      n++;
    }
    R.partN = n;

    // ---- 効果メッシュ ----
    const fx = R.fx;
    fx.reset();
    // 地面の輪
    for (let i = rings.length - 1; i >= 0; i--) {
      const k = rings[i];
      k.t += k.kind === 'warn' ? simDt : dt;
      const u = k.t / k.dur;
      if (u >= 1) { rings.splice(i, 1); continue; }
      const SEG = 36;
      const strip = (r0, r1, c0, c1) => {
        let pa = null, pb = null;
        for (let j = 0; j <= SEG; j++) {
          const a = (j / SEG) * 6.2832, sa = Math.sin(a), ca = Math.cos(a);
          const ax = k.x + sa * r0, az = k.z + ca * r0, bx = k.x + sa * r1, bz = k.z + ca * r1;
          const A = [ax, W.height(ax, az) + 0.12, az], B = [bx, W.height(bx, bz) + 0.12, bz];
          if (pa) fx.quad(pa, pb, B, A, c0, c1, c1, c0);
          pa = A; pb = B;
        }
      };
      if (k.kind === 'warn') {
        const pulse = 0.5 + 0.5 * Math.sin(k.t * 22);
        strip(0, k.r, [0.22, 0.02, 0.01, 0.22], [0.34, 0.04, 0.01, 0.3]);
        strip(0, k.r * u, [0.5, 0.1, 0.02, 0.2], [0.7, 0.16, 0.03, 0.3]);
        strip(k.r - 0.16, k.r, [1.5 + pulse * 0.5, 0.4, 0.08, 0.85], [1.5 + pulse * 0.5, 0.4, 0.08, 0.85]);
      } else {
        const e = M.ease.outCubic(u), f = 1 - u;
        const col = k.kind === 'blue' ? [0.5 * f, 1.8 * f, 3.0 * f, 0] : k.kind === 'gold' ? [3 * f, 2.4 * f, 0.8 * f, 0] : k.kind === 'flash' ? [0.5 * f * f, 1.3 * f * f, 1.8 * f * f, 0] : k.kind === 'roar' ? [0.4 * f, 0.4 * f, 0.4 * f, 0] : [0.4 * f, 0.36 * f, 0.3 * f, 0.2 * f];
        const r1 = k.r * (0.15 + 0.95 * e);
        if (k.kind === 'flash') strip(0, k.r, [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, 0], col);
        else strip(Math.max(0, r1 - 0.25 - k.r * 0.12 * f), r1, [0, 0, 0, 0], col);
      }
    }
    // 雷
    for (let i = bolts.length - 1; i >= 0; i--) {
      const k = bolts[i];
      k.t += dt;
      const u = k.t / k.dur;
      if (u >= 1) { bolts.splice(i, 1); continue; }
      const f = (1 - u) * (0.6 + 0.4 * Math.sin(k.t * 90));
      for (let pass = 0; pass < 2; pass++) {
        const w = k.w * (pass === 0 ? 2.6 : 1);
        const col = pass === 0 ? [0.1 * f, 0.35 * f, 0.6 * f, 0] : [2.4 * f, 3.0 * f, 3.6 * f, 0];
        for (let j = 0; j < k.pts.length - 1; j++) {
          const a = k.pts[j], b = k.pts[j + 1];
          const sd = V.norm(V.cross(V.sub(b, a), V.sub(eye, a)));
          fx.quad(V.mad(a, sd, -w), V.mad(a, sd, w), V.mad(b, sd, w), V.mad(b, sd, -w), col);
        }
      }
    }
    // 剣の軌跡（点は sim の1歩ごとに F.sampleTrail でためる）
    for (let i = 0; i < 2; i++) {
      const tl = trails[i];
      for (let j = tl.length - 1; j >= 0; j--) { tl[j].t += dt; if (tl[j].t > 0.2) tl.splice(j, 1); }
      for (let j = 0; j < tl.length - 1; j++) {
        const p = tl[j], q = tl[j + 1];
        if (p.id !== q.id) continue;
        const fa = Math.pow(1 - p.t / 0.2, 2.5) * 0.36, fb = Math.pow(1 - q.t / 0.2, 2.5) * 0.36;
        const ca = [p.c[0] * fa, p.c[1] * fa, p.c[2] * fa, 0], cb = [q.c[0] * fb, q.c[1] * fb, q.c[2] * fb, 0];
        fx.quad(p.a, p.b, q.b, q.a, [0, 0, 0, 0], ca, cb, [0, 0, 0, 0]);
      }
    }
    F.trauma = Math.max(0, F.trauma - dt * 1.9);
  };

  // sim の1歩ごとに呼ぶ：振っている間の刃の位置をためる
  let trailId = 0, trailOn = false;
  F.sampleTrail = function (s) {
    const h = s.hunter, mv = h.move;
    let active = false, tc = [0.6, 0.9, 1.4];
    if (h.state === 'atk' && mv && s.hitstop <= 0) {
      const t = h.mt, hs = mv.hits;
      active = t >= hs[0].t0 - 0.07 && t <= hs[hs.length - 1].t1 + 0.04;
      if (mv.art) tc = [0.5, 1.8, 2.8];
      else if (h.counter) tc = [2.6, 2.0, 0.6];
      else if (mv.id === 'gsC') tc = h.chargeLv >= 3 ? [3.2, 0.8, 0.4] : h.chargeLv === 2 ? [3.0, 1.5, 0.4] : [2.4, 2.0, 0.8];
      else if (h.focus) tc = [2.4, 0.8, 0.4];
    } else if (h.state === 'atk' && s.hitstop > 0) return;
    if (active && !trailOn) trailId++;
    trailOn = active;
    if (!active) return;
    const blades = S.hunterBlades(h);
    for (let i = 0; i < blades.length; i++) {
      const bl = blades[i];
      if (trails[i].length < 60) trails[i].push({ a: V.mad(bl.g, bl.d, bl.len * 0.3), b: V.mad(bl.g, bl.d, bl.len), t: 0, c: tc, id: trailId });
    }
  };

  // ダメージ数字（2D キャンバス）
  F.drawNums = function (ctx, dt, scale) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = nums.length - 1; i >= 0; i--) {
      const k = nums[i];
      k.t += dt;
      if (k.t > 1.0) { nums.splice(i, 1); continue; }
      const sp = G.project(k.p);
      if (!sp) continue;
      const pop = k.t < 0.12 ? 1.5 - (k.t / 0.12) * 0.5 : 1;
      const size = (k.big ? 44 : k.cls === 2 ? 32 : 26) * pop * scale;
      const y = sp[1] - 26 + k.oy - M.ease.outCubic(Math.min(1, k.t / 0.6)) * 46;
      ctx.globalAlpha = k.t > 0.7 ? 1 - (k.t - 0.7) / 0.3 : 1;
      ctx.font = '900 ' + size.toFixed(0) + 'px "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif';
      ctx.lineWidth = size * 0.22;
      ctx.strokeStyle = 'rgba(10,12,18,0.9)';
      ctx.fillStyle = k.crit ? '#ffe14a' : k.cls === 2 ? '#ffb23c' : k.cls === 0 ? '#aab2bb' : '#ffffff';
      const txt = k.txt + (k.crit ? '!' : '');
      ctx.strokeText(txt, sp[0] + k.ox, y);
      ctx.fillText(txt, sp[0] + k.ox, y);
    }
    ctx.globalAlpha = 1;
  };
})();
