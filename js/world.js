// 狩りの谷 — 狩り場「雨夜の交差点・高架下」（すべて手続き生成。ルールには関係しない見た目だけ）
// 2026-11-11 に「谷」（草原・森）から作りかえた。谷の版は Git の印 v-valley にある。
// 場の広さ（半径 W.R = 44）と平らな地面は、ルール（sim.js）と同じ。場の中には、ぶつかる物を置かない。
(function () {
  'use strict';
  const KT = globalThis.KT;
  const M = KT.M, V = M.V, G = KT.GL, W = KT.World, MAT = G.MAT;
  const WB = (KT.WorldBuild = {});
  const c5 = (c, e, aux) => [c[0], c[1], c[2], e || 0, aux || 0];
  const E = (r, g, b, e) => [r, g, b, e];   // 自分で光る色

  // 土ぼこりの色ぎめ用（前の版との互換。都市では「土」は無い）
  W.dirt = function () { return 0; };

  WB.build = function () {
    const rng = new M.RNG(20261111);
    const lights = [], halos = [];
    const addLight = (p, r, c, halo) => { lights.push({ p, r, c }); if (halo) halos.push([p[0], p[1], p[2], halo, c[0] * 0.035, c[1] * 0.035, c[2] * 0.035]); };

    // ---- 路面（平ら。模様・水たまり・白線はシェーダーが描く）----
    const N = 48, EXT = 160;
    const tb = new G.Batch((N + 1) * (N + 1) + 10);
    tb.m(MAT.ASPHALT);
    const road = G.col('#2a2b2f');
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) tb.vert(-EXT + (2 * EXT * i) / N, 0, -EXT + (2 * EXT * j) / N, 0, 1, 0, road);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; tb.tri(a, c, b); tb.tri(b, c, d); }
    G.setTerrain(tb);

    // ---- 小物 ----
    const pb = new G.Batch(120000);
    const conc = G.col('#4a4b50'), concD = G.col('#34353a'), steel = G.col('#2a2d33'), dark = G.col('#101216');
    const box = (c, hx, hy, hz, col, yaw) => {
      const sy = Math.sin(yaw || 0), cy = Math.cos(yaw || 0);
      pb.box(c, [cy * hx, 0, -sy * hx], [0, hy, 0], [sy * hz, 0, cy * hz], col);
    };
    // 横から見た形（[前後, 高さ] の列）を幅 w だけ押し出す（車・バン）
    const extrude = (cx, cz, yaw, prof, w, col) => {
      const fx = Math.sin(yaw), fz = Math.cos(yaw), sx = Math.cos(yaw), sz = -Math.sin(yaw);
      const P = (l, y, s) => [cx + fx * l + sx * s, y, cz + fz * l + sz * s];
      const n = prof.length;
      let my = 0; for (const q of prof) my += q[1]; my /= n;
      pb.grid(n + 1, 2, (i, j) => { const q = prof[i % n]; return P(q[0], q[1], (j ? 1 : -1) * w / 2); }, { center: P(0, my, 0), col });
      for (const sg of [-1, 1]) {
        const nx = sx * sg, nz = sz * sg;
        const c0 = P(0, my, sg * w / 2);
        const ci = pb.vert(c0[0], c0[1], c0[2], nx, 0, nz, col, 0, 0);
        const ids = prof.map((q) => { const p = P(q[0], q[1], sg * w / 2); return pb.vert(p[0], p[1], p[2], nx, 0, nz, col, q[0], q[1]); });
        for (let i = 0; i < n; i++) pb.tri(ci, ids[i], ids[(i + 1) % n]);
      }
      return P;
    };
    const car = (cx, cz, yaw, body, lightsOn) => {
      pb.m(MAT.GLOSS);
      const P = extrude(cx, cz, yaw, [[-2.2, 0.32], [-2.2, 0.86], [-1.7, 0.96], [-1.2, 1.42], [0.5, 1.42], [1.1, 0.96], [2.15, 0.82], [2.2, 0.32]], 1.76, body);
      extrude(cx, cz, yaw, [[-1.55, 0.99], [-1.17, 1.38], [0.46, 1.38], [1.0, 0.99]], 1.8, c5([0.008, 0.01, 0.014]));
      pb.m(MAT.PLAIN);
      for (const l of [-1.35, 1.38]) for (const sg of [-1, 1]) pb.tube([P(l, 0.33, sg * 0.7), P(l, 0.33, sg * 0.9)], [0.33, 0.33], { sides: 10, col: dark, capStart: true, capEnd: true });
      for (const sg of [-1, 1]) {
        const h = P(2.2, 0.68, sg * 0.6), t = P(-2.21, 0.74, sg * 0.62);
        box(h, 0.24, 0.09, 0.04, lightsOn ? E(1, 0.95, 0.8, 2.4) : E(0.5, 0.5, 0.5, 0), yaw);
        box(t, 0.2, 0.08, 0.04, E(1, 0.04, 0.03, lightsOn ? 1.3 : 0.25), yaw);
      }
      return P;
    };
    const building = (x0, x1, z0, z1, h, sx, sz, seed) => {
      const cx = (sx * (x0 + x1)) / 2, cz = (sz * (z0 + z1)) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
      const wall = G.mixc(G.col('#15171c'), G.col('#2a2c33'), rng.next());
      pb.m(MAT.BUILDING, seed);
      box([cx, h / 2 + 0.18, cz], hx, h / 2, hz, wall);
      // 屋上の箱と、赤い灯り
      pb.m(MAT.CONCRETE);
      box([cx + rng.range(-0.3, 0.3) * hx, h + 1.1, cz + rng.range(-0.3, 0.3) * hz], hx * 0.3, 0.9, hz * 0.3, concD);
      if (h > 30) { pb.m(MAT.PLAIN); pb.sphere([cx, h + 2.6, cz], 0.22, E(1, 0.05, 0.03, 2.2), 6, 4); halos.push([cx, h + 2.6, cz, 1.4, 0.3, 0.012, 0.008]); }
      return [cx, cz, hx, hz];
    };

    // 歩道（場の外の4すみ）
    pb.m(MAT.CONCRETE);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box([sx * 92, 0.09, sz * 92], 58, 0.09, 58, G.col('#3c3d42'));

    // ビル（4すみ。場に面した角に看板）
    const NEON = { '1,1': [1.0, 0.16, 0.5], '-1,1': [0.12, 0.8, 1.0], '1,-1': [1.0, 0.56, 0.1], '-1,-1': [0.2, 1.0, 0.45] };
    let seed = 1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      building(36, 58, 36, 58, rng.range(26, 40), sx, sz, seed++);
      building(60, 86, 36, 54, rng.range(14, 30), sx, sz, seed++);
      building(88, 122, 36, 60, rng.range(22, 46), sx, sz, seed++);
      building(36, 54, 60, 86, rng.range(14, 30), sx, sz, seed++);
      building(36, 60, 88, 122, rng.range(22, 46), sx, sz, seed++);
      building(62, 104, 64, 106, rng.range(30, 54), sx, sz, seed++);
      const nc = NEON[sx + ',' + sz];
      pb.m(MAT.PLAIN);
      // 1階の店の明かり（角のビルの、場に面した2面）
      for (let k = 0; k < 4; k++) {
        box([sx * 35.9, 1.8, sz * (39.2 + k * 5.1)], 0.06, 1.15, 2.1, E(1.0, 0.8, 0.56, 0.11 + 0.05 * ((k * 7 + seed) % 3)));
        box([sx * (39.2 + k * 5.1), 1.8, sz * 35.9], 2.1, 1.15, 0.06, E(0.7, 0.86, 1.0, 0.09 + 0.05 * ((k * 5 + seed) % 3)));
      }
      box([sx * 35.6, 3.5, sz * 47], 0.5, 0.12, 10, c5(dark));
      box([sx * 47, 3.5, sz * 35.6], 10, 0.12, 0.5, c5(dark));
      // たての看板と、よこの看板
      box([sx * 35.55, 8.2, sz * 40], 0.16, 2.6, 0.75, E(nc[0], nc[1], nc[2], 1.25));
      box([sx * 35.45, 8.2, sz * 40], 0.2, 2.8, 0.95, c5(dark));
      box([sx * 43, 5.4, sz * 35.6], 2.4, 0.6, 0.14, E(nc[2] * 0.6 + 0.4, nc[0] * 0.5 + 0.3, nc[1] * 0.6 + 0.2, 0.9));
      box([sx * 52, 12, sz * 35.6], 0.9, 1.6, 0.14, E(nc[1], nc[2], nc[0], 0.8));
      addLight([sx * 33.4, 7.6, sz * 39.5], 34, [nc[0] * 9, nc[1] * 9, nc[2] * 9], 0);
      halos.push([sx * 35.2, 8.2, sz * 40, 3.4, nc[0] * 0.2, nc[1] * 0.2, nc[2] * 0.2]);

      // 街灯（オレンジ）と電柱
      const px = sx * 34, pz = sz * 34;
      pb.m(MAT.METAL);
      const head = [px - sx * 2.7, 8.75, pz - sz * 2.7];
      pb.tube([[px, 0, pz], [px, 8.2, pz], [px - sx * 1.7, 8.9, pz - sz * 1.7], head], [0.15, 0.1, 0.07, 0.06], { sides: 7, col: steel });
      pb.tube([[px, 8.2, pz], [px, 10.4, pz]], [0.1, 0.07], { sides: 6, col: steel });
      box([px, 9.9, pz], 1.1, 0.06, 0.06, steel, Math.atan2(sx, sz) + 0.78);
      box([px + sx * 0.4, 7.2, pz + sz * 0.4], 0.28, 0.45, 0.28, c5(G.col('#3a3d42')));
      box([head[0], head[1] - 0.02, head[2]], 0.5, 0.07, 0.2, steel, Math.atan2(sx, sz));
      pb.m(MAT.PLAIN);
      pb.ellipsoid([head[0], head[1] - 0.14, head[2]], [0.34, 0, 0], [0, 0, 0.16], [0, 0.07, 0], E(1.0, 0.62, 0.24, 3.0), 8, 4);
      addLight([head[0], head[1] - 0.45, head[2]], 50, [15, 7.6, 2.5], 2.6);
      // 歩行者の信号（赤）
      box([px - sx * 0.25, 3.0, pz - sz * 0.25], 0.16, 0.34, 0.16, c5(dark));
      pb.sphere([px - sx * 0.44, 3.14, pz - sz * 0.44], 0.09, E(1, 0.08, 0.05, 1.6), 6, 4);
    }
    // 電線（角の電柱どうし）
    pb.m(MAT.PLAIN);
    const wire = (a, b, sag) => {
      const pts = [], rr = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([M.lerp(a[0], b[0], t), M.lerp(a[1], b[1], t) - Math.sin(Math.PI * t) * sag, M.lerp(a[2], b[2], t)]); rr.push(0.035); }
      pb.tube(pts, rr, { sides: 4, col: c5([0.004, 0.004, 0.005]) });
    };
    for (const k of [0, 1]) {
      const y = 10.2 - k * 0.5, o = k * 0.5 - 0.25;
      wire([34 + o, y, 34], [34 + o, y, -34], 1.3); wire([-34 + o, y, 34], [-34 + o, y, -34], 1.3);
      wire([34, y, -34 + o], [-34, y, -34 + o], 1.3);
    }

    // ---- 高架（z = 9〜31 の上を通る。柱は場の外）----
    pb.m(MAT.CONCRETE);
    box([0, 13.9, 20], 158, 0.9, 11, conc);
    box([0, 15.3, 9.3], 158, 0.6, 0.25, conc); box([0, 15.3, 30.7], 158, 0.6, 0.25, conc);
    for (const z of [12.5, 20, 27.5]) box([0, 12.5, z], 158, 0.5, 0.75, concD);
    for (const x of [-104, -53, 53, 104]) { box([x, 5.6, 20], 1.5, 5.6, 1.5, conc); box([x, 11.6, 20], 1.8, 0.8, 10.6, conc); }
    // 高架の下の灯り（白）と、つり下げた信号、案内の板
    pb.m(MAT.PLAIN);
    for (const x of [-16, 16]) {
      box([x, 11.9, 20], 1.3, 0.06, 0.14, E(0.85, 0.95, 1.0, 2.0));
      box([x, 11.98, 20], 1.4, 0.05, 0.22, c5(dark));
      addLight([x, 11.3, 20], 40, [6.5, 8.2, 9.5], 1.6);
    }
    for (const x of [-5.5, 5.5]) {
      box([x, 11.25, 8.75], 0.95, 0.32, 0.22, c5(dark));
      pb.sphere([x - 0.6, 11.25, 8.5], 0.17, E(1, 0.07, 0.04, 2.0), 7, 4);
      pb.sphere([x, 11.25, 8.5], 0.17, E(0.25, 0.2, 0.05, 0.05), 7, 4);
      pb.sphere([x + 0.6, 11.25, 8.5], 0.17, E(0.05, 0.25, 0.2, 0.05), 7, 4);
      halos.push([x - 0.6, 11.25, 8.4, 1.1, 0.22, 0.012, 0.006]);
    }
    box([-22, 14.5, 8.95], 3.4, 0.95, 0.07, E(0.02, 0.13, 0.07, 0.1));
    box([-22, 14.5, 8.9], 2.8, 0.07, 0.07, E(0.6, 0.65, 0.6, 0.12));

    // ---- 場のふち：ガードレール・バリケード・止まった車 ----
    pb.m(MAT.METAL);
    for (let q = 0; q < 4; q++) {
      const a0 = (q * 90 + 16) * M.DEG, a1 = (q * 90 + 74) * M.DEG;
      for (const y of [0.5, 0.92]) {
        const pts = [], rr = [];
        for (let i = 0; i <= 12; i++) { const a = M.lerp(a0, a1, i / 12); pts.push([Math.sin(a) * 45.7, y, Math.cos(a) * 45.7]); rr.push(0.055); }
        pb.tube(pts, rr, { sides: 5, col: c5(G.col('#b9bcc2')) });
      }
      for (let i = 0; i <= 6; i++) { const a = M.lerp(a0, a1, i / 6); box([Math.sin(a) * 45.7, 0.5, Math.cos(a) * 45.7], 0.06, 0.5, 0.06, c5(G.col('#8a8d93'))); }
    }
    pb.m(MAT.PLAIN);
    const barricade = (x, z, yaw) => {
      box([x, 0.82, z], 0.95, 0.13, 0.04, E(1.0, 0.5, 0.05, 0.12), yaw);
      box([x, 0.5, z], 0.95, 0.08, 0.04, c5(G.col('#d8d8d8')), yaw);
      for (const s of [-0.8, 0.8]) box([x + Math.cos(yaw) * s, 0.45, z - Math.sin(yaw) * s], 0.05, 0.45, 0.25, c5(G.col('#5a5c60')), yaw);
      pb.sphere([x, 1.05, z], 0.09, E(1.0, 0.55, 0.05, 1.8), 6, 4);
    };
    for (const o of [-7, 0, 7]) { barricade(o, 46.6, 0); barricade(46.6, o, Math.PI / 2); barricade(-46.6, o, Math.PI / 2); }
    barricade(-8, -46.8, 0); barricade(8, -46.8, 0);
    car(-4.6, -50.2, 0.06, c5(G.col('#1d2a3f')), true);
    car(4.8, -51.0, -0.1, c5(G.col('#2e2f33')), true);
    addLight([0.2, 0.95, -46.8], 30, [8, 7.4, 6.2], 2.2);
    car(51, -4.6, -Math.PI / 2 + 0.08, c5(G.col('#3a1414')), true);
    addLight([47.6, 0.95, -4.5], 26, [7, 6.5, 5.5], 1.8);
    car(-51, 4.4, Math.PI / 2, c5(G.col('#c9a21a')), false);
    car(4.6, 51, Math.PI - 0.1, c5(G.col('#22252a')), false);
    car(-5.2, 54, Math.PI, c5(G.col('#40454d')), false);

    // 自動販売機（2台）と ごみ箱、ねこの居場所
    {
      const a = 200 * M.DEG, r = 47.0;
      for (let k = 0; k < 2; k++) {
        const aa = a + k * 0.031, x = Math.sin(aa) * r, z = Math.cos(aa) * r, yaw = Math.atan2(-x, -z);
        const f = [Math.sin(yaw), 0, Math.cos(yaw)];
        pb.m(MAT.GLOSS);
        box([x, 0.95, z], 0.56, 0.95, 0.4, c5(k ? G.col('#b01f24') : G.col('#d9dde2')), yaw);
        pb.m(MAT.PLAIN);
        box([x + f[0] * 0.41, 1.2, z + f[2] * 0.41], 0.47, 0.5, 0.02, E(0.7, 0.9, 1.0, 1.15), yaw);
        for (let i = 0; i < 5; i++) box([x + f[0] * 0.44 + Math.cos(yaw) * (i - 2) * 0.18, 1.25, z + f[2] * 0.44 - Math.sin(yaw) * (i - 2) * 0.18], 0.055, 0.13, 0.01, E([1, 0.2, 1, 0.2, 1][i], [0.3, 0.8, 0.9, 0.5, 0.2][i], [0.2, 0.3, 0.2, 1, 0.3][i], 0.5), yaw);
        box([x + f[0] * 0.41, 0.45, z + f[2] * 0.41], 0.47, 0.12, 0.02, c5(dark), yaw);
      }
      const x = Math.sin(a) * r, z = Math.cos(a) * r, yaw = Math.atan2(-x, -z);
      addLight([x + Math.sin(yaw) * 1.3, 1.25, z + Math.cos(yaw) * 1.3], 13, [3.2, 4.4, 5.2], 0);
      pb.m(MAT.METAL);
      box([x - Math.cos(yaw) * 1.5, 0.5, z + Math.sin(yaw) * 1.5], 0.3, 0.5, 0.3, c5(G.col('#3b4a3d')), yaw);
      WB.cat = { x: x + Math.sin(yaw) * 1.6 + Math.cos(yaw) * 1.3, z: z + Math.cos(yaw) * 1.6 - Math.sin(yaw) * 1.3, yaw };
    }

    // 路面をつきやぶった雷の結晶（ふち）と、くだけたアスファルト
    const cry = G.col('#3ad8f0', 0.45), cryT = G.col('#c8fbff', 0.8);
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, 6.28), r = W.R + rng.range(0.6, 3.2);
      if (Math.cos(a) < -0.9) continue;   // 拠点のそばは空ける
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      pb.m(MAT.CRYSTAL);
      for (let k = 0; k < 5; k++) {
        const dx = rng.range(-0.8, 0.8), dz = rng.range(-0.8, 0.8), hgt = rng.range(0.8, 2.8);
        pb.cone([x + dx, -0.2, z + dz], [x + dx * 1.6 + rng.range(-0.3, 0.3), hgt, z + dz * 1.6], rng.range(0.18, 0.42), cry, cryT, 6);
      }
      halos.push([x, 1.0, z, 2.6, 0.02, 0.09, 0.13]);
      pb.m(MAT.CONCRETE);
      for (let k = 0; k < 7; k++) { const dx = rng.range(-1.8, 1.8), dz = rng.range(-1.8, 1.8), sz = rng.range(0.12, 0.34); box([x + dx, sz * 0.4, z + dz], sz, sz * 0.5, sz * 0.8, c5(G.col('#1c1d20')), rng.range(0, 3)); }
    }

    // ---- 拠点：ハンターのバン・ひさし・木箱・ドラム缶のたき火・つり灯り ----
    {
      const cx = W.camp[0], cz = W.camp[1];
      const vx = cx - 5.2, vz = cz - 5.6;
      pb.m(MAT.GLOSS);
      const P = extrude(vx, vz, Math.PI / 2 + 0.12, [[-2.7, 0.4], [-2.7, 2.35], [1.5, 2.35], [2.3, 1.5], [2.7, 1.35], [2.7, 0.4]], 2.0, c5(G.col('#20242b')));
      pb.m(MAT.PLAIN);
      for (const l of [-1.7, 1.75]) for (const sg of [-1, 1]) pb.tube([P(l, 0.4, sg * 0.8), P(l, 0.4, sg * 1.02)], [0.4, 0.4], { sides: 10, col: dark, capStart: true, capEnd: true });
      box(P(-0.6, 1.5, 1.02), 0.02, 0.5, 1.2, E(1.0, 0.8, 0.5, 0.5), 0.12);          // 開いた横の口の明かり
      pb.m(MAT.CLOTH, 0.4);
      pb.grid(2, 2, (i, j) => { const q = P(-2.4 + j * 3.6, 2.3 - i * 0.35, 1.0 + i * 2.6); return q; }, { col: c5(G.col('#2b3a4d')) });   // ひさし
      pb.m(MAT.METAL);
      for (const l of [-2.4, 1.2]) pb.tube([P(l, 0, 3.6), P(l, 1.95, 3.6)], [0.035, 0.035], { sides: 5, col: steel });
      // 木箱と道具箱
      pb.m(MAT.WOOD);
      box([cx - 2.6, 0.4, cz - 3.4], 0.6, 0.4, 0.45, c5(G.col('#5a4630')), 0.3);
      box([cx - 2.5, 1.05, cz - 3.4], 0.42, 0.25, 0.35, c5(G.col('#2a5a94')), 0.5);
      box([cx - 3.8, 0.3, cz - 2.6], 0.45, 0.3, 0.45, c5(G.col('#4a3a28')), -0.2);
      // ドラム缶のたき火
      const fx = cx + 3.2, fz = cz - 3.4;
      pb.m(MAT.METAL);
      pb.tube([[fx, 0, fz], [fx, 0.3, fz], [fx, 0.6, fz], [fx, 0.9, fz]], [0.34, 0.36, 0.36, 0.34], { sides: 12, col: c5(G.col('#3a2a22')) });
      pb.m(MAT.PLAIN);
      pb.ellipsoid([fx, 0.84, fz], [0.3, 0, 0], [0, 0, 0.3], [0, 0.08, 0], E(1.0, 0.34, 0.05, 1.6), 8, 4);
      WB.fire = [fx, 0.95, fz];
      addLight([fx, 1.5, fz], 12, [5, 2.2, 0.7], 0);
      // つり灯り
      const lx = cx + 0.6, lz = cz - 6.6;
      pb.m(MAT.METAL);
      pb.tube([[lx, 0, lz], [lx, 2.4, lz], [lx + 0.5, 2.6, lz]], [0.06, 0.05, 0.04], { sides: 6, col: steel });
      pb.m(MAT.PLAIN);
      pb.ellipsoid([lx + 0.5, 2.3, lz], [0.1, 0, 0], [0, 0, 0.1], [0, 0.15, 0], E(1.0, 0.7, 0.3, 2.4), 8, 5);
      WB.lantern = [lx + 0.5, 2.3, lz];
    }
    G.setProps(pb);
    WB.lights = lights;
    WB.halos = halos;
    WB.deck = [9, 31];
    WB.stats = { propVerts: pb.nv, propTris: pb.ni / 3, lights: lights.length, halos: halos.length };
  };
})();
