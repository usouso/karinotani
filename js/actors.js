// 狩りの谷 — ハンターとモンスターの体を毎フレーム組み立てる（骨なし・手続きアニメ・IK）
// 姿勢は sim（S.monPose / S.hunterBlades）と同じものを使うので、絵と当たり判定はずれない。ここは見た目だけ。
(function () {
  'use strict';
  const KT = globalThis.KT;
  const M = KT.M, V = M.V, G = KT.GL, W = KT.World, S = KT.Sim, MAT = G.MAT;
  const A = (KT.Actors = {});
  const c = G.col;
  const c5 = (col, e, aux) => [col[0], col[1], col[2], e || 0, aux || 0];

  // 2本の骨の IK。hint の方向へひじ・ひざを曲げる
  function ik2(root, target, l1, l2, hint) {
    let d = V.sub(target, root);
    let dl = V.len(d);
    const maxl = (l1 + l2) * 0.998;
    if (dl > maxl) { target = V.mad(root, d, maxl / dl); d = V.sub(target, root); dl = maxl; }
    if (dl < 0.05) { dl = 0.05; d = [0, -0.05, 0]; }
    const dir = V.mul(d, 1 / dl);
    const a = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl);
    const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    let pv = V.sub(hint, V.mul(dir, V.dot(hint, dir)));
    if (V.len(pv) < 0.01) pv = [0, 0, 1];
    pv = V.norm(pv);
    return { mid: V.add(V.mad(root, dir, a), V.mul(pv, hh)), end: target };
  }
  const add3 = (p, a, ka, b2, kb, c2, kc) => [p[0] + a[0] * ka + b2[0] * kb + c2[0] * kc, p[1] + a[1] * ka + b2[1] * kb + c2[1] * kc, p[2] + a[2] * ka + b2[2] * kb + c2[2] * kc];

  // ================= モンスター =================
  const MC = {
    hide: c('#1d3850'), hide2: c('#16404a'), dark: c('#080d14'), belly: c('#b9af8e'), bellyD: c('#6f6852'), rage: c('#3b2f58'),
    horn: c('#efe6cf'), hornB: c('#5e5443'), claw: c('#e2dac4'), clawB: c('#4a4236'), mouth: c('#5e1420'), tongue: c('#b5434f'), stump: c('#a62b34'),
    cry: c('#1fb4dc'), cryT: c('#9eeaf8'), cryDead: c('#3f5a66'), tooth: c('#f4efe0'), spike: c('#1a2330'),
  };

  A.newState = function () {
    return { feet: null, events: [], lastX: 0, lastZ: 0, h: { phase: 0, scarf: null, cape: null, bu: [null, null], bd: [null, null] }, tailPiece: null };
  };

  A.drawMonster = function (b, s, rs, dt, time) {
    const m = s.mon, ps = s.pose, p = m.p;
    const fwd = V.norm(V.sub(ps.chest, ps.hips));
    let up = V.norm(V.sub(ps.back, ps.belly));
    const side = V.norm(V.cross(up, fwd));
    up = V.cross(fwd, side);
    const glow = p.glow;
    const rage = m.rage.on;
    const dead = m.state === 'dead';
    // 体を走る「雷の筋」の強さ（怒り・ためで強く光る）
    const vein = dead ? 0 : 0.045 + glow * 1.25 + (rage ? 0.32 : 0);
    const hide = rage ? G.mixc(MC.hide, MC.rage, 0.55) : MC.hide;
    const hide2 = rage ? G.mixc(MC.hide2, MC.rage, 0.4) : MC.hide2;
    const hideV = c5(hide, vein, 0), darkV = c5(G.mixc(hide, MC.dark, 0.6), vein * 0.6, 0);

    // ---- 胴体と尻尾（1本の管。背は暗く、腹は板）----
    const hdir = V.norm(V.sub(ps.snout, ps.head));
    const pts = [V.mad(ps.head, hdir, -0.2), ps.neck, ps.chest, ps.belly, ps.hips];
    const rad = [0.44, 0.64, 1.02, 1.08, 0.95];
    const tr = [0, 0.6, 0.52, 0.44, 0.36, 0.28, 0.2, 0.09];
    for (let i = 1; i <= ps.tailN; i++) { pts.push(ps.tail[i]); rad.push(tr[i]); }
    const sp = G.smoothPath(pts, rad, 4);
    const colFn = (i, cu) => {
      const bw = M.smooth(-0.12, -0.55, cu), dors = M.smooth(0.25, 0.9, cu);
      let col = G.mixc(hide, MC.dark, dors * 0.78);
      col = G.mixc(col, hide2, (0.5 + 0.5 * Math.sin(i * 0.85)) * 0.5 * (1 - dors));
      col = G.mixc(col, i % 4 < 2 ? MC.belly : G.mixc(MC.belly, MC.bellyD, 0.35), bw);
      return [col[0], col[1], col[2], vein * (1 - bw), bw];
    };
    b.m(MAT.HIDE);
    b.tube(sp.pts, sp.radii, { sides: 18, col: colFn, up, sx: 1.0, sy: 0.94, capEnd: true, capEndCol: ps.tailN < 7 ? MC.stump : MC.dark });

    // ---- 背中の結晶 ----
    const broken = m.parts.back.broken;
    const cl = [0.75, 1.05, 1.4, 1.25, 0.9, 0.62], ct = [0.06, 0.24, 0.42, 0.6, 0.78, 0.93];
    b.m(MAT.CRYSTAL);
    for (let i = 0; i < 6; i++) {
      const t = ct[i];
      const pt = t < 0.5 ? V.lerp(ps.chest, ps.belly, t * 2) : V.lerp(ps.belly, ps.hips, (t - 0.5) * 2);
      const base = V.mad(pt, up, 0.84);
      const jit = (M.hash2(i, 7) - 0.5) * 0.5;
      const dir = V.norm(add3([0, 0, 0], up, 1, fwd, -0.5, side, jit));
      const len = cl[i] * (broken ? 0.3 : 1);
      const e = dead ? 0 : broken ? 0.01 : 0.05 + glow * (0.95 + 0.35 * Math.sin(time * 23 + i * 2.1));
      const cc = broken ? MC.cryDead : MC.cry;
      b.cone(base, V.mad(base, dir, len), 0.31, c5(cc, e), broken ? cc : c5(MC.cryT, e * 1.2), 6);
      for (const sg of [-1, 1]) {
        const b2 = add3(base, side, sg * 0.34, up, -0.12, fwd, 0);
        const d2 = V.norm(add3([0, 0, 0], up, 1, fwd, -0.3, side, sg * 0.75));
        b.cone(b2, V.mad(b2, d2, len * 0.55), 0.2, c5(cc, e * 0.8), null, 5);
        if (!broken) {
          const b3 = add3(base, side, sg * 0.2, up, -0.1, fwd, 0.32);
          b.cone(b3, V.mad(b3, V.norm(add3([0, 0, 0], up, 1, fwd, 0.25, side, sg * 0.4)), len * 0.32), 0.13, c5(cc, e * 0.7), null, 4);
        }
      }
    }
    // ---- 肩と腰：筋肉のふくらみ ＋ うしろ向きのとげ ----
    for (let k = 0; k < 4; k++) {
      const sg = k % 2 === 0 ? 1 : -1;
      const pc = add3(ps.legRoot[k], side, sg * 0.16, up, 0.22, fwd, 0);
      b.m(MAT.HIDE);
      b.ellipsoid(pc, V.mul(side, 0.46), V.mul(fwd, 0.78), V.mul(up, 0.66), (y) => (y > 0.1 ? darkV : hideV), 10, 6);
      b.m(MAT.HORN, 0, 0.6);
      for (let j = 0; j < 3; j++) {
        const sb = add3(pc, side, sg * (0.3 - j * 0.05), up, 0.42 + (j === 1 ? 0.08 : 0), fwd, 0.3 - j * 0.34);
        const sdir = V.norm(add3([0, 0, 0], side, sg * 0.5, up, 0.75, fwd, -0.85));
        b.cone(sb, V.mad(sb, sdir, 0.62 - j * 0.1), 0.17, MC.spike, MC.hornB, 6, null, true);
      }
    }
    // ---- 尻尾のとげ ----
    for (let i = 1; i <= ps.tailN; i++) {
      const tp = ps.tail[i], tprev = ps.tail[i - 1];
      const td = V.norm(V.sub(tp, tprev));
      const tu = V.norm(V.sub([0, 1, 0], V.mul(td, td[1])));
      const bs = V.mad(tp, tu, tr[i] * 0.8);
      b.m(MAT.HORN, 0, 0.6);
      b.cone(bs, add3(bs, tu, 0.46 - i * 0.02, td, 0.3, tu, 0), 0.15, MC.spike, MC.hornB, 5, null, true);
      const sv0 = V.cross(tu, td);
      if (i % 2 === 1) for (const sg of [-1, 1]) {
        const b4 = add3(tp, sv0, sg * tr[i] * 0.85, tu, tr[i] * 0.2, td, 0);
        b.cone(b4, add3(b4, sv0, sg * 0.3, td, 0.3, tu, 0.05), 0.1, MC.spike, MC.hornB, 4, null, true);
      }
      if (i === 7) {
        const e = dead ? 0 : 0.06 + glow * 0.95;
        b.m(MAT.CRYSTAL);
        for (const sg of [-1, 0, 1]) {
          const dd = V.norm(add3([0, 0, 0], td, 1, tu, 0.5 - Math.abs(sg) * 0.2, sv0, sg * 0.6));
          b.cone(V.mad(tp, td, -0.3), V.mad(tp, dd, 0.95 - Math.abs(sg) * 0.25), 0.17, c5(MC.cry, e), c5(MC.cryT, e), 6);
        }
      }
    }

    // ---- 頭 ----
    const hf = hdir;
    let hs = V.cross(up, hf);
    if (V.len(hs) < 0.05) hs = side;
    hs = V.norm(hs);
    const hu = V.cross(hf, hs);
    const H = ps.head;
    const HP = (f, sdv, u) => add3(H, hf, f, hs, sdv, hu, u);
    b.m(MAT.HIDE);
    // 頭がい骨から鼻先まで（上が暗く、下は口の中）
    const hsp = G.smoothPath([HP(-0.78, 0, 0.0), HP(-0.3, 0, 0.04), HP(0.28, 0, 0.06), HP(0.86, 0, -0.02), HP(1.36, 0, -0.1), HP(1.62, 0, -0.17)], [0.36, 0.6, 0.6, 0.43, 0.3, 0.15], 3);
    b.tube(hsp.pts, hsp.radii, { sides: 14, up: hu, sx: 0.78, sy: 1.08, capEnd: true, col: (i, cu) => (cu < -0.55 ? c5(MC.mouth, 0, 1) : cu > 0.2 ? G.mixc(darkV, hideV, M.sat((0.6 - cu) * 2)) : hideV) });
    // ほおの板・まゆの出っぱり
    for (const sg of [-1, 1]) {
      b.ellipsoid(HP(-0.12, sg * 0.56, -0.04), V.mul(hs, 0.13), V.mul(hf, 0.44), V.mul(hu, 0.32), darkV, 8, 5);
      b.ellipsoid(HP(0.4, sg * 0.4, 0.33), V.mul(hs, 0.2), V.mul(hf, 0.36), V.mul(hu, 0.13), darkV, 8, 4);
    }
    // 鼻の角・鼻の穴
    b.m(MAT.HORN, 0, 0.6);
    b.cone(HP(1.0, 0, 0.22), HP(1.22, 0, 0.72), 0.14, MC.hornB, MC.horn, 6, null, true);
    b.m(MAT.PLAIN);
    for (const sg of [-1, 1]) b.sphere(HP(1.5, sg * 0.1, 0.0), 0.04, [0.004, 0.004, 0.006, 0], 5, 3);
    // 下あご
    const jp = HP(0.1, 0, -0.22);
    const ja = p.jaw * 0.6 + 0.06;
    const jd = V.norm(V.add(V.mul(hf, Math.cos(ja)), V.mul(hu, -Math.sin(ja))));
    const jt = V.mad(jp, jd, 1.38);
    b.m(MAT.HIDE);
    b.tube([V.mad(jp, jd, -0.35), jp, V.mad(jp, jd, 0.7), jt], [0.26, 0.4, 0.3, 0.14], { sides: 10, up: hu, sx: 0.55, sy: 1.05, capEnd: true, col: (i, cu) => (cu > 0.3 ? c5(MC.mouth, 0, 1) : c5(MC.belly, 0, 1)) });
    b.m(MAT.PLAIN);
    if (p.jaw > 0.12) {
      const mg = glow * p.jaw;
      const lu0 = V.norm(V.add(V.mul(hu, Math.cos(ja)), V.mul(hf, Math.sin(ja))));
      b.ellipsoid(add3(jp, jd, 0.55, lu0, 0.12, hs, 0), V.mul(hs, 0.2), V.mul(jd, 0.5), V.mul(lu0, 0.06), MC.tongue, 7, 4);
      b.ellipsoid(HP(0.72, 0, -0.3), V.mul(hs, 0.3), V.mul(hf, 0.55), V.mul(hu, 0.14 + p.jaw * 0.12), [MC.mouth[0] + mg * 0.1, MC.mouth[1] + mg * 0.7, MC.mouth[2] + mg * 0.9, mg * 1.2], 7, 4);
    }
    // 歯・目・角
    const lu = V.norm(V.add(V.mul(hu, Math.cos(ja)), V.mul(hf, Math.sin(ja))));
    for (const sg of [-1, 1]) {
      b.m(MAT.HORN, 0, 2);
      for (let k = 0; k < 5; k++) {
        const big = k === 4 ? 1.7 : k === 0 ? 0.8 : 1;
        const tb = HP(0.52 + k * 0.23, sg * (0.33 - k * 0.045), -0.25 - k * 0.022);
        b.cone(tb, add3(tb, hu, -0.24 * big, hf, 0.03, hs, 0), 0.06 * big, MC.tooth, null, 5, null, true);
        if (k < 4) {
          const lb = add3(jp, jd, 0.5 + k * 0.23, hs, sg * (0.25 - k * 0.035), lu, 0);
          b.cone(V.mad(lb, lu, 0.1), V.mad(lb, lu, 0.36 * (k === 3 ? 1.4 : 1)), 0.052, MC.tooth, null, 5, null, true);
        }
      }
      // 目（光る玉 ＋ たての瞳）
      const eo = V.norm(add3([0, 0, 0], hs, sg, hf, 0.55, hu, 0.1));
      const ep = HP(0.5, sg * 0.47, 0.17);
      const ec = dead ? [0.02, 0.02, 0.02, 0] : rage ? [1.0, 0.1, 0.03, 1.7] : [1.0, 0.72, 0.08, 1.0];
      b.m(MAT.GLOSS);
      b.sphere(ep, 0.105, ec, 8, 5);
      b.m(MAT.PLAIN);
      b.ellipsoid(V.mad(ep, eo, 0.09), V.mul(hu, 0.085), V.mul(V.cross(eo, hu), 0.02), V.mul(eo, 0.03), [0.004, 0.004, 0.004, 0], 6, 4);
      // 角（折れると根もとだけ残る）
      const hb0 = HP(-0.15, sg * 0.36, 0.36);
      const hb1 = add3(hb0, hs, sg * 0.5, hu, 0.55, hf, -0.55);
      const hb2 = add3(hb1, hs, sg * 0.15, hu, 0.75, hf, -0.5);
      const hb3 = add3(hb2, hs, -sg * 0.1, hu, 0.6, hf, 0.15);
      b.m(MAT.HORN);
      if (m.parts.head.broken) {
        const hx = V.lerp(hb0, hb1, 0.7);
        b.tube([hb0, V.lerp(hb0, hb1, 0.4), hx], [0.24, 0.2, 0.17], { sides: 8, col: MC.hornB, capEnd: true, capEndCol: MC.horn });
        b.cone(hx, add3(hx, hs, sg * 0.1, hu, 0.2, hf, -0.1), 0.1, MC.horn, null, 3);
      } else {
        const hp = G.smoothPath([hb0, hb1, hb2, hb3], [0.24, 0.18, 0.115, 0.02], 4);
        b.tube(hp.pts, hp.radii, { sides: 8, col: (i) => G.mixc(MC.hornB, MC.horn, M.sat(i / 7)) });
      }
      // えりのとげ
      b.m(MAT.HORN, 0, 0.6);
      for (let k = 0; k < 4; k++) {
        const fb = HP(-0.45 - k * 0.1, sg * (0.47 - k * 0.07), 0.06 + k * 0.15);
        b.cone(fb, add3(fb, hs, sg * 0.36, hu, 0.3, hf, -0.6), 0.12, MC.spike, MC.hornB, 5, null, true);
      }
    }

    // ---- 足（地面に足を置く IK）----
    const sy = Math.sin(m.yaw), cy = Math.cos(m.yaw);
    const rest = [[1.35, 1.75], [-1.35, 1.75], [1.25, -1.45], [-1.25, -1.45]];
    const vx = dt > 0 ? (m.x - rs.lastX) / dt : 0, vz = dt > 0 ? (m.z - rs.lastZ) / dt : 0;
    rs.lastX = m.x; rs.lastZ = m.z;
    if (!rs.feet) {
      rs.feet = rest.map((r) => ({ x: m.x + r[0] * cy + r[1] * sy, z: m.z - r[0] * sy + r[1] * cy, sx: 0, sz: 0, t: -1, dur: 0.2, air: false, lift: 0 }));
    }
    const air = p.yOff > 0.25, rolled = Math.abs(p.roll) > 0.45;
    for (let k = 0; k < 4; k++) {
      const f = rs.feet[k], r = rest[k];
      const sg = k % 2 === 0 ? 1 : -1, front = k < 2;
      const lz = r[1] + (front ? p.lunge * 0.6 : 0);
      const rx = m.x + r[0] * cy + lz * sy, rz = m.z - r[0] * sy + lz * cy;
      let foot;
      if (air || rolled) {
        const fl = rolled ? Math.sin(time * 9 + k * 1.7) * 0.35 : 0;
        foot = ps.L2W(sg * (rolled ? 1.7 : 1.1), rolled ? 0.5 : 0.75, (front ? 1.5 : -1.3) + fl);
        f.air = true; f.t = -1; f.x = rx; f.z = rz; f.lift = 0;
      } else {
        if (f.air) { f.air = false; f.x = rx; f.z = rz; }
        const d = Math.hypot(rx - f.x, rz - f.z);
        if (f.t < 0) {
          const o1 = rs.feet[k === 0 || k === 3 ? 1 : 0], o2 = rs.feet[k === 0 || k === 3 ? 2 : 3];
          if (d > 4.5) { f.x = rx; f.z = rz; }
          else if ((d > 0.85 && o1.t < 0 && o2.t < 0) || d > 2.0) { f.sx = f.x; f.sz = f.z; f.t = 0; f.dur = d > 1.8 ? 0.11 : 0.2; }
        }
        if (f.t >= 0) {
          f.t += dt / f.dur;
          const u = Math.min(1, f.t);
          const tx = rx + vx * 0.1, tz = rz + vz * 0.1;
          f.x = M.lerp(f.sx, tx, u); f.z = M.lerp(f.sz, tz, u);
          f.lift = Math.sin(Math.PI * u) * 0.5;
          if (u >= 1) { f.t = -1; f.lift = 0; if (!dead) rs.events.push({ type: 'footfall', x: f.x, z: f.z }); }
        }
        foot = [f.x, W.height(f.x, f.z) + f.lift + 0.14, f.z];
        if (front && m.state === 'atk' && m.atk === 'claw' && (m.arg > 0 ? 0 : 1) === k) {
          const a = Math.min(1, Math.abs(p.claw) * 1.4);
          let tgt = ps.L2W(m.arg * 1.7, 2.1, 2.9);
          if (m.t > 0.6 && m.t < 0.88 && m.clawPos) tgt = m.clawPos;
          foot = V.lerp(foot, tgt, m.t > 0.6 && m.t < 0.88 ? 1 : a);
        }
      }
      const root = ps.legRoot[k];
      const hint = front ? add3([0, 0.3, 0], fwd, -0.8, side, sg * 0.45, up, 0) : add3([0, 0.25, 0], fwd, 0.9, side, sg * 0.4, up, 0);
      const ankle = V.add(foot, [0, 0.16, 0]);
      const ik = ik2(root, ankle, 1.2, 1.25, hint);
      // もも〜すね（1本のなめらかな管）と ひざの出っぱり
      const out = V.norm(V.sub(ik.mid, V.lerp(root, ik.end, 0.5)));
      b.m(MAT.HIDE);
      const lg = G.smoothPath([root, add3(V.lerp(root, ik.mid, 0.5), out, 0.08, side, sg * 0.06, up, 0), ik.mid, V.lerp(ik.mid, ik.end, 0.55), ik.end], [0.5, 0.48, 0.33, 0.27, 0.21], 2);
      b.tube(lg.pts, lg.radii, { sides: 10, col: (i) => (i > 4 ? G.mixc(hideV, darkV, M.sat((i - 4) / 4)) : hideV) });
      b.m(MAT.HORN, 0, 0.6);
      b.cone(V.mad(ik.mid, out, 0.2), V.mad(ik.mid, out, 0.72), 0.15, MC.spike, MC.hornB, 5, null, true);
      const ff = rolled ? V.norm(V.sub(foot, root)) : fwd;
      const fs = V.norm(V.cross([0, 1, 0], ff));
      b.m(MAT.HIDE);
      b.ellipsoid(V.mad(foot, ff, 0.14), V.mul(fs, 0.34), V.mul(ff, 0.42), [0, 0.2, 0], darkV, 8, 4);
      for (const cs of [-1, 0, 1]) {
        const td = V.norm(add3([0, 0, 0], ff, 1, fs, cs * 0.32, up, 0));
        const t0 = add3(foot, ff, 0.22, fs, cs * 0.17, up, 0);
        const t1 = V.mad(t0, td, 0.36);
        b.m(MAT.HIDE);
        b.capsule(t0, t1, 0.12, 0.1, darkV, 6);
        b.m(MAT.HORN, 0, 1.5);
        b.cone(V.add(t1, [0, 0.03, 0]), V.add(V.mad(t1, td, 0.44), [0, -0.1, 0]), 0.085, MC.clawB, MC.claw, 5, null, true);
      }
    }

    // 切れた尻尾（地面に落ちている）
    const tp = rs.tailPiece;
    if (tp) {
      if (!tp.rest) {
        tp.vy -= 18 * dt;
        tp.x += tp.vx * dt; tp.y += tp.vy * dt; tp.z += tp.vz * dt; tp.spin += dt * 7;
        const gy = W.height(tp.x, tp.z) + 0.3;
        if (tp.y <= gy) { tp.y = gy; tp.rest = true; tp.spin = 1.3; rs.events.push({ type: 'footfall', x: tp.x, z: tp.z }); }
      }
      const tpts = [], trr = [];
      for (let i = 0; i <= 4; i++) {
        const a = tp.yaw + Math.sin(tp.spin + i * 0.5) * 0.35;
        tpts.push([tp.x + Math.sin(a) * i * 0.95, tp.y + (tp.rest ? 0 : Math.sin(tp.spin * 1.3 + i) * 0.3), tp.z + Math.cos(a) * i * 0.95]);
        trr.push(tr[3 + i] || 0.08);
      }
      const tsp = G.smoothPath(tpts, trr, 3);
      b.m(MAT.HIDE);
      b.tube(tsp.pts, tsp.radii, { sides: 12, up: [0, 1, 0], col: (i, cu) => { const bw = M.smooth(-0.12, -0.55, cu); const cc = G.mixc(G.mixc(MC.hide, MC.dark, M.smooth(0.25, 0.9, cu) * 0.78), MC.belly, bw); return [cc[0], cc[1], cc[2], 0, bw]; }, capStart: true, capStartCol: MC.stump });
      const e3 = tpts[4], d3 = V.norm(V.sub(tpts[4], tpts[3]));
      b.m(MAT.CRYSTAL);
      b.cone(V.mad(e3, d3, -0.2), V.mad(e3, d3, 0.9), 0.16, c5(MC.cry, 0.05), c5(MC.cryT, 0.05), 6);
    }
    b.m(MAT.PLAIN);
  };

  // ================= ハンター =================
  // 防具の段ごとの見た目。pm: 板の表面の種類、helm: かぶとの形
  const ARM = [
    { cloth: '#4d5c49', cloth2: '#2f3139', leather: '#4a3222', plate: '#8d877a', trim: '#a48c5c', pm: MAT.LEATHER, glow: 0, helm: 0 },
    { cloth: '#5c4a36', cloth2: '#2e2b29', leather: '#46301f', plate: '#9ea2a8', trim: '#c9b27a', pm: MAT.METAL, glow: 0, helm: 1 },
    { cloth: '#27405a', cloth2: '#1d2a3a', leather: '#33261c', plate: '#1f4664', trim: '#b8c4d0', pm: MAT.HIDE, glow: 0.12, helm: 2 },
    { cloth: '#1f3d58', cloth2: '#182434', leather: '#2a2018', plate: '#1c5078', trim: '#d5dde6', pm: MAT.HIDE, glow: 0.45, helm: 3 },
    { cloth: '#1b212b', cloth2: '#10141b', leather: '#1a1612', plate: '#222c3a', trim: '#e4d9b8', pm: MAT.HIDE, glow: 1.2, helm: 4 },
  ].map((a) => ({ cloth: c(a.cloth), cloth2: c(a.cloth2), leather: c(a.leather), plate: c(a.plate), trim: c(a.trim), pm: a.pm, glow: a.glow, helm: a.helm }));
  ARM[0].plate = c('#4f3622');
  const SKIN = c('#d9a47c'), SCARF = c('#c22a26'), SCARFD = c('#7d1818'), STEEL = c('#aab2ba'), STEELD = c('#5d646c'), EDGE = c('#f2f6fa'), WRAP = c('#3a2a1e'), GOLD = c('#b08a38');
  const BLUEST = c('#2c4f72'), DARK = [0.006, 0.006, 0.008, 0];

  A.drawHunter = function (b, s, rs, dt, time) {
    const h = s.hunter, st = h.state, R = rs.h;
    const ar = ARM[s.cfg.alv || 0];
    const gs = h.weapon === 'gs';
    const spd = Math.hypot(h.vx, h.vz);
    const run = h.runBlend;
    R.phase += spd * dt * 2.9;

    // 状態ごとの体の形
    let crouch = 0, lean = 0, pitch = 0, pv = 0.5, twist = 0;
    if (st === 'idle') { lean = 0.22 * run + (h.sprinting ? 0.15 : 0); crouch = 0.03 * run; }
    else if (st === 'atk') { crouch = 0.1; lean = 0.18; if (h.yOff > 0.3) { crouch = 0; lean = -0.1; } }
    else if (st === 'charge') { crouch = 0.2; lean = 0.25; }
    else if (st === 'guard' || st === 'guardhit') { crouch = 0.17; lean = 0.12; }
    else if (st === 'dodge') { const u = h.t / h.dodgeDur; pitch = Math.PI * 2 * M.ease.inOut(M.sat(u * 1.1)); crouch = 0.4 * Math.sin(Math.PI * M.sat(u)); pv = 0.5; }
    else if (st === 'flinch' || st === 'bounce') { lean = -0.25; crouch = 0.08; }
    else if (st === 'blown') { pitch = -1.25 * M.sat(h.t * 5); pv = 0.8; }
    else if (st === 'down') { pitch = -Math.PI / 2; pv = 0.22; }
    else if (st === 'getup') { pitch = (-Math.PI / 2) * (1 - M.ease.inOut(M.sat(h.t / 0.5))); pv = 0.22; }
    else if (st === 'dead') { pitch = (Math.PI / 2) * M.ease.inOut(M.sat(h.t / 0.9)); pv = 0.22; }
    else if (st === 'roarstun') { crouch = 0.22; lean = 0.3; }
    else if (st === 'item') { lean = -0.05; }
    const wp = h.wp;
    if (gs) twist = M.clamp(M.wrapPi(wp[0][0] * M.DEG) * 0.35, -0.7, 0.7);
    else twist = M.clamp((M.wrapPi(wp[0][0] * M.DEG) + M.wrapPi(wp[1][0] * M.DEG)) * 0.15, -0.6, 0.6);
    if (st === 'idle') twist *= 1 - run * 0.8;

    const yaw = h.yaw + (h.spin || 0);
    const sY = Math.sin(yaw), cY = Math.cos(yaw);
    const sP = Math.sin(pitch), cP = Math.cos(pitch);
    const ox = h.x, oy = h.y + h.yOff, oz = h.z;
    // 体のローカル座標 → 世界
    const P = (lx, ly, lz) => {
      if (pitch !== 0) {
        const dy = ly - pv, dz = lz;
        ly = pv + dy * cP - dz * sP;
        lz = dy * sP + dz * cP;
      }
      return [ox + lx * cY + lz * sY, oy + ly, oz - lx * sY + lz * cY];
    };
    const breath = Math.sin(time * 1.9) * 0.006 * (1 - run);
    const bob = Math.abs(Math.sin(R.phase)) * 0.05 * run;
    const hipY = 0.93 - crouch + bob;
    const sl = Math.sin(lean), clv = Math.cos(lean);
    const hipL = [0, hipY, 0];
    const chestL = [0, hipY + clv * 0.46 + breath, sl * 0.46];
    const neckL = [0, hipY + clv * 0.62 + breath, sl * 0.62];
    const headL = [0, hipY + clv * 0.8 + 0.02 + breath, sl * 0.8 + 0.04];
    const st2 = Math.sin(twist), ct2 = Math.cos(twist);
    const shL = (sg) => [chestL[0] + sg * 0.25 * ct2, chestL[1] + 0.1, chestL[2] - sg * 0.25 * st2];

    const hip = P(hipL[0], hipL[1], hipL[2]), chest = P(chestL[0], chestL[1], chestL[2]), neck = P(neckL[0], neckL[1], neckL[2]), head = P(headL[0], headL[1], headL[2]);
    const fw = V.norm(V.sub(P(0, 1, 1), P(0, 1, 0))), sd = V.norm(V.sub(P(1, 1, 0), P(0, 1, 0))), upv = V.norm(V.sub(P(0, 2, 0), P(0, 1, 0)));
    const td = V.norm(V.sub(chest, hip));
    // 上半身のひねりに合わせた横・前
    const sdT = V.norm(V.add(V.mul(sd, Math.cos(twist * 0.8)), V.mul(fw, -Math.sin(twist * 0.8))));
    const fwT = V.norm(V.cross(sdT, td));
    const plateC = c5(ar.plate, ar.pm === MAT.HIDE ? ar.glow : 0, 0), trimC = ar.trim;
    const plateMat = () => b.m(ar.pm, 0, ar.pm === MAT.HIDE ? 2.4 : 1);

    // ---- 胴（腰〜胸〜首もと）----
    b.m(MAT.CLOTH);
    const tsp = G.smoothPath([V.mad(hip, td, -0.1), V.mad(hip, td, 0.05), V.mad(hip, td, 0.24), chest, V.mad(chest, td, 0.1), V.mad(chest, td, 0.17)], [0.14, 0.168, 0.158, 0.196, 0.172, 0.085], 2);
    b.tube(tsp.pts, tsp.radii, { sides: 12, up: sdT, sx: 1.22, sy: 0.8, col: (i) => (i < 3 ? ar.cloth2 : ar.cloth), capStart: true });
    // 胸当て・背当て
    if (ar.helm === 0) {
      const mc0 = c('#3d2c20'), mc1 = c('#5a4330');
      const top = V.mad(chest, td, 0.165);
      const mr = [0.085, 0.2, 0.285, 0.315], mf = [0.08, 0.135, 0.18, 0.2], mh = [0.02, -0.045, -0.15, -0.27];
      b.m(MAT.CLOTH, 0.25);
      b.grid(4, 17, (i, j) => {
        const ph = ((j % 16) / 16) * Math.PI * 2, cp = Math.cos(ph), sp = Math.sin(ph);
        const wave = 1 + (i / 3) * 0.05 * Math.sin(ph * 5 + 1);
        const drop = mh[i] - (cp < 0 ? -cp * 0.1 * (i / 3) : 0) - (i === 3 ? Math.abs(sp) * 0.03 : 0);
        return add3(top, sdT, sp * mr[i] * wave, fwT, cp * mf[i] * wave, td, drop);
      }, { wrapV: true, center: V.mad(chest, td, -0.1), col: (i) => G.mixc(mc1, mc0, (i / 3) * 0.7) });
    } else {
      plateMat();
      b.ellipsoid(add3(chest, fwT, 0.03, td, 0.0, sdT, 0), V.mul(sdT, 0.225), V.mul(fwT, 0.145), V.mul(td, 0.2), (y) => (y < -0.55 ? trimC : plateC), 12, 7);
      b.ellipsoid(add3(chest, fwT, -0.06, td, -0.01, sdT, 0), V.mul(sdT, 0.225), V.mul(fwT, 0.12), V.mul(td, 0.18), plateC, 10, 6);
    }
    if (ar.helm >= 2) {
      // 胸のまんなかの結晶
      b.m(MAT.CRYSTAL);
      const cp = add3(chest, fwT, 0.19, td, 0.02, sdT, 0);
      b.cone(V.mad(cp, td, -0.06), V.mad(cp, td, 0.07), 0.04, c5(MC.cry, 0.3 + ar.glow), c5(MC.cryT, 0.3 + ar.glow), 4);
    }
    // 腰のベルト・留め具・小物入れ
    b.m(MAT.LEATHER);
    b.tube([V.mad(hip, td, 0.03), V.mad(hip, td, 0.1)], [0.182, 0.18], { sides: 12, up: sd, sx: 1.2, sy: 0.84, col: ar.leather });
    b.box(add3(hip, sd, -0.2, td, 0.02, fw, -0.06), V.mul(sd, 0.035), V.mul(td, 0.06), V.mul(fw, 0.06), ar.leather);
    b.box(add3(hip, sd, 0.13, td, 0.0, fw, -0.14), V.mul(sd, 0.06), V.mul(td, 0.055), V.mul(fw, 0.035), G.mixc(ar.leather, [0, 0, 0, 0], 0.3));
    b.m(MAT.METAL);
    b.box(add3(hip, fw, 0.152, td, 0.065, sd, 0), V.mul(sd, 0.04), V.mul(td, 0.035), V.mul(fw, 0.012), GOLD);
    // 腰の板（前・横・後ろにさがる）
    plateMat();
    for (const ang of [-0.62, 0.62, -1.6, 1.6, -2.55, 2.55]) {
      const dir = V.add(V.mul(fw, Math.cos(ang)), V.mul(sd, Math.sin(ang)));
      const tan = V.add(V.mul(fw, -Math.sin(ang)), V.mul(sd, Math.cos(ang)));
      const side2 = Math.abs(ang) > 1 && Math.abs(ang) < 2;
      const wd = side2 ? 0.1 : 0.082, lenT = side2 ? 0.3 : 0.26;
      const top = add3(hip, dir, side2 ? 0.19 : 0.16, td, 0.02, tan, 0);
      const dn = V.norm(add3([0, 0, 0], td, -1, dir, 0.3 + run * 0.1, tan, 0));
      b.grid(4, 3, (i, j) => {
        const t = i / 3, w2 = wd * (i === 3 ? 0.12 : 1 - t * 0.25);
        return add3(V.mad(top, dn, t * lenT), tan, (j - 1) * w2, dir, -Math.abs(j - 1) * 0.022 + Math.sin(t * 3.1) * 0.012, td, 0);
      }, { center: V.mad(hip, td, -0.12), col: (i, j) => (i === 3 || j !== 1 ? (i === 3 ? trimC : G.mixc(plateC, trimC, 0.25)) : plateC) });
    }
    // 前と後ろの たれ布（走るとゆれる）
    const sway = Math.sin(R.phase * 2) * 0.05 * run + 0.03 * run;
    b.m(MAT.CLOTH, 0.3);
    b.grid(4, 3, (i, j) => add3(hip, fw, 0.158 + i * (0.012 + sway * 0.5) - Math.abs(j - 1) * 0.03, td, 0.0 - i * 0.13, sd, (j - 1) * (0.075 - i * 0.008)), { col: (i) => G.mixc(SCARF, SCARFD, i / 3) });
    b.grid(5, 3, (i, j) => add3(hip, fw, -0.148 - i * (0.02 + run * 0.045) + Math.abs(j - 1) * 0.03, td, 0.0 - i * 0.13, sd, (j - 1) * (0.09 + i * 0.012)), { col: (i) => G.mixc(ar.cloth2, G.mixc(ar.cloth2, [0, 0, 0, 0], 0.4), i / 4) });

    // ---- 頭 ----
    const HP = (f, sv, u) => add3(head, fw, f, sd, sv, upv, u);
    // 首
    b.m(MAT.CLOTH);
    b.capsule(neck, V.mad(head, upv, -0.1), 0.07, 0.066, ar.helm >= 2 ? ar.cloth2 : SKIN, 7);
    const shell = (r, th0, th1, open, col, back, brim) => {
      // 頭をつつむ殻。th: 上からの角度、open: 顔の前をあける幅（ラジアン）、brim: 前のふちを出す長さ
      const nu = 7, nv = 15;
      b.grid(nu, nv, (i, j) => {
        const th = th0 + (th1 - th0) * (i / (nu - 1));
        const o = open * M.smooth(0.3, 0.95, th);
        const ph = o + (2 * Math.PI - 2 * o) * (j / (nv - 1));
        const sth = Math.sin(th);
        const edge = Math.max(0, 1 - Math.min(j, nv - 1 - j) / 2) * M.smooth(0.3, 0.95, th) + (open > 0 ? M.sat(1 - th / 0.9) * M.sat(Math.cos(ph)) * 0.6 : 0);
        return add3(head, fw, Math.cos(ph) * sth * r * 1.06 - (back || 0) + (brim || 0) * edge, sd, Math.sin(ph) * sth * r, upv, Math.cos(th) * r + 0.012);
      }, { center: head, col });
    };
    // おわん形の板（肩当てなど）。axis: ふくらむ向き、e1: 板の横の向き
    const dome = (cen, axis, e1, r, thMax, sq) => {
      const e2 = V.norm(V.cross(axis, e1)), e1b = V.cross(e2, axis);
      const nu = 5, nv = 13;
      plateMat();
      b.grid(nu, nv, (i, j) => {
        const th = 0.04 + (thMax - 0.04) * (i / (nu - 1)), ph = ((j % (nv - 1)) / (nv - 1)) * Math.PI * 2;
        const sth = Math.sin(th) * r;
        return add3(cen, axis, Math.cos(th) * r * sq, e1b, Math.cos(ph) * sth, e2, Math.sin(ph) * sth);
      }, { wrapV: true, center: cen, col: (i) => (i === nu - 1 ? trimC : plateC) });
    };
    if (ar.helm <= 1) {
      // 顔（目だけ見える。口もとは布でかくす）
      b.m(MAT.SKIN);
      b.ellipsoid(HP(0, 0, 0), V.mul(sd, 0.128), V.mul(fw, 0.136), V.mul(upv, 0.14), G.mixc(SKIN, [0, 0, 0, 0], 0.18), 10, 7);
      b.m(MAT.GLOSS);
      for (const sg of [-1, 1]) {
        b.ellipsoid(HP(0.123, sg * 0.05, 0.03), V.mul(sd, 0.027), V.mul(fw, 0.012), V.mul(upv, 0.015), [0.75, 0.74, 0.7, 0], 6, 4);
        b.ellipsoid(HP(0.131, sg * 0.047, 0.03), V.mul(sd, 0.013), V.mul(fw, 0.008), V.mul(upv, 0.014), DARK, 6, 4);
      }
      b.m(MAT.CLOTH, 0.2);
      b.ellipsoid(HP(0.03, 0, -0.07), V.mul(sd, 0.132), V.mul(fw, 0.134), V.mul(upv, 0.078), SCARF, 10, 6);
      if (ar.helm === 0) {
        // ずきん
        b.m(MAT.CLOTH);
        shell(0.166, 0.0, 2.35, 0.68, (i) => G.mixc(ar.leather, [0, 0, 0, 0], 0.15 + 0.2 * (i / 6)), 0.0, 0.03);
        // ずきんの内がわ（すき間から向こうが見えないように）
        b.ellipsoid(HP(-0.03, 0, 0.012), V.mul(sd, 0.152), V.mul(fw, 0.15), V.mul(upv, 0.158), G.mixc(ar.leather, [0, 0, 0, 0], 0.55), 10, 7);
      } else {
        // 鉄のかぶと＋鼻あて＋革のたれ
        b.m(MAT.LEATHER);
        shell(0.152, 1.3, 2.4, 1.05, ar.leather, 0.01);
        b.m(MAT.METAL);
        shell(0.158, 0.0, 1.42, 0.0, (i) => (i === 6 ? c5(ar.trim) : c5(ar.plate)));
        b.box(HP(0.158, 0, 0.03), V.mul(sd, 0.014), V.mul(upv, 0.06), V.mul(fw, 0.012), ar.plate);
        b.cone(HP(0, 0, 0.155), HP(-0.04, 0, 0.26), 0.032, ar.trim, null, 5, null, true);
      }
    } else {
      // 雷晶獣の素材でつくった かぶと（顔はすっぽり かくれる）
      plateMat();
      b.ellipsoid(HP(-0.005, 0, 0.012), V.mul(sd, 0.164), V.mul(fw, 0.182), V.mul(upv, 0.172), plateC, 12, 8);
      b.m(MAT.METAL);
      b.ellipsoid(HP(0.105, 0, -0.07), V.mul(sd, 0.1), V.mul(fw, 0.11), V.mul(upv, 0.08), trimC, 9, 5);          // 口もとの板
      b.ellipsoid(HP(-0.01, 0, 0.15), V.mul(sd, 0.024), V.mul(fw, 0.17), V.mul(upv, 0.05), trimC, 6, 5);          // とさか
      b.m(MAT.PLAIN);
      const vg = ar.helm >= 4 ? [0.1, 0.85, 1.0, 1.6] : ar.helm >= 3 ? [0.05, 0.3, 0.4, 0.5] : DARK;
      b.box(HP(0.168, 0, 0.022), V.mul(sd, 0.09), V.mul(upv, 0.016), V.mul(fw, 0.014), vg);                        // のぞき穴
      // 角（素材の角）と結晶の冠
      for (const sg of [-1, 1]) {
        b.m(MAT.HORN, 0, 2.5);
        const k = ar.helm >= 3 ? 1.35 : 1;
        const h0 = HP(0.02, sg * 0.14, 0.09), h1 = HP(-0.08 * k, sg * 0.24 * k, 0.17 * k), h2 = HP(-0.2 * k, sg * 0.25 * k, 0.3 * k);
        const hp = G.smoothPath([h0, h1, h2], [0.045, 0.034, 0.006], 3);
        b.tube(hp.pts, hp.radii, { sides: 6, col: (i) => G.mixc(MC.hornB, MC.horn, M.sat(i / 5)) });
        if (ar.helm >= 4) {
          b.m(MAT.CRYSTAL);
          b.cone(HP(-0.06, sg * 0.07, 0.15), HP(-0.14, sg * 0.1, 0.33), 0.035, c5(MC.cry, 0.9), c5(MC.cryT, 1.0), 4);
        }
      }
      if (ar.helm >= 3) { b.m(MAT.CRYSTAL); b.cone(HP(-0.02, 0, 0.17), HP(-0.1, 0, 0.36 + (ar.helm - 3) * 0.05), 0.04, c5(MC.cry, 0.5 + ar.glow * 0.4), c5(MC.cryT, 0.6 + ar.glow * 0.4), 4); }
    }

    // 武器（世界座標）
    const blades = S.hunterBlades(h);
    // ---- 腕 ----
    for (let i = 0; i < 2; i++) {
      const sg = i === 0 ? 1 : -1;
      const l = shL(sg);
      const sh = P(l[0], l[1], l[2]);
      let hand;
      if (gs) hand = i === 0 ? V.mad(blades[0].g, blades[0].d, 0.12) : V.mad(blades[0].g, blades[0].d, -0.1);
      else hand = blades[i].g;
      if (st === 'roarstun') hand = add3(head, sd, sg * 0.19, fw, 0.02, upv, 0);
      else if (st === 'item' && i === 1 && gs) hand = add3(head, fw, 0.2, upv, -0.05 + Math.sin(h.t * 9) * 0.02, sd, 0);
      else if ((st === 'down' || st === 'dead' || st === 'blown') && !(gs && i === 0)) hand = add3(sh, sd, sg * 0.5, upv, -0.2, fw, 0);
      const hint = add3([0, 0, 0], sd, sg * 0.6, upv, -0.8, fw, -0.4);
      const ik = ik2(sh, hand, 0.33, 0.33, hint);
      const ad = V.norm(V.sub(ik.mid, sh)), fd = V.norm(V.sub(ik.end, ik.mid));
      b.m(MAT.CLOTH);
      b.tube([V.mad(sh, ad, -0.03), V.lerp(sh, ik.mid, 0.5), ik.mid], [0.08, 0.072, 0.06], { sides: 8, col: ar.cloth });
      // 前腕の こて
      plateMat();
      b.tube([V.mad(ik.mid, fd, -0.02), V.mad(ik.mid, fd, 0.07), V.mad(ik.mid, fd, 0.24), V.mad(ik.mid, fd, 0.3)], [0.058, 0.078, 0.066, 0.054], { sides: 8, col: (j) => (j === 3 ? trimC : plateC) });
      b.sphere(ik.mid, 0.064, ar.helm >= 1 ? plateC : c5(ar.leather), 7, 5);
      b.m(MAT.LEATHER);
      b.ellipsoid(V.mad(ik.end, fd, 0.01), V.mul(sd, 0.052), V.mul(fd, 0.064), V.mul(V.cross(fd, sd), 0.054), G.mixc(ar.leather, [0, 0, 0, 0], 0.35), 7, 5);
      // 肩当て（2枚重ね）
      plateMat();
      const out = V.mul(sdT, sg);
      if (ar.helm >= 1) {
        dome(add3(sh, out, -0.01, upv, -0.015, fw, 0), V.norm(add3([0, 0, 0], out, 0.72, upv, 0.7, fw, 0)), fwT, 0.135, 1.5, 0.82);
        dome(add3(V.lerp(sh, ik.mid, 0.3), out, -0.01, upv, 0, fw, 0), V.norm(add3([0, 0, 0], out, 1, upv, 0.25, fw, 0)), fwT, 0.11, 1.35, 0.8);
      }
      if (ar.helm >= 2) {
        b.m(MAT.HORN, 0, 2.5);
        b.cone(add3(sh, out, 0.1, upv, 0.12, fw, 0), add3(sh, out, 0.24, upv, 0.27 + (ar.helm - 2) * 0.04, fw, -0.05), 0.05, MC.hornB, MC.horn, 5, null, true);
      }
    }
    // ---- 足 ----
    for (let i = 0; i < 2; i++) {
      const sg = i === 0 ? 1 : -1;
      const hj = P(sg * 0.13, hipY, 0);
      let fl;
      if (st === 'dodge') fl = [sg * 0.13, hipY - 0.42, 0.22];
      else if (h.yOff > 0.25 && st === 'atk') fl = [sg * 0.15, 0.3, -0.3 + i * 0.25];
      else if (st === 'idle' && run > 0.02) {
        const ph = R.phase + i * Math.PI;
        const amp = 0.42 * run * (h.sprinting ? 1.2 : 1);
        const idleF = [sg * 0.17, 0, -sg * 0.05];
        fl = [sg * 0.13, Math.max(0, Math.cos(ph)) * 0.3 * run, Math.sin(ph) * amp];
        fl = V.lerp(idleF, fl, M.sat(run * 1.5));
      } else if (st === 'atk' || st === 'charge' || st === 'guard' || st === 'guardhit' || st === 'bounce') fl = i === 0 ? [0.2, 0, 0.36] : [-0.2, 0, -0.32];
      else if (st === 'down' || st === 'dead' || st === 'blown' || st === 'getup') fl = [sg * 0.2, 0.02, i * 0.1];
      else fl = [sg * 0.17, 0, -sg * 0.05];
      const foot = P(fl[0], fl[1] + 0.07, fl[2]);
      if (pitch === 0 && h.yOff < 0.05) foot[1] = Math.max(foot[1], W.height(foot[0], foot[2]) + 0.07);
      const ik = ik2(hj, foot, 0.46, 0.47, V.add(fw, V.mul(sd, sg * 0.15)));
      const sdir = V.norm(V.sub(ik.end, ik.mid));
      b.m(MAT.CLOTH);
      b.tube([hj, V.lerp(hj, ik.mid, 0.5), ik.mid], [0.128, 0.116, 0.09], { sides: 9, col: ar.cloth2 });
      // すね当て・ひざ当て
      plateMat();
      b.tube([V.mad(ik.mid, sdir, -0.02), V.mad(ik.mid, sdir, 0.12), V.mad(ik.mid, sdir, 0.34), ik.end], [0.086, 0.102, 0.082, 0.072], { sides: 9, col: (j) => (j === 0 ? trimC : plateC) });
      b.ellipsoid(V.mad(ik.mid, fw, 0.04), V.mul(sd, 0.068), V.mul(fw, 0.05), V.mul(sdir, 0.082), ar.helm >= 1 ? trimC : plateC, 7, 5);
      // くつ
      b.m(MAT.LEATHER);
      const bootC = G.mixc(ar.leather, [0, 0, 0, 0], 0.4);
      b.ellipsoid(add3(ik.end, fw, 0.075, upv, -0.01, sd, 0), V.mul(sd, 0.088), V.mul(fw, 0.165), V.mul(upv, 0.07), bootC, 8, 5);
      b.tube([V.mad(ik.end, sdir, -0.1), V.mad(ik.end, sdir, -0.03)], [0.09, 0.094], { sides: 8, col: G.mixc(ar.leather, [0, 0, 0, 0], 0.2) });
      if (ar.helm >= 1) { plateMat(); b.ellipsoid(add3(ik.end, fw, 0.17, upv, 0.0, sd, 0), V.mul(sd, 0.075), V.mul(fw, 0.075), V.mul(upv, 0.062), plateC, 7, 4); }
    }

    // ---- 武器 ----
    const wl = h.wlv, wg = wl >= 4 ? 1.0 : wl >= 2 ? 0.35 : 0;
    const spine = wl >= 2 ? G.mixc(BLUEST, STEELD, wl >= 4 ? 0.0 : 0.4) : STEELD;
    const flat = wl >= 2 ? G.mixc(STEEL, c('#7fb0d8'), 0.55) : STEEL;
    const edge = [EDGE[0], EDGE[1] + wg * 0.1, EDGE[2] + wg * 0.2, wg * 0.7];
    const guardC = wl >= 2 ? c('#c9d2da') : GOLD;
    for (let i = 0; i < blades.length; i++) {
      const bl = blades[i];
      // 刃の向き（振っている方向に刃を向ける）
      let u = R.bu[i];
      const pd = R.bd[i];
      if (pd) {
        const dv = V.sub(bl.d, pd);
        if (V.len(dv) > 0.02) u = V.norm(dv);
      }
      if (!u) u = upv;
      u = V.sub(u, V.mul(bl.d, V.dot(u, bl.d)));
      if (V.len(u) < 0.05) u = V.cross(bl.d, sd);
      u = V.norm(u);
      R.bu[i] = u; R.bd[i] = bl.d;
      const nrm = V.cross(bl.d, u);
      const at = (t) => V.mad(bl.g, bl.d, t);
      if (gs) {
        // 大剣：柄・つば・幅広の刃（しのぎは暗く、刃先は明るい）
        b.m(MAT.LEATHER, 0, 3);
        b.tube([at(-0.3), at(-0.1), at(0.12), at(0.3)], [0.036, 0.04, 0.04, 0.036], { sides: 7, col: (j) => (j % 2 ? WRAP : G.mixc(WRAP, [0, 0, 0, 0], 0.4)) });
        b.m(MAT.METAL);
        b.sphere(at(-0.34), 0.062, guardC, 7, 5);
        b.ellipsoid(at(0.335), V.mul(u, 0.21), V.mul(bl.d, 0.034), V.mul(nrm, 0.05), guardC, 10, 5);
        b.box(at(0.4), V.mul(u, 0.1), V.mul(bl.d, 0.05), V.mul(nrm, 0.05), STEELD);
        b.m(MAT.METAL, 0, 0.6);
        const prof = [[0, 0.5, 1], [0.05, 0.92, 1], [0.12, 1, 1], [0.55, 1.04, 0.95], [0.84, 1.1, 0.85], [0.94, 0.68, 0.55], [1, 0.02, 0.1]];
        b.blade(at(0.42), bl.d, u, bl.len - 0.42, 0.4, 0.075, G.mixc(flat, spine, 0.55), edge, undefined, prof);
        if (wl >= 2) {
          b.m(MAT.CRYSTAL);
          for (let k = 0; k < (wl >= 4 ? 4 : 2); k++) {
            const cb = add3(at(0.6 + k * 0.27), u, -0.17, nrm, 0, bl.d, 0);
            b.cone(cb, add3(cb, u, -0.2, bl.d, 0.14, nrm, 0), 0.055, c5(MC.cry, 0.3 + wg), c5(MC.cryT, 0.4 + wg), 4);
          }
        }
      } else {
        // 双剣：そりのある短い刃
        b.m(MAT.LEATHER, 0, 3);
        b.capsule(at(-0.11), at(0.1), 0.03, 0.03, WRAP, 6);
        b.m(MAT.METAL);
        b.ellipsoid(at(0.115), V.mul(u, 0.085), V.mul(bl.d, 0.02), V.mul(nrm, 0.05), guardC, 7, 4);
        b.sphere(at(-0.13), 0.035, guardC, 6, 4);
        b.m(MAT.METAL, 0, 0.6);
        const prof = [[0, 0.7, 1], [0.1, 1, 1], [0.6, 1.05, 0.9], [0.86, 0.7, 0.6], [1, 0.02, 0.1]];
        b.blade(at(0.13), bl.d, u, bl.len - 0.13, 0.15, 0.04, G.mixc(flat, spine, 0.55), edge, undefined, prof, 0.1);
        if (wl >= 2) { b.m(MAT.CRYSTAL); b.cone(at(-0.15), at(-0.26), 0.03, c5(MC.cry, 0.3 + wg), c5(MC.cryT, 0.4 + wg), 4); }
      }
    }
    // ---- マフラー（うしろになびく。2本）----
    const anchor = add3(neck, fw, -0.12, upv, 0.05, sd, 0);
    if (!R.scarf) { R.scarf = []; for (let i = 0; i < 8; i++) R.scarf.push(V.mad(anchor, fw, -0.15 * i)); }
    const sc = R.scarf;
    sc[0] = anchor;
    for (let i = 1; i < sc.length; i++) {
      const q = sc[i];
      q[1] -= 1.6 * dt;
      q[0] += Math.sin(time * 3 + i) * 0.25 * dt - fw[0] * 0.5 * dt;
      q[2] += Math.cos(time * 2.3 + i * 1.3) * 0.25 * dt - fw[2] * 0.5 * dt;
      const d = V.sub(q, sc[i - 1]);
      const dl = V.len(d) || 1;
      const seg = 0.15;
      sc[i] = V.mad(sc[i - 1], d, seg / dl);
      const gy = W.height(sc[i][0], sc[i][2]) + 0.05;
      if (sc[i][1] < gy) sc[i][1] = gy;
    }
    b.m(MAT.CLOTH, 0.5);
    b.tube(sc, [0.1, 0.105, 0.1, 0.095, 0.09, 0.08, 0.07, 0.05], { sides: 6, col: (i) => G.mixc(SCARF, SCARFD, (i % 2) * 0.35), sx: 0.22, sy: 1.0 });
    const sc2 = sc.slice(0, 6).map((q, i) => add3(q, sd, 0.05 * Math.min(i, 2), upv, -0.03 * i - Math.sin(time * 2.6 + i) * 0.01 * i, fw, 0));
    b.tube(sc2, [0.08, 0.085, 0.08, 0.075, 0.065, 0.04], { sides: 6, col: SCARFD, sx: 0.22, sy: 1.0 });
    b.tube([add3(neck, upv, 0.0, fw, 0, sd, 0), add3(neck, upv, 0.075, fw, 0.01, sd, 0)], [0.118, 0.11], { sides: 9, col: SCARF, capEnd: false });
    b.m(MAT.PLAIN);
    return { head, chest, blades };
  };
})();
