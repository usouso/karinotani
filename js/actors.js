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
    hide: c('#0a111b'), hide2: c('#0d1c28'), dark: c('#030508'), belly: c('#3c4654'), bellyD: c('#222a35'), rage: c('#1c1836'),
    horn: c('#efe6cf'), hornB: c('#5e5443'), claw: c('#e2dac4'), clawB: c('#4a4236'), mouth: c('#5e1420'), tongue: c('#b5434f'), stump: c('#a62b34'),
    cry: c('#1c9fe0'), cryT: c('#a8ecff'), cryDead: c('#3f5a66'), tooth: c('#f4efe0'), spike: c('#1a2330'),
  };

  A.useModels = true;   // Blender で作った武器を使う（?models=0 で、計算の形にもどせる）
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
    const vein = dead ? 0 : 0.11 + glow * 1.25 + (rage ? 0.4 : 0);
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
      return [col[0], col[1], col[2], vein * (1 - bw), bw > 0.01 ? bw : -M.smooth(0.45, 0.8, cu)];
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
      const e = dead ? 0 : broken ? 0.02 : 0.36 + (rage ? 0.2 : 0) + glow * (0.95 + 0.35 * Math.sin(time * 23 + i * 2.1));
      const cc = broken ? MC.cryDead : MC.cry;
      b.cone(base, V.mad(base, dir, len), 0.31, c5(cc, e), broken ? cc : c5(MC.cryT, e * 1.2), 6);
      b.m(MAT.HORN, 0, 0.6);
      for (const sg2 of [-1, 1]) for (const fb of [-1, 1]) {
        const cb = add3(base, side, sg2 * 0.3, fwd, fb * 0.3, up, -0.2);
        b.cone(cb, add3(cb, side, sg2 * 0.2, fwd, fb * 0.2, up, 0.36), 0.16, MC.dark, MC.spike, 4, null, true);
      }
      b.m(MAT.CRYSTAL);
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
      const eS = dead ? 0 : 0.3 + (rage ? 0.2 : 0) + glow * 0.9;
      for (let j = 0; j < 3; j++) {
        const sb = add3(pc, side, sg * (0.3 - j * 0.05), up, 0.42 + (j === 1 ? 0.08 : 0), fwd, 0.3 - j * 0.34);
        const sdir = V.norm(add3([0, 0, 0], side, sg * 0.5, up, 0.75, fwd, -0.85));
        if (k < 2) {
          b.m(MAT.CRYSTAL);
          b.cone(sb, V.mad(sb, sdir, 1.0 - j * 0.16), 0.22, c5(MC.cry, eS), c5(MC.cryT, eS * 1.2), 6);
          b.cone(add3(sb, side, sg * 0.22, up, -0.1, fwd, 0.1), V.mad(sb, V.norm(add3([0, 0, 0], side, sg * 1.0, up, 0.5, fwd, -0.4)), 0.6), 0.14, c5(MC.cry, eS * 0.8), null, 5);
        } else {
          b.m(MAT.HORN, 0, 0.6);
          b.cone(sb, V.mad(sb, sdir, 0.62 - j * 0.1), 0.17, MC.spike, MC.hornB, 6, null, true);
        }
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
        const e = dead ? 0 : 0.34 + glow * 0.95;
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
      const eH = dead ? 0 : 0.16 + (rage ? 0.15 : 0) + glow * 0.8;
      b.m(MAT.CRYSTAL);
      if (m.parts.head.broken) {
        const hx = V.lerp(hb0, hb1, 0.7);
        b.tube([hb0, V.lerp(hb0, hb1, 0.4), hx], [0.24, 0.2, 0.17], { sides: 6, col: c5(MC.cryDead, 0.02), capEnd: true, capEndCol: c5(MC.cry, eH * 0.3) });
        b.cone(hx, add3(hx, hs, sg * 0.1, hu, 0.2, hf, -0.1), 0.1, c5(MC.cry, eH * 0.3), null, 3);
      } else {
        const hp = G.smoothPath([hb0, hb1, hb2, hb3], [0.24, 0.18, 0.115, 0.02], 3);
        b.tube(hp.pts, hp.radii, { sides: 6, col: (i) => c5(G.mixc(MC.cry, MC.cryT, M.sat(i / 8)), eH * (0.6 + 0.6 * M.sat(i / 8))) });
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
      if (front) {
        const eL = dead ? 0 : 0.28 + (rage ? 0.2 : 0) + glow * 0.9;
        b.m(MAT.CRYSTAL);
        b.cone(V.mad(ik.mid, out, 0.2), V.mad(ik.mid, out, 0.95), 0.18, c5(MC.cry, eL), c5(MC.cryT, eL * 1.2), 5);
        const lo = V.lerp(ik.mid, ik.end, 0.5);
        b.cone(V.mad(lo, out, 0.12), add3(lo, out, 0.5, [0, 1, 0], 0.25, fwd, 0), 0.13, c5(MC.cry, eL * 0.8), null, 5);
      } else {
        b.m(MAT.HORN, 0, 0.6);
        b.cone(V.mad(ik.mid, out, 0.2), V.mad(ik.mid, out, 0.72), 0.15, MC.spike, MC.hornB, 5, null, true);
      }
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

  // ================= ハンター（黒いテックウェア。段が上がるとロングコートと光る線）=================
  // tier: 0 パーカー / 1 ＋ベスト / 2 ロングコート / 3 コート＋結晶のさし色 / 4 コート＋光る線とバイザー
  const ARM = [
    { cloth: '#14161b', cloth2: '#22252d', leather: '#0b0c0f', plate: '#2b2f38', trim: '#5a606b', pm: MAT.LEATHER, glow: 0, tier: 0 },
    { cloth: '#121418', cloth2: '#1f2229', leather: '#0b0c0f', plate: '#2e323b', trim: '#6c7380', pm: MAT.LEATHER, glow: 0, tier: 1 },
    { cloth: '#0e1014', cloth2: '#14161b', leather: '#090a0c', plate: '#1d2128', trim: '#7d8794', pm: MAT.METAL, glow: 0.25, tier: 2 },
    { cloth: '#0c0e12', cloth2: '#121419', leather: '#08090b', plate: '#1a1f27', trim: '#9aa8b8', pm: MAT.METAL, glow: 0.6, tier: 3 },
    { cloth: '#0a0b0e', cloth2: '#0f1115', leather: '#070809', plate: '#161b23', trim: '#c2d2e2', pm: MAT.METAL, glow: 1.2, tier: 4 },
  ].map((a) => ({ cloth: c(a.cloth), cloth2: c(a.cloth2), leather: c(a.leather), plate: c(a.plate), trim: c(a.trim), pm: a.pm, glow: a.glow, tier: a.tier }));
  const SKIN = c('#c99a76'), HAIR = c('#0a0a0c'), SOLE = c('#b9bec6'), DARK = [0.006, 0.006, 0.008, 0];
  const LINE = [0.12, 0.75, 1.0];   // 光る線の色

  // ひもの動き（マフラーやコートのすそ）。先頭を anchor にとめ、あとは重さと おくれ で ついてくる
  function chain(arr, anchor, seg, dt, time, back, phase) {
    arr[0] = anchor;
    for (let i = 1; i < arr.length; i++) {
      const q = arr[i];
      q[1] -= 2.4 * dt;
      q[0] += Math.sin(time * 2.6 + i + phase) * 0.12 * dt - back[0] * 0.35 * dt;
      q[2] += Math.cos(time * 2.1 + i * 1.3 + phase) * 0.12 * dt - back[2] * 0.35 * dt;
      const d = V.sub(q, arr[i - 1]);
      const dl = V.len(d) || 1;
      arr[i] = V.mad(arr[i - 1], d, seg / dl);
      const gy = W.height(arr[i][0], arr[i][2]) + 0.04;
      if (arr[i][1] < gy) arr[i][1] = gy;
    }
  }

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
    const sdT = V.norm(V.add(V.mul(sd, Math.cos(twist * 0.8)), V.mul(fw, -Math.sin(twist * 0.8))));
    const fwT = V.norm(V.cross(sdT, td));
    const plateC = c5(ar.plate, 0, 0), trimC = ar.trim;
    const plateMat = () => b.m(ar.pm);
    const lineC = [LINE[0], LINE[1], LINE[2], ar.glow];
    const coat = ar.tier >= 2;

    // ---- 胴（腰〜胸〜首もと）：上着 ----
    b.m(MAT.CLOTH);
    const tsp = G.smoothPath([V.mad(hip, td, -0.1), V.mad(hip, td, 0.05), V.mad(hip, td, 0.24), chest, V.mad(chest, td, 0.1), V.mad(chest, td, 0.17)], [0.14, 0.17, 0.162, 0.2, 0.176, 0.09], 2);
    b.tube(tsp.pts, tsp.radii, { sides: 12, up: sdT, sx: 1.2, sy: 0.82, col: (i) => (i < 3 ? ar.cloth2 : ar.cloth), capStart: true });
    // えり（立てたえり）と、前のファスナー
    b.tube([V.mad(chest, td, 0.13), V.mad(chest, td, 0.235)], [0.125, 0.118], { sides: 10, up: sdT, sx: 1.08, sy: 0.92, col: ar.cloth });
    b.m(MAT.METAL);
    b.box(add3(chest, fwT, 0.168, td, -0.06, sdT, 0), V.mul(sdT, 0.008), V.mul(td, 0.2), V.mul(fwT, 0.004), trimC);
    if (ar.tier >= 1) {
      // ベスト（胸と背の うすい板）と、胸のポーチ
      plateMat();
      b.ellipsoid(add3(chest, fwT, 0.03, td, 0.0, sdT, 0), V.mul(sdT, 0.215), V.mul(fwT, 0.142), V.mul(td, 0.17), plateC, 12, 7);
      b.ellipsoid(add3(chest, fwT, -0.055, td, 0.0, sdT, 0), V.mul(sdT, 0.21), V.mul(fwT, 0.12), V.mul(td, 0.17), plateC, 10, 6);
      b.m(MAT.LEATHER);
      for (const sg of [-1, 1]) b.box(add3(chest, fwT, 0.165, td, -0.07, sdT, sg * 0.09), V.mul(sdT, 0.045), V.mul(td, 0.05), V.mul(fwT, 0.025), ar.leather);
    }
    if (ar.glow > 0) {
      // 光る線（胸のたて線と、肩のよこ線）
      b.m(MAT.PLAIN);
      for (const sg of [-1, 1]) b.box(add3(chest, fwT, 0.178, td, 0.02, sdT, sg * 0.15), V.mul(sdT, 0.006), V.mul(td, 0.09), V.mul(fwT, 0.004), lineC);
      b.box(add3(chest, fwT, -0.178, td, 0.06, sdT, 0), V.mul(sdT, 0.12), V.mul(td, 0.006), V.mul(fwT, 0.004), lineC);
    }
    // 腰のベルト・留め具・小物入れ
    b.m(MAT.LEATHER);
    b.tube([V.mad(hip, td, 0.03), V.mad(hip, td, 0.09)], [0.182, 0.18], { sides: 12, up: sd, sx: 1.2, sy: 0.84, col: ar.leather });
    b.box(add3(hip, sd, -0.2, td, 0.0, fw, -0.05), V.mul(sd, 0.04), V.mul(td, 0.07), V.mul(fw, 0.06), ar.plate);
    b.box(add3(hip, sd, 0.2, td, -0.02, fw, 0.02), V.mul(sd, 0.04), V.mul(td, 0.06), V.mul(fw, 0.055), ar.plate);
    b.m(MAT.METAL);
    b.box(add3(hip, fw, 0.152, td, 0.06, sd, 0), V.mul(sd, 0.035), V.mul(td, 0.028), V.mul(fw, 0.012), trimC);

    // ---- コートのすそ（5本の ひも を面でつなぐ。走るとうしろに なびく）----
    const nC = 5, nR = coat ? 5 : 3, segL = coat ? 0.21 : 0.11;
    if (!R.coat || R.coat.length !== nC || R.coat[0].length !== nR) {
      R.coat = [];
      for (let j = 0; j < nC; j++) { const arr = []; for (let i = 0; i < nR; i++) arr.push([hip[0], hip[1] - i * segL, hip[2]]); R.coat.push(arr); }
    }
    const back = [fw[0], 0, fw[2]];
    for (let j = 0; j < nC; j++) {
      const th = ((j / (nC - 1)) * 2 - 1) * 1.95;
      const dir = V.add(V.mul(fw, -Math.cos(th)), V.mul(sd, Math.sin(th)));
      chain(R.coat[j], add3(hip, dir, 0.19, td, 0.04, sd, 0), segL, dt, time, back, j * 1.7);
      // 足にめりこまないよう、体の軸から外へ出す
      for (let i = 1; i < nR; i++) {
        const q = R.coat[j][i];
        const rx = q[0] - hip[0], rz = q[2] - hip[2];
        const out = rx * dir[0] + rz * dir[2], need = 0.19 + i * (coat ? 0.035 : 0.012);
        if (out < need) { q[0] += dir[0] * (need - out); q[2] += dir[2] * (need - out); }
      }
    }
    b.m(MAT.CLOTH, 0.15);
    b.grid(nR, nC, (i, j) => R.coat[j][i], { center: add3(hip, td, -0.3, fw, 0.3, sd, 0), col: (i) => G.mixc(ar.cloth, [0, 0, 0, 0], 0.15 + 0.2 * (i / (nR - 1))) });
    if (ar.glow > 0 && coat) {
      b.m(MAT.PLAIN);
      for (const j of [0, nC - 1]) for (let i = 1; i < nR - 1; i++) {
        const a0 = R.coat[j][i], a1 = R.coat[j][i + 1];
        b.tube([a0, a1], [0.007, 0.007], { sides: 3, col: lineC });
      }
    }

    // ---- 頭（黒い髪・口もとは黒いマスク）----
    const HP = (f, sv, u) => add3(head, fw, f, sd, sv, upv, u);
    b.m(MAT.SKIN);
    b.capsule(neck, V.mad(head, upv, -0.1), 0.066, 0.062, SKIN, 7);
    b.ellipsoid(HP(0, 0, 0), V.mul(sd, 0.122), V.mul(fw, 0.132), V.mul(upv, 0.138), SKIN, 10, 7);
    b.m(MAT.GLOSS);
    for (const sg of [-1, 1]) {
      b.ellipsoid(HP(0.119, sg * 0.048, 0.03), V.mul(sd, 0.025), V.mul(fw, 0.012), V.mul(upv, 0.013), [0.6, 0.6, 0.58, 0], 6, 4);
      b.ellipsoid(HP(0.127, sg * 0.046, 0.03), V.mul(sd, 0.012), V.mul(fw, 0.008), V.mul(upv, 0.012), DARK, 6, 4);
    }
    b.m(MAT.CLOTH);
    b.ellipsoid(HP(0.028, 0, -0.07), V.mul(sd, 0.127), V.mul(fw, 0.13), V.mul(upv, 0.075), ar.leather, 10, 6);       // マスク
    // 髪：頭をつつむ殻（前は額まで）＋ 前髪と えりあし
    {
      const nu = 7, nv = 15, r = 0.146;
      b.m(MAT.LEATHER, 0, 3);
      b.grid(nu, nv, (i, j) => {
        const th = 2.0 * (i / (nu - 1));
        const o = 1.0 * M.smooth(0.35, 0.95, th);
        const ph = o + (2 * Math.PI - 2 * o) * (j / (nv - 1));
        const sth = Math.sin(th);
        const tuft = 1 + 0.06 * Math.sin(j * 2.3 + i * 1.1);
        return add3(head, fw, Math.cos(ph) * sth * r * 1.08 * tuft - 0.004, sd, Math.sin(ph) * sth * r * tuft, upv, Math.cos(th) * r * 1.04 + 0.014);
      }, { center: head, col: HAIR });
      for (const k of [-1, 0, 1]) b.cone(HP(0.095, k * 0.05, 0.105), HP(0.132, k * 0.066, 0.058), 0.045, HAIR, null, 4, null, true);
    }
    if (ar.tier >= 3) {
      // バイザー（目の高さの、光る細い帯）
      b.m(MAT.PLAIN);
      b.box(HP(0.132, 0, 0.03), V.mul(sd, 0.085), V.mul(upv, ar.tier >= 4 ? 0.016 : 0.01), V.mul(fw, 0.008), [LINE[0], LINE[1], LINE[2], ar.tier >= 4 ? 1.6 : 0.7]);
    }
    {
      // フード（背中におろしている）
      b.m(MAT.CLOTH);
      b.ellipsoid(add3(neck, fw, -0.135, upv, -0.01, sd, 0), V.mul(sd, 0.135), V.mul(fw, 0.08), V.mul(upv, 0.11), G.mixc(ar.cloth, [0.05, 0.055, 0.065, 0], 0.5), 8, 5);
      // ななめがけの ひも（右肩 → 左の腰）と、留め具、腰のうしろのバッグ
      const strapC = c('#343842');
      const s0 = add3(chest, sdT, 0.2, td, 0.16, fwT, 0.0), s1 = add3(hip, sdT, -0.2, td, 0.1, fwT, 0.0);
      const ring = [];
      for (let k = 0; k <= 12; k++) {
        const a = (k / 12) * Math.PI * 2, t = 0.5 - 0.5 * Math.cos(a);
        const cen = V.lerp(s0, s1, t), rx = M.lerp(0.02, 0.0, t);
        ring.push(add3(cen, fwT, Math.sin(a) * 0.185, sdT, rx, td, 0));
      }
      b.m(MAT.LEATHER);
      b.tube(ring, ring.map(() => 0.02), { sides: 4, col: strapC, sx: 1.0, sy: 1.0 });
      b.m(MAT.METAL);
      b.box(add3(V.lerp(s0, s1, 0.35), fwT, 0.19, sdT, 0, td, 0), V.mul(sdT, 0.03), V.mul(td, 0.022), V.mul(fwT, 0.01), trimC);
      b.m(MAT.LEATHER);
      b.box(add3(hip, fw, -0.2, td, 0.05, sd, -0.08), V.mul(sd, 0.1), V.mul(td, 0.065), V.mul(fw, 0.05), strapC);
      b.box(add3(hip, fw, -0.255, td, 0.06, sd, -0.08), V.mul(sd, 0.07), V.mul(td, 0.012), V.mul(fw, 0.006), trimC);
    }

    // 武器（世界座標）
    const blades = S.hunterBlades(h);
    // ---- 腕（そで・こて・手ぶくろ）----
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
      b.sphere(sh, 0.084, ar.cloth, 8, 5);
      b.tube([V.mad(sh, ad, -0.02), V.lerp(sh, ik.mid, 0.5), ik.mid, V.mad(ik.mid, fd, 0.2)], [0.09, 0.082, 0.072, 0.066], { sides: 8, col: ar.cloth });
      plateMat();
      b.tube([V.mad(ik.mid, fd, 0.12), V.mad(ik.mid, fd, 0.2), V.mad(ik.mid, fd, 0.3)], [0.07, 0.074, 0.06], { sides: 8, col: (j) => (j === 2 ? trimC : plateC) });
      if (ar.glow > 0) { b.m(MAT.PLAIN); b.tube([V.mad(ik.mid, fd, 0.17), V.mad(ik.mid, fd, 0.19)], [0.077, 0.077], { sides: 8, col: lineC }); }
      b.m(MAT.LEATHER);
      b.ellipsoid(V.mad(ik.end, fd, 0.01), V.mul(sd, 0.052), V.mul(fd, 0.064), V.mul(V.cross(fd, sd), 0.054), ar.leather, 7, 5);
      if (ar.tier >= 3) {
        // 肩の うすい当て
        plateMat();
        b.ellipsoid(add3(sh, sdT, sg * 0.03, upv, 0.05, fw, 0), V.mul(sdT, 0.105), V.mul(fwT, 0.11), V.mul(upv, 0.045), plateC, 8, 4);
      }
    }
    // ---- 足（カーゴパンツ・すね当て・スニーカー）----
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
      b.tube([hj, V.lerp(hj, ik.mid, 0.5), ik.mid, V.mad(ik.mid, sdir, 0.3), V.mad(ik.end, sdir, -0.06)], [0.13, 0.12, 0.098, 0.092, 0.08], { sides: 9, col: ar.cloth2 });
      // ももの ポケット
      b.box(add3(V.lerp(hj, ik.mid, 0.55), sd, sg * 0.105, fw, 0, upv, 0), V.mul(sd, 0.02), V.mul(V.norm(V.sub(ik.mid, hj)), 0.07), V.mul(fw, 0.06), G.mixc(ar.cloth2, [0, 0, 0, 0], 0.25));
      if (ar.tier >= 1) {
        plateMat();
        b.ellipsoid(V.mad(ik.mid, fw, 0.045), V.mul(sd, 0.066), V.mul(fw, 0.045), V.mul(sdir, 0.08), plateC, 7, 5);
        b.tube([V.mad(ik.mid, sdir, 0.1), V.mad(ik.mid, sdir, 0.2), V.mad(ik.mid, sdir, 0.34)], [0.096, 0.1, 0.088], { sides: 9, col: plateC });
        if (ar.glow > 0) { b.m(MAT.PLAIN); b.box(add3(V.mad(ik.mid, sdir, 0.22), fw, 0.1, sd, 0, upv, 0), V.mul(sd, 0.006), V.mul(sdir, 0.07), V.mul(fw, 0.004), lineC); }
      }
      // スニーカー（白い靴底）
      b.m(MAT.LEATHER);
      b.ellipsoid(add3(ik.end, fw, 0.075, upv, 0.0, sd, 0), V.mul(sd, 0.086), V.mul(fw, 0.165), V.mul(upv, 0.066), ar.leather, 8, 5);
      b.tube([V.mad(ik.end, sdir, -0.1), V.mad(ik.end, sdir, -0.03)], [0.086, 0.09], { sides: 8, col: ar.leather });
      b.ellipsoid(add3(ik.end, fw, 0.075, upv, -0.048, sd, 0), V.mul(sd, 0.088), V.mul(fw, 0.168), V.mul(upv, 0.024), SOLE, 8, 3);
    }

    // ---- 武器：青白く光る結晶の刃 ----
    const wl = h.wlv;
    const swing = st === 'atk' || st === 'charge' ? 0.45 : 0;
    const eB = 0.26 + wl * 0.09 + swing * 0.6;
    const cryA = c5(c('#1784d6'), eB), cryB = c5(MC.cryT, eB * 1.3);
    const metalC = c('#15181d');
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
      const mname = gs ? 'greatsword' : 'dualblade';
      if (A.useModels && G.modelReady(mname)) {
        const z = V.cross(u, bl.d), g = bl.g, d = bl.d;
        G.R.inst.push({ name: mname, m: new Float32Array([u[0], u[1], u[2], 0, d[0], d[1], d[2], 0, z[0], z[1], z[2], 0, g[0], g[1], g[2], 1]), emisK: 0.3 + wl * 0.1 + swing * 0.5 });
        continue;
      }
      if (gs) {
        b.m(MAT.LEATHER, 0, 3);
        b.tube([at(-0.3), at(-0.1), at(0.12), at(0.3)], [0.036, 0.04, 0.04, 0.036], { sides: 7, col: (j) => (j % 2 ? ar.leather : metalC) });
        b.m(MAT.METAL);
        b.sphere(at(-0.34), 0.055, metalC, 7, 5);
        // つば：機械のような黒い台。まん中に光る芯
        b.box(at(0.36), V.mul(u, 0.2), V.mul(bl.d, 0.07), V.mul(nrm, 0.06), metalC);
        b.box(add3(at(0.5), u, -0.16, bl.d, 0, nrm, 0), V.mul(u, 0.06), V.mul(bl.d, 0.1), V.mul(nrm, 0.045), metalC);
        b.m(MAT.PLAIN);
        b.sphere(at(0.36), 0.045, [LINE[0], LINE[1], LINE[2], 0.8 + eB], 6, 4);
        // 背（みね）がわ：黒い金属の わく。ところどころに切りかき
        const L = bl.len - 0.44;
        b.m(MAT.METAL, 0, 0.6);
        b.blade(add3(at(0.44), u, -0.1, nrm, 0, bl.d, 0), bl.d, u, L * 0.9, 0.2, 0.085, metalC, c('#2a2f38'), undefined, [[0, 0.8, 1], [0.08, 1, 1], [0.7, 1, 0.9], [0.9, 0.75, 0.7], [1, 0.1, 0.3]]);
        for (let k = 0; k < 3; k++) b.box(add3(at(0.62 + k * (L * 0.24)), u, -0.2, nrm, 0, bl.d, 0), V.mul(u, 0.022), V.mul(bl.d, 0.07), V.mul(nrm, 0.05), c('#2f343d'));
        // 刃がわ：青く光る結晶（先は とがる）
        b.m(MAT.CRYSTAL);
        b.blade(add3(at(0.44), u, 0.1, nrm, 0, bl.d, 0), bl.d, u, L, 0.26, 0.06, cryA, cryB, undefined, [[0, 0.5, 1], [0.07, 1, 1], [0.6, 1.08, 0.9], [0.86, 0.86, 0.7], [1, 0.02, 0.1]], -0.035);
        // まん中を通る光る芯
        b.m(MAT.PLAIN);
        b.box(add3(at(0.44 + L * 0.42), u, 0.0, nrm, 0, bl.d, 0), V.mul(u, 0.012), V.mul(bl.d, L * 0.4), V.mul(nrm, 0.047), [LINE[0], LINE[1], LINE[2], 0.5 + eB]);
        b.m(MAT.CRYSTAL);
        for (let k = 0; k < 1 + (wl >> 1); k++) {
          const cb = add3(at(0.7 + k * 0.34), u, -0.2, nrm, 0, bl.d, 0);
          b.cone(cb, add3(cb, u, -0.16, bl.d, 0.16, nrm, 0), 0.05, cryA, cryB, 4);
        }
      } else {
        b.m(MAT.LEATHER, 0, 3);
        b.capsule(at(-0.11), at(0.1), 0.03, 0.03, ar.leather, 6);
        b.m(MAT.METAL);
        b.box(at(0.115), V.mul(u, 0.08), V.mul(bl.d, 0.03), V.mul(nrm, 0.04), metalC);
        b.m(MAT.CRYSTAL);
        const prof = [[0, 0.7, 1], [0.1, 1, 1], [0.6, 1.05, 0.9], [0.86, 0.7, 0.6], [1, 0.02, 0.1]];
        b.blade(at(0.13), bl.d, u, bl.len - 0.13, 0.16, 0.05, cryA, cryB, undefined, prof, 0.1);
      }
    }
    b.m(MAT.PLAIN);
    return { head, chest, blades };
  };

  // ================= ねこ（場のふちで見ている。ルールには関係しない）=================
  A.drawCat = function (b, s, time) {
    const cat = KT.WorldBuild && KT.WorldBuild.cat;
    if (!cat) return;
    const m = s.mon;
    const fur = c('#c8822f'), furD = c('#8a521c'), white = c('#e8dcc8');
    const sy = Math.sin(cat.yaw), cy = Math.cos(cat.yaw);
    const P = (lx, ly, lz) => [cat.x + lx * cy + lz * sy, ly, cat.z - lx * sy + lz * cy];
    const breathe = Math.sin(time * 2.2) * 0.004;
    b.m(MAT.LEATHER, 0, 4);
    // すわった体・むね・前足
    b.ellipsoid(P(0, 0.17, -0.06), [0.13 * cy, 0, -0.13 * sy], [0.17 * sy, 0, 0.17 * cy], [0, 0.17 + breathe, 0], fur, 9, 6);
    b.ellipsoid(P(0, 0.27, 0.07), [0.095 * cy, 0, -0.095 * sy], [0.085 * sy, 0, 0.085 * cy], [0, 0.15, 0], white, 8, 5);
    for (const sg of [-1, 1]) b.capsule(P(sg * 0.05, 0.2, 0.12), P(sg * 0.05, 0.03, 0.14), 0.035, 0.03, fur, 6);
    // 頭は雷晶獣の方を向く
    const hy = Math.atan2(m.x - cat.x, m.z - cat.z);
    const dy = M.clamp(M.wrapPi(hy - cat.yaw), -1.2, 1.2) + cat.yaw;
    const hf = [Math.sin(dy), 0, Math.cos(dy)], hs = [Math.cos(dy), 0, -Math.sin(dy)];
    const hc = P(0, 0.47, 0.1);
    b.ellipsoid(hc, V.mul(hs, 0.1), V.mul(hf, 0.09), [0, 0.085, 0], fur, 9, 6);
    b.ellipsoid(add3(hc, hf, 0.07, [0, 1, 0], -0.03, hs, 0), V.mul(hs, 0.045), V.mul(hf, 0.035), [0, 0.03, 0], white, 6, 4);
    for (const sg of [-1, 1]) {
      b.cone(add3(hc, hs, sg * 0.06, [0, 1, 0], 0.06, hf, -0.01), add3(hc, hs, sg * 0.085, [0, 1, 0], 0.15, hf, -0.01), 0.04, furD, fur, 4, null, true);
      b.m(MAT.GLOSS);
      b.sphere(add3(hc, hs, sg * 0.042, [0, 1, 0], 0.012, hf, 0.078), 0.016, [0.5, 0.95, 0.4, 1.2], 5, 3);
      b.m(MAT.LEATHER, 0, 4);
    }
    // しっぽ（ゆっくり ゆれる）
    const tp = [], tr = [];
    for (let i = 0; i <= 5; i++) { const u = i / 5; tp.push(P(-0.12 - u * 0.2 + Math.sin(time * 1.4 + u * 2.5) * 0.06 * u, 0.06 + u * u * 0.22, -0.2 - Math.sin(u * 2.2) * 0.12)); tr.push(0.03 - u * 0.012); }
    b.tube(tp, tr, { sides: 6, col: (i) => (i > 3 ? furD : fur), capEnd: true });
    b.m(MAT.PLAIN);
  };
})();
