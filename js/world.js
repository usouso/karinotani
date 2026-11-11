// 狩りの谷 — 地形・岩・木・草・花・キャンプ（すべて手続き生成。ルールには関係しない見た目だけ）
(function () {
  'use strict';
  const KT = globalThis.KT;
  const M = KT.M, V = M.V, G = KT.GL, W = KT.World, MAT = G.MAT;
  const WB = (KT.WorldBuild = {});

  W.dirt = function (x, z) {
    const r = Math.hypot(x, z);
    let d = M.fbm(x * 0.07 + 3.1, z * 0.07 + 9.4, 3);
    d = M.smooth(0.56, 0.66, d);
    // キャンプのまわりは土
    d = Math.max(d, 1 - M.smooth(3, 7, Math.hypot(x - W.camp[0], z - W.camp[1] + 3)));
    return d * (1 - M.smooth(W.R + 2, W.R + 10, r));
  };

  function normalAt(x, z) {
    const e = 0.6;
    const hx = W.height(x + e, z) - W.height(x - e, z), hz = W.height(x, z + e) - W.height(x, z - e);
    return V.norm([-hx, 2 * e, -hz]);
  }
  // 3方向に広がる でこぼこ（2Dのノイズを斜めに重ねる）
  const n3 = (x, y, z) => M.fbm(x + y * 0.71 + 13.7, z - y * 0.53 + 4.1, 3);
  const c5 = (c, aux) => [c[0], c[1], c[2], c[3] || 0, aux];

  WB.build = function () {
    const R = G.R;
    const rng = new M.RNG(20261110);
    // ---- 地形 ----
    const N = 210, EXT = 150;
    const tb = new G.Batch((N + 1) * (N + 1) + 10);
    tb.i = new Uint32Array(N * N * 6);
    tb.m(MAT.GROUND);
    const cG0 = G.col('#2c4a1c'), cG1 = G.col('#4c6a26'), cSnow = G.col('#e8e4dc');
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        // 真ん中ほど細かい格子（ふちの丘はあらくてよい）
        const u = (i / N) * 2 - 1, v = (j / N) * 2 - 1;
        const x = EXT * (u * 0.55 + u * u * u * 0.45), z = EXT * (v * 0.55 + v * v * v * 0.45);
        const y = W.height(x, z);
        const n = normalAt(x, z);
        const slope = 1 - n[1];
        const r = Math.hypot(x, z);
        const nz = M.fbm(x * 0.11 + 40, z * 0.11 + 11, 3);
        let c = G.mixc(cG0, cG1, M.smooth(0.3, 0.7, nz));
        c = G.mixc(c, cSnow, M.smooth(40, 50, y));
        const rk = Math.max(M.smooth(0.14, 0.3, slope), M.smooth(W.R + 8, W.R + 26, r) * 0.55);
        const aux = rk > 0.02 ? -rk : W.dirt(x, z);
        tb.vert(x, y, z, n[0], n[1], n[2], c5(c, aux));
      }
    }
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
        tb.tri(a, c, b);
        tb.tri(b, c, d);
      }
    G.setTerrain(tb);

    // ---- 小物 ----
    const pb = new G.Batch(520000);
    // 岩：いくつかの面で切り出した かたまりを、でこぼこでくずす。足もとは暗くして地面になじませる
    const rock = (x, z, s, sink, tall) => {
      const big = s > 0.7;
      const gy = W.height(x, z);
      const y0 = gy - s * (sink === undefined ? 0.3 : sink);
      const a = rng.range(0, 6.28), ca = Math.cos(a), sa = Math.sin(a);
      const ex = s * rng.range(0.9, 1.4), ez = s * rng.range(0.75, 1.15), ey = s * rng.range(0.75, 1.25) * (tall || 1);
      const seed = rng.range(0, 90);
      const c0 = G.mixc(G.col('#55514c'), G.col('#8b8275'), rng.next());
      const planes = [];
      const np = big ? 9 : 5;
      for (let k = 0; k < np; k++) {
        const th = Math.acos(rng.range(-0.4, 1)), ph = rng.range(0, 6.28);
        planes.push([Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph), rng.range(0.72, 1.05)]);
      }
      const nu = big ? 10 : 7, nv = big ? 17 : 11;
      pb.m(MAT.ROCK);
      pb.grid(nu, nv, (i, j) => {
        const th = Math.PI * (0.03 + 0.94 * (i / (nu - 1))), ph = ((j % (nv - 1)) / (nv - 1)) * Math.PI * 2;
        const dx = Math.sin(th) * Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.sin(ph);
        let r = 1.35;
        for (let k = 0; k < np; k++) {
          const d = dx * planes[k][0] + dy * planes[k][1] + dz * planes[k][2];
          if (d > 0.08) r = Math.min(r, planes[k][3] / d);
        }
        r *= 0.86 + 0.34 * n3(dx * 1.4 + seed, dy * 1.4, dz * 1.4) + (big ? 0.1 * (n3(dx * 4 + seed, dy * 4, dz * 4) - 0.5) : 0);
        const lx = dx * ex * r, lz = dz * ez * r;
        return [x + lx * ca - lz * sa, y0 + dy * ey * r, z + lx * sa + lz * ca];
      }, { wrapV: true, center: [x, y0, z], col: (i, j, p) => c5(c0, M.sat((p[1] - W.height(p[0], p[2])) / (0.45 * s) + 0.15)) });
    };
    const blob = (c, r, col0, col1, seed, sq) => {
      const nu = 7, nv = 11;
      pb.grid(nu, nv, (i, j) => {
        const th = Math.PI * (0.04 + 0.92 * (i / (nu - 1))), ph = ((j % (nv - 1)) / (nv - 1)) * Math.PI * 2;
        const dx = Math.sin(th) * Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.sin(ph);
        const k = r * (0.72 + 0.56 * n3(dx * 1.6 + seed, dy * 1.6, dz * 1.6));
        return [c[0] + dx * k, c[1] + dy * k * (sq || 0.82), c[2] + dz * k];
      }, { wrapV: true, center: c, col: (i) => { const t = 1 - i / (nu - 1); return c5(G.mixc(col0, col1, t), 0.3 + 0.7 * t); } });
    };
    const BARK = G.col('#3d2c1e'), BARK2 = G.col('#6a6258');
    // 針葉樹：ぎざぎざの すそを何段も重ねる。内がわは暗く、先は明るい
    const pine = (x, z, s) => {
      const y = W.height(x, z);
      const H = 7.6 * s;
      const lx = rng.range(-0.05, 0.05), lz = rng.range(-0.05, 0.05);
      const at = (t) => [x + lx * H * t * t, y - 0.4 + (H + 0.4) * t, z + lz * H * t * t];
      pb.m(MAT.BARK);
      const tp = [], tr = [];
      for (let k = 0; k <= 5; k++) { const t = k / 5; tp.push(at(t * 0.94)); tr.push((0.3 * (1 - t) + 0.035) * s * (k === 0 ? 1.55 : 1)); }
      pb.tube(tp, tr, { sides: 7, col: BARK });
      const tone = rng.next();
      const cIn = G.mixc(G.col('#0c1f14'), G.col('#132a16'), tone);
      const cMid = G.mixc(G.col('#18401f'), G.col('#274f22'), tone);
      const cOut = G.mixc(G.col('#3a6a2c'), G.col('#5c7f30'), tone);
      const nT = Math.round(6 + s * 2.2);
      const lobes = 8, nv = lobes * 2 + 1;
      pb.m(MAT.LEAF);
      for (let k = 0; k < nT; k++) {
        const t = k / (nT - 1);
        const c = at(0.2 + 0.7 * t);
        const rad = (2.15 * Math.pow(1 - t, 0.82) + 0.3) * s * rng.range(0.86, 1.1);
        const th = ((H * 0.76) / nT) * 2.3;
        const rot = rng.range(0, 6.28), sd = rng.range(0, 50);
        pb.grid(3, nv, (i, j) => {
          const jj = j % (nv - 1), ang = rot + (jj / (nv - 1)) * Math.PI * 2;
          const zig = jj % 2 === 0 ? 1 : 0.6;
          const irr = 0.78 + 0.44 * M.noise2(Math.cos(ang) * 1.4 + sd, Math.sin(ang) * 1.4 + sd);
          const rr = i === 0 ? 0.05 : i === 1 ? 0.52 * (0.82 + 0.18 * zig) : zig;
          const yy = i === 0 ? th : i === 1 ? th * 0.36 : -th * 0.1 - rad * 0.2 * zig * irr;
          const r = rad * rr * irr;
          return [c[0] + Math.cos(ang) * r, c[1] + yy, c[2] + Math.sin(ang) * r];
        }, { wrapV: true, center: [c[0], c[1] - rad * 0.6, c[2]], col: (i) => (i === 0 ? c5(cIn, 0.15) : i === 1 ? c5(cMid, 0.6) : c5(cOut, 1)) });
      }
      // てっぺん
      pb.cone(at(0.9), at(1.03), 0.22 * s, c5(cMid, 0.8), c5(cOut, 1), 6, null, true);
    };
    // 色づいた広葉樹：谷に あたたかい色を足す
    const WARM = [['#b8791a', '#f0c23a'], ['#a8501a', '#e8922c'], ['#8a2f1a', '#d85a2a'], ['#6a7a22', '#b4bc3c']];
    const leafy = (x, z, s) => {
      const y = W.height(x, z);
      const pal = WARM[(rng.next() * WARM.length) | 0];
      const c0 = G.col(pal[0]), c1 = G.col(pal[1]);
      const bx = rng.range(-0.5, 0.5) * s, bz = rng.range(-0.5, 0.5) * s;
      const top = [x + bx, y + 3.6 * s, z + bz];
      pb.m(MAT.BARK);
      const sp = G.smoothPath([[x, y - 0.4, z], [x + bx * 0.2, y + 1.3 * s, z + bz * 0.2], [x + bx * 0.7, y + 2.6 * s, z + bz * 0.7], top], [0.34 * s, 0.24 * s, 0.17 * s, 0.1 * s], 2);
      pb.tube(sp.pts, sp.radii, { sides: 7, col: BARK2 });
      const nb = 8 + ((rng.next() * 4) | 0);
      const cs = [];
      for (let k = 0; k < nb; k++) {
        const a = (k / nb) * 6.283 * 2 + rng.range(-0.4, 0.4), rr = k === 0 ? 0 : rng.range(0.7, 1.9) * s;
        cs.push([[top[0] + Math.cos(a) * rr, top[1] + rng.range(-0.4, 1.5) * s + (k === 0 ? 1.1 * s : 0), top[2] + Math.sin(a) * rr], rng.range(0.85, 1.4) * s]);
      }
      for (let k = 1; k < nb; k++) pb.tube([V.lerp(sp.pts[sp.pts.length - 3], top, 0.5), V.lerp(top, cs[k][0], 0.8)], [0.1 * s, 0.04 * s], { sides: 5, col: BARK2 });
      pb.m(MAT.LEAF);
      for (let k = 0; k < nb; k++) blob(cs[k][0], cs[k][1], G.mixc(c0, [0, 0, 0, 0], 0.35), c1, rng.range(0, 60));
    };
    const bush = (x, z, s) => {
      const y = W.height(x, z);
      const warm = rng.next() < 0.3;
      const c0 = warm ? G.col('#7a2a18') : G.col('#12301a'), c1 = warm ? G.col('#d0622a') : G.col('#4a7030');
      pb.m(MAT.LEAF);
      const nb = 2 + ((rng.next() * 3) | 0);
      for (let k = 0; k < nb; k++) blob([x + rng.range(-0.7, 0.7) * s, y + 0.35 * s, z + rng.range(-0.7, 0.7) * s], rng.range(0.6, 1.0) * s, c0, c1, rng.range(0, 60), 0.7);
    };
    // ふちの大岩（アリーナの壁）
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2 + rng.range(-0.04, 0.04);
      const r = W.R + rng.range(1.5, 4.5);
      if (Math.abs(M.wrapPi(a - Math.PI)) < 0.12) continue; // キャンプ側の入口
      rock(Math.sin(a) * r, Math.cos(a) * r, rng.range(1.6, 3.4), undefined, rng.next() < 0.22 ? rng.range(1.5, 2.2) : 1);
    }
    for (let i = 0; i < 80; i++) {
      const a = rng.range(0, 6.28), r = W.R + rng.range(6, 60);
      rock(Math.sin(a) * r, Math.cos(a) * r, rng.range(1.2, 5), undefined, rng.next() < 0.3 ? rng.range(1.4, 2.6) : 1);
    }
    // 中の小石（当たりなし）
    for (let i = 0; i < 110; i++) {
      const a = rng.range(0, 6.28), r = Math.sqrt(rng.next()) * (W.R - 1);
      rock(Math.sin(a) * r, Math.cos(a) * r, rng.range(0.1, 0.3), 0.4);
    }
    // 木（外がわほど まばらに）
    let nTree = 0;
    for (let i = 0; i < 520 && nTree < 300; i++) {
      const a = rng.range(0, 6.28), r = W.R + 4 + Math.pow(rng.next(), 1.4) * 78;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (normalAt(x, z)[1] < 0.8) continue;
      if (Math.hypot(x - W.camp[0], z - W.camp[1]) < 9) continue;
      const warm = M.fbm(x * 0.04 + 9, z * 0.04 + 2, 2);
      if (rng.next() < M.smooth(0.42, 0.62, warm) * 0.75) leafy(x, z, rng.range(1.0, 1.7));
      else pine(x, z, rng.range(1.0, 2.2));
      nTree++;
    }
    // しげみ（岩のあいだ）
    for (let i = 0; i < 90; i++) {
      const a = rng.range(0, 6.28), r = W.R + rng.range(0.5, 14);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (Math.abs(M.wrapPi(a - Math.PI)) < 0.14 || normalAt(x, z)[1] < 0.75) continue;
      bush(x, z, rng.range(0.7, 1.5));
    }
    // 雷の結晶（ふち）
    const cry = G.col('#3ad8f0', 0.3), cryT = G.col('#c8fbff', 0.55);
    pb.m(MAT.CRYSTAL);
    for (let i = 0; i < 18; i++) {
      const a = rng.range(0, 6.28), r = W.R + rng.range(0.5, 5);
      const x = Math.sin(a) * r, z = Math.cos(a) * r, y = W.height(x, z);
      for (let k = 0; k < 5; k++) {
        const dx = rng.range(-0.8, 0.8), dz = rng.range(-0.8, 0.8), hgt = rng.range(0.8, 2.8);
        pb.cone([x + dx, y - 0.2, z + dz], [x + dx * 1.6 + rng.range(-0.3, 0.3), y + hgt, z + dz * 1.6], rng.range(0.18, 0.42), cry, cryT, 6);
      }
    }
    // 大きな骨（昔の主）
    {
      const bx = -26, bz = 22, bone = G.col('#cfc7b0'), boneD = G.col('#8f866f');
      const yaw = 0.7;
      pb.m(MAT.HORN, 0, 0.5);
      for (let k = 0; k < 7; k++) {
        const cz = k * 1.6;
        const c = V.rotY([0, 0, cz], yaw);
        const cx = bx + c[0], cz2 = bz + c[2], cy = W.height(cx, cz2);
        const sidev = V.rotY([1, 0, 0], yaw);
        const hgt = 3.4 - Math.abs(k - 2.8) * 0.42;
        for (const sg of [-1, 1]) {
          const pts = [], rr = [];
          for (let t = 0; t <= 7; t++) {
            const u = t / 7, ang = u * 2.35;
            pts.push([cx + sidev[0] * sg * Math.sin(ang) * 2.2, cy - 0.3 + (1 - Math.cos(ang)) * hgt * 0.62, cz2 + sidev[2] * sg * Math.sin(ang) * 2.2]);
            rr.push(0.23 - u * 0.19);
          }
          pb.tube(pts, rr, { sides: 7, col: (i) => G.mixc(boneD, bone, M.sat(i / 3)) });
        }
        // 背骨のふし
        pb.ellipsoid([cx, cy + 0.3, cz2], V.mul(sidev, 0.42), [0, 0.34, 0], V.rotY([0, 0, 0.5], yaw), bone, 8, 5);
      }
      const s0 = V.rotY([0, 0, -1.2], yaw), s1 = V.rotY([0, 0, 11.5], yaw);
      const ya = W.height(bx + s0[0], bz + s0[2]), yb = W.height(bx + s1[0], bz + s1[2]);
      pb.tube([[bx + s0[0], ya + 0.25, bz + s0[2]], [bx + s1[0], yb + 0.25, bz + s1[2]]], [0.3, 0.2], { sides: 8, col: bone });
    }
    // キャンプ：テント・たき火・支給箱・旗・ランタン
    {
      const cx = W.camp[0], cz = W.camp[1];
      const tx = cx - 4.5, tz = cz - 4, ty = W.height(tx, tz);
      const canvas = G.col('#b9a377'), canvasD = G.col('#7d6b4a'), wood = G.col('#4a3524'), red = G.col('#b32a26');
      // テント（布がたるむ・入口は暗い）
      pb.m(MAT.CLOTH, 0.7);
      const nvT = 25;
      pb.grid(7, nvT, (i, j) => {
        const t = i / 6, ang = ((j % (nvT - 1)) / (nvT - 1)) * Math.PI * 2;
        const sag = 1 - 0.07 * Math.abs(Math.sin(ang * 4)) * Math.sin(Math.PI * t);
        const r = 3.0 * Math.pow(t, 0.9) * sag;
        return [tx + Math.sin(ang) * r, ty + 3.6 * (1 - t) - 0.12, tz + Math.cos(ang) * r];
      }, { wrapV: true, center: [tx, ty, tz], col: (i, j) => G.mixc(canvas, canvasD, (j % 3 === 0 ? 0.25 : 0) + (i / 6) * 0.3) });
      pb.m(MAT.PLAIN);
      pb.grid(2, 2, (i, j) => { const a = 0.55 + (j ? 0.5 : 0); const t = i ? 1.0 : 0.38; const r = 3.03 * t; return [tx + Math.sin(a + (i ? 0 : 0.25 * (j ? -1 : 1))) * r, ty + 3.6 * (1 - t) - 0.1, tz + Math.cos(a + (i ? 0 : 0.25 * (j ? -1 : 1))) * r]; }, { center: [tx, ty, tz], col: [0.012, 0.01, 0.01, 0] });
      pb.m(MAT.WOOD);
      pb.tube([[tx, ty + 3.3, tz], [tx, ty + 4.6, tz]], [0.05, 0.04], { sides: 5, col: wood });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283 + 0.39; pb.tube([[tx + Math.sin(a) * 3.3, ty - 0.1, tz + Math.cos(a) * 3.3], [tx + Math.sin(a) * 3.3, ty + 0.3, tz + Math.cos(a) * 3.3]], [0.05, 0.04], { sides: 4, col: wood }); }
      pb.m(MAT.CLOTH, 0.5);
      pb.grid(2, 5, (i, j) => [tx + 0.05 + j * 0.16, ty + 4.5 - i * 0.42 + Math.sin(j * 1.3) * 0.04, tz + Math.sin(j * 1.6) * 0.07], { col: red });
      // たき火
      const fx = cx + 3, fz = cz - 3, fy = W.height(fx, fz);
      WB.fire = [fx, fy + 0.3, fz];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * 6.283;
        rock(fx + Math.sin(a) * 0.8, fz + Math.cos(a) * 0.8, 0.24, 0.2);
      }
      pb.m(MAT.BARK);
      for (let k = 0; k < 4; k++) {
        const a = k * 1.6 + 0.3;
        pb.tube([[fx + Math.sin(a) * 0.55, fy + 0.08, fz + Math.cos(a) * 0.55], [fx - Math.sin(a) * 0.3, fy + 0.42, fz - Math.cos(a) * 0.3]], [0.1, 0.08], { sides: 6, col: G.col('#2a1c12'), capStart: true, capEnd: true });
      }
      pb.m(MAT.PLAIN);
      pb.ellipsoid([fx, fy + 0.1, fz], [0.4, 0, 0], [0, 0, 0.4], [0, 0.12, 0], [1.0, 0.32, 0.04, 1.4], 8, 4);
      // 丸太のいす
      pb.m(MAT.BARK);
      pb.tube([[fx + 1.7, fy + 0.28, fz - 0.9], [fx + 1.2, fy + 0.3, fz + 1.2]], [0.3, 0.28], { sides: 9, col: BARK, capStart: true, capEnd: true, capStartCol: G.col('#b89868'), capEndCol: G.col('#b89868') });
      // 支給箱
      const sx = cx - 1.5, sz = cz - 5.5, sy2 = W.height(sx, sz);
      pb.m(MAT.WOOD);
      pb.box([sx, sy2 + 0.4, sz], [0.7, 0, 0.15], [0, 0.42, 0], [-0.1, 0, 0.45], G.col('#2a5a94'));
      pb.box([sx, sy2 + 0.87, sz], [0.74, 0, 0.16], [0, 0.06, 0], [-0.11, 0, 0.49], G.col('#3a6aa4'));
      pb.m(MAT.METAL);
      for (const k of [-0.45, 0.45]) pb.box([sx + k * 0.98, sy2 + 0.46, sz + k * 0.21], [0.05, 0, 0.011], [0, 0.5, 0], [-0.105, 0, 0.47], G.col('#c8a850'));
      pb.box([sx - 0.1, sy2 + 0.72, sz + 0.47], [0.1, 0, 0.02], [0, 0.09, 0], [-0.004, 0, 0.02], G.col('#d8b858'));
      // たる と 木箱
      pb.m(MAT.WOOD);
      const bxr = cx - 2.9, bzr = cz - 6.2, byr = W.height(bxr, bzr);
      pb.tube([[bxr, byr - 0.05, bzr], [bxr, byr + 0.3, bzr], [bxr, byr + 0.65, bzr], [bxr, byr + 1.0, bzr]], [0.36, 0.44, 0.44, 0.36], { sides: 12, col: G.col('#6a4a2c'), capEnd: true, capEndCol: G.col('#4a341e') });
      pb.box([bxr + 1.0, byr + 0.33, bzr - 0.5], [0.36, 0, 0.1], [0, 0.34, 0], [-0.1, 0, 0.36], G.col('#7a5a36'));
      pb.m(MAT.METAL);
      for (const hy of [0.22, 0.78]) pb.tube([[bxr, byr + hy - 0.03, bzr], [bxr, byr + hy + 0.03, bzr]], [0.435, 0.435], { sides: 12, col: G.col('#5a5a60') });
      // ランタン（あたたかい光）
      const lx = cx + 0.4, lz = cz - 6.4, ly = W.height(lx, lz);
      pb.m(MAT.WOOD);
      pb.tube([[lx, ly - 0.2, lz], [lx, ly + 2.3, lz], [lx + 0.45, ly + 2.5, lz]], [0.07, 0.055, 0.04], { sides: 6, col: wood });
      pb.m(MAT.METAL);
      pb.cone([lx + 0.45, ly + 2.32, lz], [lx + 0.45, ly + 2.5, lz], 0.16, G.col('#3a3a40'), null, 6, null, true);
      pb.m(MAT.PLAIN);
      pb.ellipsoid([lx + 0.45, ly + 2.18, lz], [0.1, 0, 0], [0, 0, 0.1], [0, 0.14, 0], [1.0, 0.62, 0.2, 2.2], 8, 5);
      WB.lantern = [lx + 0.45, ly + 2.18, lz];
    }
    G.setProps(pb);
    WB.stats = { propVerts: pb.nv, propTris: pb.ni / 3, trees: nTree };

    // ---- 草 ----
    const cnt = R.q.grass;
    const gd = new Float32Array(cnt * 8);
    let n = 0, guard = 0;
    while (n < cnt && guard++ < cnt * 6) {
      const a = rng.range(0, 6.2832), r = Math.sqrt(rng.next()) * (W.R + 12);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const dens = M.fbm(x * 0.13 + 70, z * 0.13 + 3, 2);
      if (rng.next() > M.smooth(0.22, 0.58, dens) + 0.3) continue;
      const dirt = W.dirt(x, z);
      if (dirt > 0.5 || (dirt > 0.3 && rng.next() < 0.75)) continue;
      if (r > W.R + 2 && normalAt(x, z)[1] < 0.93) continue;
      const tall = M.smooth(0.5, 0.75, M.fbm(x * 0.05 + 21, z * 0.05 + 8, 2));
      const o = n * 8;
      gd[o] = x; gd[o + 1] = W.height(x, z) - 0.03; gd[o + 2] = z; gd[o + 3] = rng.range(0, 6.28);
      gd[o + 4] = rng.range(0.24, 0.52) * (0.7 + dens * 0.8) * (1 + tall * 0.7) * (1 - dirt * 1.2); gd[o + 5] = rng.range(0.05, 0.095); gd[o + 6] = rng.next(); gd[o + 7] = 0;
      n++;
    }
    G.setGrass(gd, n);

    // ---- 花（かたまって咲く）----
    const fmax = R.q.fx ? 4200 : 1200;
    const fd = new Float32Array(fmax * 8);
    let fn = 0;
    for (let c = 0; c < 130 && fn < fmax; c++) {
      const a = rng.range(0, 6.2832), r = Math.sqrt(rng.next()) * (W.R + 6);
      const cx = Math.sin(a) * r, cz = Math.cos(a) * r;
      if (W.dirt(cx, cz) > 0.25) continue;
      const kind = 1 + ((rng.next() * 3) | 0), spread = rng.range(1.5, 4.5), num = (rng.range(14, 46)) | 0;
      for (let k = 0; k < num && fn < fmax; k++) {
        const x = cx + (rng.next() + rng.next() - 1) * spread, z = cz + (rng.next() + rng.next() - 1) * spread;
        if (W.dirt(x, z) > 0.3) continue;
        const o = fn * 8;
        fd[o] = x; fd[o + 1] = W.height(x, z) - 0.03; fd[o + 2] = z; fd[o + 3] = rng.range(0, 6.28);
        fd[o + 4] = rng.range(0.34, 0.6); fd[o + 5] = 0.02; fd[o + 6] = rng.next(); fd[o + 7] = rng.next() < 0.85 ? kind : 1 + ((rng.next() * 3) | 0);
        fn++;
      }
    }
    G.setFlowers(fd, fn);
  };
})();
