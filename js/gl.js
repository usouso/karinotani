// 狩りの谷 — 自作 WebGL2 レンダラー（外部ライブラリなし・画像ファイルなし）
// HDR + MSAA / 影2段（近く＝動くもの、遠く＝谷ぜんぶ）/ 計算で描く表面の模様とでこぼこ /
// 接する所の暗がり（SSAO）/ 光のすじ（影を通した空気の光）/ ブルーム / トーンマップと色づくり /
// 風でうねる草と花 / パーティクル
(function () {
  'use strict';
  const KT = globalThis.KT || (globalThis.KT = {});
  const M = KT.M, V = M.V, M4 = M.M4;
  const G = (KT.GL = {});
  let gl = null;

  // ---------- 色（sRGB の 16進 → リニア） ----------
  G.col = function (hex, e) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.pow(v / 255, 2.2);
    return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255), e || 0];
  };
  G.mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];

  // 表面の種類（シェーダーの中で模様を描き分ける）
  const MAT = (G.MAT = { PLAIN: 0, HIDE: 1, HORN: 2, CRYSTAL: 3, METAL: 4, LEATHER: 5, SKIN: 6, ROCK: 7, BARK: 8, LEAF: 9, GROUND: 10, WOOD: 11, CLOTH: 12, GLOSS: 13 });

  // ---------- CPU メッシュビルダー（頂点: 位置3 法線3 色3 発光1 表面4[u, v, 種類, 補助]） ----------
  const STRIDE = 14;
  function Batch(maxVerts) {
    this.v = new Float32Array(maxVerts * STRIDE);
    this.i = new Uint32Array(maxVerts * 4);
    this.nv = 0;
    this.ni = 0;
    this.max = maxVerts;
    this.mat = 0; this.aux = 0; this.uvk = 1;
  }
  G.Batch = Batch;
  G.STRIDE = STRIDE;
  const BP = Batch.prototype;
  BP.reset = function () { this.nv = 0; this.ni = 0; this.mat = 0; this.aux = 0; this.uvk = 1; };
  // 表面の種類を決める。aux: 種類ごとの補助の数、uvk: 模様の細かさの倍率
  BP.m = function (mat, aux, uvk) { this.mat = mat || 0; this.aux = aux || 0; this.uvk = uvk || 1; return this; };
  BP.vert = function (x, y, z, nx, ny, nz, c, u, w) {
    if (this.nv >= this.max) return this.nv - 1;
    const o = this.nv * STRIDE, v = this.v;
    v[o] = x; v[o + 1] = y; v[o + 2] = z; v[o + 3] = nx; v[o + 4] = ny; v[o + 5] = nz;
    v[o + 6] = c[0]; v[o + 7] = c[1]; v[o + 8] = c[2]; v[o + 9] = c[3] || 0;
    v[o + 10] = (u || 0) * this.uvk; v[o + 11] = (w || 0) * this.uvk; v[o + 12] = this.mat; v[o + 13] = c.length > 4 ? c[4] : this.aux;
    return this.nv++;
  };
  BP.tri = function (a, b, c) {
    if (this.ni + 3 > this.i.length) return;
    this.i[this.ni++] = a; this.i[this.ni++] = b; this.i[this.ni++] = c;
  };
  // 点の列に沿った管。radii: 各点の半径。opt: sides, col(色 | 輪ごとの色 | 関数(i,cu,cs)), up, sx, sy, capStart, capEnd
  // 模様の座標: u = 管に沿った長さ、v = 周りの長さ（どちらも世界の長さに近い）
  BP.tube = function (pts, radii, opt) {
    const n = pts.length, sides = opt.sides || 10, ring = sides + 1;
    const base = this.nv;
    const col = opt.col;
    const colFn = typeof col === 'function';
    const colArr = !colFn && Array.isArray(col[0]);
    const sx = opt.sx || 1, sy = opt.sy || 1;
    let pn = null, ulen = 0, rsum = 0;
    for (let i = 0; i < n; i++) rsum += radii[i];
    const circ = Math.PI * 2 * (rsum / n) * (sx + sy) * 0.5;
    const T = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], p = pts[i];
      if (i > 0) ulen += Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]);
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      let ref = opt.up || pn || [0, 1, 0];
      let d = ref[0] * tx + ref[1] * ty + ref[2] * tz;
      let nx = ref[0] - tx * d, ny = ref[1] - ty * d, nz = ref[2] - tz * d;
      let nl = Math.hypot(nx, ny, nz);
      if (nl < 0.05) {
        ref = pn || [1, 0, 0];
        d = ref[0] * tx + ref[1] * ty + ref[2] * tz;
        nx = ref[0] - tx * d; ny = ref[1] - ty * d; nz = ref[2] - tz * d;
        nl = Math.hypot(nx, ny, nz);
        if (nl < 0.05) { nx = 0; ny = 0; nz = 1; nl = 1; }
      }
      nx /= nl; ny /= nl; nz /= nl;
      pn = [nx, ny, nz];
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      const r = radii[i];
      const slope = (radii[Math.min(n - 1, i + 1)] - radii[Math.max(0, i - 1)]) / tl;
      T.push([tx, ty, tz]);
      for (let k = 0; k <= sides; k++) {
        const ang = (k / sides) * Math.PI * 2;
        const cu = Math.cos(ang), cs = Math.sin(ang);
        const rx = nx * cu * sx + bx * cs * sy, ry = ny * cu * sx + by * cs * sy, rz = nz * cu * sx + bz * cs * sy;
        let qx = nx * cu * sy + bx * cs * sx - tx * slope, qy = ny * cu * sy + by * cs * sx - ty * slope, qz = nz * cu * sy + bz * cs * sx - tz * slope;
        const ql = Math.hypot(qx, qy, qz) || 1;
        const c = colFn ? col(i, cu, cs) : colArr ? col[i] : col;
        this.vert(p[0] + rx * r, p[1] + ry * r, p[2] + rz * r, qx / ql, qy / ql, qz / ql, c, ulen, (k / sides) * circ);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < sides; k++) {
        const a = base + i * ring + k, b = a + 1;
        this.tri(a, a + ring, b);
        this.tri(b, a + ring, b + ring);
      }
    }
    const cap = (i, sgn, cc) => {
      const p = pts[i], t = T[i];
      const c = cc || (colFn ? col(i, 1, 0) : colArr ? col[i] : col);
      const ci = this.vert(p[0], p[1], p[2], t[0] * sgn, t[1] * sgn, t[2] * sgn, c, 0, 0);
      for (let k = 0; k < sides; k++) this.tri(ci, base + i * ring + k, base + i * ring + k + 1);
    };
    if (opt.capStart) cap(0, -1, opt.capStartCol);
    if (opt.capEnd) cap(n - 1, 1, opt.capEndCol);
  };
  // 両端が丸いカプセル
  BP.capsule = function (a, b, ra, rb, col, sides) {
    const t = V.norm(V.sub(b, a));
    const pts = [V.mad(a, t, -ra), V.mad(a, t, -ra * 0.72), a, b, V.mad(b, t, rb * 0.72), V.mad(b, t, rb)];
    const rr = [ra * 0.05, ra * 0.7, ra, rb, rb * 0.7, rb * 0.05];
    this.tube(pts, rr, { sides: sides || 8, col });
  };
  // 楕円体。U,V,W は半径ベクトル
  BP.ellipsoid = function (c, U, Vv, Wv, col, seg, rings) {
    seg = seg || 10; rings = rings || 6;
    const base = this.nv, row = seg + 1;
    const lu = V.len(U), lv = V.len(Vv), lw = V.len(Wv);
    const cu0 = Math.PI * (lu + lv), cv0 = Math.PI * ((lu + lv) * 0.5 + lw) * 0.5;
    for (let j = 0; j <= rings; j++) {
      const th = (Math.PI * j) / rings;
      const y = Math.cos(th), rad = Math.sin(th);
      for (let k = 0; k <= seg; k++) {
        const ph = (k / seg) * Math.PI * 2;
        const cu = Math.cos(ph) * rad, cv = Math.sin(ph) * rad;
        const px = c[0] + U[0] * cu + Vv[0] * cv + Wv[0] * y;
        const py = c[1] + U[1] * cu + Vv[1] * cv + Wv[1] * y;
        const pz = c[2] + U[2] * cu + Vv[2] * cv + Wv[2] * y;
        let nx = (U[0] * cu) / (lu * lu) + (Vv[0] * cv) / (lv * lv) + (Wv[0] * y) / (lw * lw);
        let ny = (U[1] * cu) / (lu * lu) + (Vv[1] * cv) / (lv * lv) + (Wv[1] * y) / (lw * lw);
        let nz = (U[2] * cu) / (lu * lu) + (Vv[2] * cv) / (lv * lv) + (Wv[2] * y) / (lw * lw);
        const nl = Math.hypot(nx, ny, nz) || 1;
        this.vert(px, py, pz, nx / nl, ny / nl, nz / nl, typeof col === 'function' ? col(y, cu, cv) : col, (k / seg) * cu0, (j / rings) * cv0);
      }
    }
    for (let j = 0; j < rings; j++)
      for (let k = 0; k < seg; k++) {
        const a = base + j * row + k, b = a + 1;
        this.tri(a, a + row, b);
        this.tri(b, a + row, b + row);
      }
  };
  BP.sphere = function (c, r, col, seg, rings) {
    this.ellipsoid(c, [r, 0, 0], [0, 0, r], [0, r, 0], col, seg || 8, rings || 5);
  };
  // 円すい（結晶・角・爪・とげ）。smooth: なめらかな影。なければ面ごとに平ら
  BP.cone = function (base, tip, r, col, tipCol, sides, up, smooth) {
    sides = sides || 5;
    const ax = V.sub(tip, base), len = V.len(ax) || 1;
    const t = V.mul(ax, 1 / len);
    let ref = up || (Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
    const n = V.norm(V.sub(ref, V.mul(t, V.dot(ref, t))));
    const b = V.cross(t, n);
    const tc = tipCol || col;
    const ring = [], rn = [];
    const circ = Math.PI * r;
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const rd = [n[0] * ca + b[0] * sa, n[1] * ca + b[1] * sa, n[2] * ca + b[2] * sa];
      ring.push(V.mad(base, rd, r));
      rn.push(V.norm(V.mad(rd, t, r / len)));
    }
    for (let k = 0; k < sides; k++) {
      const p0 = ring[k], p1 = ring[k + 1];
      let n0, n1, n2;
      if (smooth) { n0 = rn[k]; n1 = rn[k + 1]; n2 = V.norm(V.add(n0, n1)); }
      else {
        let fn = V.norm(V.cross(V.sub(p1, p0), V.sub(tip, p0)));
        const mid = V.sub(V.lerp(p0, p1, 0.5), base);
        if (V.dot(fn, mid) < 0) fn = V.mul(fn, -1);
        n0 = n1 = n2 = fn;
      }
      const i0 = this.vert(p0[0], p0[1], p0[2], n0[0], n0[1], n0[2], col, 0, (k / sides) * circ);
      const i1 = this.vert(p1[0], p1[1], p1[2], n1[0], n1[1], n1[2], col, 0, ((k + 1) / sides) * circ);
      const i2 = this.vert(tip[0], tip[1], tip[2], n2[0], n2[1], n2[2], tc, len, ((k + 0.5) / sides) * circ);
      this.tri(i0, i1, i2);
    }
  };
  // 平らな面の箱。c: 中心, X,Y,Z: 半分の長さのベクトル
  BP.box = function (c, X, Y, Z, col) {
    const ax = [X, Y, Z];
    for (let f = 0; f < 6; f++) {
      const ai = f >> 1, sg = f & 1 ? -1 : 1;
      const N = V.mul(ax[ai], sg), U = ax[(ai + 1) % 3], W2 = ax[(ai + 2) % 3];
      const nn = V.norm(N);
      const cc = V.add(c, N);
      const lu = V.len(U) * 2, lw = V.len(W2) * 2;
      const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const idx = [];
      for (let k = 0; k < 4; k++) {
        const p = V.add(cc, V.add(V.mul(U, q[k][0]), V.mul(W2, q[k][1])));
        idx.push(this.vert(p[0], p[1], p[2], nn[0], nn[1], nn[2], col, (q[k][0] * 0.5 + 0.5) * lu, (q[k][1] * 0.5 + 0.5) * lw));
      }
      this.tri(idx[0], idx[1], idx[2]);
      this.tri(idx[0], idx[2], idx[3]);
    }
  };
  // 剣の刃。prof: [[位置0..1, 幅の倍率, 厚みの倍率], ...]（なければ まっすぐで先がとがる）。curve: 刃のそり
  BP.blade = function (g, d, up, len, w, th, col, edgeCol, tipStart, prof, curve) {
    let u = V.sub(up, V.mul(d, V.dot(up, d)));
    if (V.len(u) < 0.05) u = V.cross(d, [1, 0, 0]);
    u = V.norm(u);
    const n = V.cross(d, u);
    const ts = tipStart === undefined ? 0.8 : tipStart;
    const secs = prof || [[0, 1, 1], [ts, 1, 1], [1, 0.02, 0.02]];
    const P = [], C = [];
    for (let s = 0; s < secs.length; s++) {
      const t = secs[s][0], k = secs[s][1], kt = secs[s][2] === undefined ? k : secs[s][2];
      const c = V.mad(V.mad(g, d, len * t), u, (curve || 0) * t * t * len);
      C.push(c);
      P.push([V.mad(c, u, (w / 2) * k), V.mad(c, n, (th / 2) * kt), V.mad(c, u, (-w / 2) * k), V.mad(c, n, (-th / 2) * kt)]);
    }
    for (let s = 0; s < secs.length - 1; s++)
      for (let k = 0; k < 4; k++) {
        const a = P[s][k], b = P[s][(k + 1) % 4], c2 = P[s + 1][k], d2 = P[s + 1][(k + 1) % 4];
        let fn = V.cross(V.sub(b, a), V.sub(c2, a));
        if (V.len(fn) < 1e-9) fn = V.cross(V.sub(d2, b), V.sub(c2, b));
        fn = V.norm(fn);
        const out = V.sub(V.lerp(a, b, 0.5), C[s]);
        if (V.dot(fn, out) < 0) fn = V.mul(fn, -1);
        const ca = k % 2 === 0 ? edgeCol || col : col, cb = k % 2 === 0 ? col : edgeCol || col;
        const va = k % 2 === 0 ? 0 : 1, vb = 1 - va;
        const u0 = secs[s][0] * len, u1 = secs[s + 1][0] * len;
        const i0 = this.vert(a[0], a[1], a[2], fn[0], fn[1], fn[2], ca, u0, va * w * 0.5);
        const i1 = this.vert(b[0], b[1], b[2], fn[0], fn[1], fn[2], cb, u0, vb * w * 0.5);
        const i2 = this.vert(c2[0], c2[1], c2[2], fn[0], fn[1], fn[2], ca, u1, va * w * 0.5);
        const i3 = this.vert(d2[0], d2[1], d2[2], fn[0], fn[1], fn[2], cb, u1, vb * w * 0.5);
        this.tri(i0, i1, i2);
        this.tri(i1, i3, i2);
      }
  };
  // 格子でつくる自由な面。P(i,j) → 点（i: 0..nu-1, j: 0..nv-1）。法線はとなりの点から自動で出す。
  // opt: col | col(i,j), wrapV（j の両端が同じ点＝輪）, center（外向きの基準点）, flip
  BP.grid = function (nu, nv, P, opt) {
    opt = opt || {};
    const base = this.nv, pts = new Array(nu * nv);
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) pts[i * nv + j] = P(i, j);
    const mi = nu >> 1, mj = nv >> 1;
    let lu = 0, lv = 0;
    for (let i = 1; i < nu; i++) lu += V.dist(pts[i * nv + mj], pts[(i - 1) * nv + mj]);
    for (let j = 1; j < nv; j++) lv += V.dist(pts[mi * nv + j], pts[mi * nv + j - 1]);
    const col = opt.col, colFn = typeof col === 'function';
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const p = pts[i * nv + j];
        const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, nu - 1);
        let j0 = j - 1, j1 = j + 1;
        if (opt.wrapV) { if (j0 < 0) j0 = nv - 2; if (j1 > nv - 1) j1 = 1; } else { j0 = Math.max(j0, 0); j1 = Math.min(j1, nv - 1); }
        const du = V.sub(pts[i1 * nv + j], pts[i0 * nv + j]), dv = V.sub(pts[i * nv + j1], pts[i * nv + j0]);
        let nn = V.cross(du, dv);
        const nl = V.len(nn);
        if (nl < 1e-9) nn = opt.center ? V.norm(V.sub(p, opt.center)) : [0, 1, 0];
        else nn = V.mul(nn, 1 / nl);
        if (opt.center) { if (V.dot(nn, V.sub(p, opt.center)) < 0) nn = V.mul(nn, -1); }
        else if (opt.flip) nn = V.mul(nn, -1);
        this.vert(p[0], p[1], p[2], nn[0], nn[1], nn[2], colFn ? col(i, j, p) : col, (i / (nu - 1)) * lu, (j / (nv - 1)) * lv);
      }
    for (let i = 0; i < nu - 1; i++)
      for (let j = 0; j < nv - 1; j++) {
        const a = base + i * nv + j, b = a + 1, c = a + nv, d = c + 1;
        this.tri(a, c, b);
        this.tri(b, c, d);
      }
    return base;
  };
  // Catmull-Rom でなめらかにした点列
  G.smoothPath = function (pts, radii, sub) {
    const op = [], or = [];
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      const r0 = radii[Math.max(0, i - 1)], r1 = radii[i], r2 = radii[i + 1], r3 = radii[Math.min(n - 1, i + 2)];
      for (let k = 0; k < sub; k++) {
        const t = k / sub, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        op.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])]);
        or.push(Math.max(0.01, f(r0, r1, r2, r3)));
      }
    }
    op.push(pts[n - 1]);
    or.push(radii[n - 1]);
    return { pts: op, radii: or };
  };

  // 効果用メッシュ（頂点: 位置3 色4。加算〜アルファ）
  function FxBatch(maxVerts) {
    this.v = new Float32Array(maxVerts * 7);
    this.i = new Uint32Array(maxVerts * 3);
    this.nv = 0; this.ni = 0; this.max = maxVerts;
  }
  G.FxBatch = FxBatch;
  FxBatch.prototype.reset = function () { this.nv = 0; this.ni = 0; };
  FxBatch.prototype.vert = function (p, c) {
    if (this.nv >= this.max) return this.nv - 1;
    const o = this.nv * 7, v = this.v;
    v[o] = p[0]; v[o + 1] = p[1]; v[o + 2] = p[2]; v[o + 3] = c[0]; v[o + 4] = c[1]; v[o + 5] = c[2]; v[o + 6] = c[3];
    return this.nv++;
  };
  FxBatch.prototype.tri = function (a, b, c) {
    if (this.ni + 3 > this.i.length) return;
    this.i[this.ni++] = a; this.i[this.ni++] = b; this.i[this.ni++] = c;
  };
  FxBatch.prototype.quad = function (a, b, c, d, ca, cb, cc, cd) {
    const i0 = this.vert(a, ca), i1 = this.vert(b, cb || ca), i2 = this.vert(c, cc || ca), i3 = this.vert(d, cd || cb || ca);
    this.tri(i0, i1, i2);
    this.tri(i0, i2, i3);
  };

  // ---------- シェーダー ----------
  const NOISE = `
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash31(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i), hash31(i+vec3(1,0,0)), f.x), mix(hash31(i+vec3(0,1,0)), hash31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i+vec3(0,0,1)), hash31(i+vec3(1,0,1)), f.x), mix(hash31(i+vec3(0,1,1)), hash31(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm2(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v / 0.875; }
float fbm3(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * vnoise3(p); p = p * 2.03 + 17.1; a *= 0.5; } return v / 0.875; }
vec3 voro(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = vec2(hash21(i+g), hash21(i+g+17.3));
    float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; id = hash21(i+g+3.7); } else if (d < d2) d2 = d; }
  return vec3(d1, d2, id); }
`;
  const COMMON = `
uniform vec3 uCam; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSkyCol; uniform vec3 uGndCol; uniform vec3 uFogCol; uniform vec3 uFogSun;
uniform float uFogD; uniform float uShTexel; uniform float uShTexel2; uniform float uTime; uniform float uStorm;
uniform highp sampler2DShadow uShadow; uniform highp sampler2DShadow uShadowFar;
uniform float uEnc;
vec3 enc(vec3 c){ return uEnc > 0.5 ? c / (1.0 + max(c.r, max(c.g, c.b))) : c; }
float pcf(highp sampler2DShadow t, vec3 p, float tx, float bias){
  float s = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++)
    s += texture(t, vec3(p.xy + vec2(float(x), float(y)) * tx * 1.25, p.z - bias));
  return s / 9.0;
}
float shadowAt(vec4 lp, vec4 lq){
  vec3 q = lq.xyz / lq.w * 0.5 + 0.5;
  float far = 1.0;
  if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0 && q.z < 1.0) far = pcf(uShadowFar, q, uShTexel2, 0.0011);
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return far;
  float near = pcf(uShadow, p, uShTexel, 0.0016);
  vec2 e = abs(p.xy - 0.5) * 2.0;
  float edge = smoothstep(0.86, 1.0, max(e.x, e.y));
  return mix(min(near, far), far, edge);
}
vec3 fogColor(vec3 rd){ float s = max(dot(rd, uSun), 0.0); return uFogCol + uFogSun * (pow(s, 8.0) * 0.55 + pow(s, 2.0) * 0.16); }
vec3 fogged(vec3 c, vec3 wp){
  vec3 dv = wp - uCam; float d = length(dv);
  float f = 1.0 - exp(-pow(d * uFogD, 1.3));
  f *= 1.0 - smoothstep(10.0, 55.0, wp.y) * 0.5;
  return mix(c, fogColor(dv / max(d, 0.001)), clamp(f, 0.0, 1.0));
}
${NOISE}`;
  const LIT_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec4 aCol; layout(location=3) in vec4 aMat;
uniform mat4 uVP; uniform mat4 uLVP; uniform mat4 uLVP2;
out vec3 vPos; out vec3 vNrm; out vec4 vCol; out vec4 vMat; out vec4 vLP; out vec4 vLQ;
void main(){ vPos = aPos; vNrm = aNrm; vCol = aCol; vMat = aMat;
  vLP = uLVP * vec4(aPos + aNrm * 0.08, 1.0); vLQ = uLVP2 * vec4(aPos + aNrm * 0.22, 1.0); gl_Position = uVP * vec4(aPos, 1.0); }`;
  const LIT_FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNrm; in vec4 vCol; in vec4 vMat; in vec4 vLP; in vec4 vLQ;
${COMMON}
uniform vec4 uTint; uniform float uQual; uniform float uSpecK;
out vec4 o;
vec3 skyEnv(vec3 r){
  vec3 c = mix(uFogCol, uSkyCol * 1.7, smoothstep(0.0, 0.7, r.y));
  c = mix(uGndCol * 1.4, c, smoothstep(-0.3, 0.05, r.y));
  c += uSunCol * 0.4 * pow(max(dot(r, uSun), 0.0), 20.0);
  return c;
}
// 模様の細かさ(freq) が 1ピクセルより細かくなったら消す（遠くのちらつき止め）
float fadeF(float freq, float fw){ return smoothstep(0.7, 0.22, freq * fw); }
// でこぼこの高さ：体など（模様の座標 uv を使う）
float hUV(int mat, vec2 uv, float aux, float fw){
  if (mat == 1) {
    vec2 p = uv * 7.0;
    vec2 q = vec2(p.x, p.y + 0.5 * mod(floor(p.x), 2.0));
    vec2 f = fract(q) - 0.5;
    float d = length(f * vec2(1.0, 1.1));
    float sc = smoothstep(0.62, 0.2, d) * (0.35 + 0.65 * (0.5 - f.x));
    float bp = fract(uv.x * 2.6);
    float plate = smoothstep(0.0, 0.3, bp) * smoothstep(1.0, 0.6, bp);
    return mix(sc * 0.028 * fadeF(7.0, fw), plate * 0.03 * fadeF(2.6, fw), aux);
  }
  if (mat == 2) {
    float ring = sin(uv.x * 34.0 + vnoise(uv * 3.0) * 3.0) * 0.5 + 0.5;
    return (ring * 0.5 * fadeF(5.4, fw) + vnoise(vec2(uv.y * 46.0, uv.x * 2.2)) * 0.6 * fadeF(46.0, fw)) * 0.012;
  }
  if (mat == 4) return vnoise(uv * 26.0) * 0.003 * fadeF(26.0, fw);
  if (mat == 5) return (vnoise(uv * 70.0) * 0.5 * fadeF(70.0, fw) + vnoise(uv * 14.0)) * 0.0022;
  if (mat == 8) { float g = vnoise(vec2(uv.y * 7.0, uv.x * 1.1)); return abs(g - 0.5) * 0.08 * fadeF(7.0, fw) + vnoise(vec2(uv.y * 26.0, uv.x * 5.0)) * 0.01 * fadeF(26.0, fw); }
  if (mat == 11) return vnoise(vec2(uv.x * 3.0, uv.y * 70.0)) * 0.004 * fadeF(70.0, fw);
  if (mat == 12) return vnoise(uv * 14.0) * 0.004;
  return 0.0;
}
// でこぼこの高さ：動かないもの（世界の座標を使う）
float hW(int mat, vec3 p, float aux, float fw){
  if (mat == 7) {
    float n2 = fbm3(p * 1.6 + 11.0);
    float crack = 1.0 - smoothstep(0.0, 0.09, abs(n2 - 0.5));
    return n2 * 0.15 - crack * 0.05 * fadeF(8.0, fw) + vnoise3(p * 9.0) * 0.02 * fadeF(9.0, fw);
  }
  if (mat == 9) return (vnoise3(p * 4.2) * 0.6 * fadeF(4.2, fw) + vnoise3(p * 15.0) * 0.4 * fadeF(15.0, fw)) * 0.14;
  if (mat == 10) {
    float d0 = vnoise(p.xz * 1.3) * 0.55 + vnoise(p.xz * 6.0) * 0.3 * fadeF(6.0, fw) + vnoise(p.xz * 23.0) * 0.15 * fadeF(23.0, fw);
    float hh = d0 * 0.05;
    if (aux < -0.02) hh = mix(hh, fbm3(p * 1.4 + 11.0) * 0.17, smoothstep(0.25, 0.6, -aux));
    return hh;
  }
  return 0.0;
}
void main(){
  vec3 n = normalize(vNrm);
  vec3 vdir = uCam - vPos;
  float dist = length(vdir);
  vec3 v = vdir / dist;
  vec3 dpx = dFdx(vPos), dpy = dFdy(vPos);
  vec3 fn = normalize(cross(dpx, dpy));
  if (dot(fn, v) < 0.0) fn = -fn;
  vec3 alb = vCol.rgb;
  float em = vCol.a;
  vec3 emCol = alb;
  int mat = int(vMat.z + 0.5);
  vec2 uv = vMat.xy; float aux = vMat.w;
  vec2 dux = dFdx(uv), duy = dFdy(uv);
  float fwu = max(length(dux), length(duy));
  float fwp = max(length(dpx), length(dpy));
  float rough = 0.8, f0 = 0.03, trans = 0.0, wrap = 0.0, ao = 1.0, metal = 0.0;
  float lod = 1.0 - smoothstep(30.0, 90.0, dist);
  if (mat == 1) {            // 鱗の皮。aux: 0=鱗 1=腹の板。発光のチャンネルは「雷の筋」の強さ
    vec2 p = uv * 7.0;
    vec2 q = vec2(p.x, p.y + 0.5 * mod(floor(p.x), 2.0));
    vec2 f = fract(q) - 0.5;
    float rnd = hash21(floor(q));
    float d = length(f * vec2(1.0, 1.1));
    float bp = fract(uv.x * 2.6);
    float crev = mix(smoothstep(0.64, 0.38, d), smoothstep(0.0, 0.14, bp) * smoothstep(1.0, 0.9, bp), aux);
    float fs = mix(fadeF(7.0, fwu), fadeF(2.6, fwu), aux);
    float big = fbm2(uv * 0.55 + 3.0);
    alb *= mix(0.85, mix(0.5, 1.0, crev) * (0.82 + 0.34 * rnd * (1.0 - aux)), fs) * (0.66 + 0.68 * big);
    alb += vec3(0.0, 0.01, 0.022) * rnd * (1.0 - aux) * fs;
    rough = mix(0.46 + 0.16 * rnd * fs, 0.66, aux); f0 = 0.045;
    float vn = abs(fbm2(uv * vec2(0.5, 0.42) + vec2(3.1, 7.7)) - 0.5);
    float vn2 = abs(fbm2(uv * vec2(1.3, 1.1) + vec2(9.4, 1.2)) - 0.5);
    float wv = 0.012 + min(fwu * 0.6, 0.014);
    float vein = (smoothstep(wv * 1.6, 0.0, vn) + smoothstep(wv, 0.0, vn2) * 0.45) * (1.0 - aux);
    float pulse = 0.75 + 0.25 * sin(uTime * 5.0 - uv.x * 1.6);
    emCol = vec3(0.14, 0.78, 1.0);
    alb *= 1.0 - vein * 0.45;
    em = vein * min(em, 1.25) * pulse * 0.6 / (1.0 + fwu * 22.0);
  } else if (mat == 2) {     // 角・骨・爪
    float ring = sin(uv.x * 34.0 + vnoise(uv * 3.0) * 3.0) * 0.5 + 0.5;
    float gr = vnoise(vec2(uv.y * 46.0, uv.x * 2.2));
    alb *= 0.86 + (0.3 * gr - 0.12) * fadeF(46.0, fwu) - 0.14 * ring * fadeF(5.4, fwu);
    rough = 0.42; f0 = 0.05;
  } else if (mat == 3) {     // 結晶（面ごとに平ら・中から光る）
    n = fn;
    float fr = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    float inner = vnoise(uv * 5.0 + n.xz * 1.7);
    alb *= 0.7 + 0.6 * inner;
    rough = 0.1; f0 = 0.14; trans = 0.5;
    em = em * (0.5 + 0.7 * inner + fr * 0.8);
  } else if (mat == 4) {     // 金属
    float dn = mix(0.5, vnoise(uv * 26.0), fadeF(26.0, fwu));
    alb *= 0.82 + 0.3 * dn;
    rough = 0.32 + 0.2 * dn; f0 = 0.6; metal = 1.0;
  } else if (mat == 5) {     // 革
    float g2 = mix(0.5, vnoise(uv * 11.0), fadeF(11.0, fwu));
    alb *= 0.8 + 0.34 * g2 + 0.1 * (mix(0.5, vnoise(uv * 70.0), fadeF(70.0, fwu)) - 0.5);
    rough = 0.56; f0 = 0.04;
  } else if (mat == 6) {     // 肌
    wrap = 0.4; rough = 0.55; f0 = 0.035;
  } else if (mat == 7) {     // 岩（世界の座標で模様。上の面にこけ）
    float n1 = fbm3(vPos * 0.33), n2 = fbm3(vPos * 1.6 + 11.0), n3 = mix(0.5, vnoise3(vPos * 9.0), fadeF(9.0, fwp));
    float strata = sin((vPos.y + n1 * 2.6) * 4.6) * 0.5 + 0.5;
    float crack = (1.0 - smoothstep(0.0, 0.09, abs(n2 - 0.5))) * fadeF(8.0, fwp);
    alb *= 0.66 + 0.55 * n1 + 0.16 * n3 - 0.3 * crack;
    alb = mix(alb, alb * vec3(1.12, 1.0, 0.86), strata * 0.45);
    float moss = smoothstep(0.42, 0.78, n.y + (n2 - 0.5) * 1.0) * smoothstep(0.25, 0.6, n1 + 0.12);
    alb = mix(alb, vec3(0.085, 0.15, 0.03) * (0.6 + 0.8 * n3), moss * 0.88);
    rough = 0.92; ao = mix(0.45, 1.0, smoothstep(0.0, 1.0, aux));
  } else if (mat == 8) {     // 木の皮
    float g = vnoise(vec2(uv.y * 7.0, uv.x * 1.1)), g2 = mix(0.5, vnoise(vec2(uv.y * 26.0, uv.x * 5.0)), fadeF(26.0, fwu));
    alb *= 0.5 + 0.7 * mix(0.5, abs(g - 0.5) * 2.0, fadeF(7.0, fwu)) + 0.2 * g2;
    rough = 0.95;
  } else if (mat == 9) {     // 葉（光がすける）。aux: 0=幹に近い内がわ 1=外がわ
    float nn = mix(0.5, vnoise3(vPos * 4.2), fadeF(4.2, fwp)), n2 = mix(0.5, vnoise3(vPos * 15.0), fadeF(15.0, fwp));
    alb *= 0.55 + 0.6 * nn + 0.3 * n2;
    trans = 0.6; wrap = 0.35; rough = 0.75; f0 = 0.03;
    ao = mix(0.35, 1.0, aux);
  } else if (mat == 10) {    // 地面。aux: 正=土の量、負=岩の量
    vec2 xz = vPos.xz;
    float d0 = vnoise(xz * 1.3) * 0.55 + mix(0.5, vnoise(xz * 6.0), fadeF(6.0, fwp)) * 0.3 + mix(0.5, vnoise(xz * 23.0), fadeF(23.0, fwp)) * 0.15;
    float big = fbm2(xz * 0.07 + 5.0);
    float rk = smoothstep(0.25, 0.6, -aux + (vnoise(xz * 0.9) - 0.5) * 0.5);
    float dw = smoothstep(0.4, 0.6, aux + (vnoise(xz * 2.1) - 0.5) * 0.4 + (vnoise(xz * 8.5) - 0.5) * 0.14 * fadeF(8.5, fwp));
    vec3 dirt = mix(vec3(0.1, 0.064, 0.036), vec3(0.21, 0.14, 0.078), d0);
    vec3 pb = dw > 0.001 ? voro(xz * 1.9) : vec3(1.0, 1.0, 0.0);
    float stone = smoothstep(0.24, 0.12, pb.x) * smoothstep(0.72, 0.8, pb.z) * fadeF(4.0, fwp);
    dirt = mix(dirt, vec3(0.17, 0.165, 0.155) * (0.6 + 0.6 * pb.z), stone * 0.85);
    vec3 gr = alb * (0.6 + 0.8 * d0) * mix(vec3(1.0), vec3(1.25, 1.08, 0.62), smoothstep(0.42, 0.72, big) * 0.55);
    gr = mix(gr, vec3(0.115, 0.2, 0.042) * (0.85 + 0.3 * d0) * mix(vec3(1.0), vec3(1.2, 1.05, 0.7), smoothstep(0.42, 0.72, big) * 0.5), smoothstep(6.0, 40.0, dist) * 0.8);
    alb = mix(gr, dirt, dw);
    if (rk > 0.001) {
      float n1 = fbm3(vPos * 0.3), n2 = fbm3(vPos * 1.4 + 11.0), n3 = mix(0.5, vnoise3(vPos * 8.0), fadeF(8.0, fwp));
      float strata = sin((vPos.y + n1 * 3.0) * 3.4) * 0.5 + 0.5;
      float crack = (1.0 - smoothstep(0.0, 0.09, abs(n2 - 0.5))) * fadeF(7.0, fwp);
      vec3 rc = vec3(0.25, 0.235, 0.215) * (0.62 + 0.6 * n1 + 0.16 * n3 - 0.3 * crack);
      rc = mix(rc, rc * vec3(1.14, 1.0, 0.84), strata * 0.5);
      float moss = smoothstep(0.55, 0.85, n.y + (n2 - 0.5) * 0.8);
      rc = mix(rc, gr * 0.8, moss * 0.8);
      alb = mix(alb, rc, rk);
    }
    rough = 0.95;
  } else if (mat == 11) {    // 木
    alb *= 0.68 + 0.5 * mix(0.5, vnoise(vec2(uv.x * 3.0, uv.y * 70.0)), fadeF(70.0, fwu)); rough = 0.7;
  } else if (mat == 12) {    // 布。aux: 光のすけぐあい
    float g2 = vnoise(uv * 9.0);
    alb *= 0.9 + 0.2 * g2;
    rough = 0.9; f0 = 0.02; wrap = 0.35; trans = aux * 0.5;
  } else if (mat == 13) {    // つやのある玉（目）
    rough = 0.08; f0 = 0.1;
  }
  // でこぼこを法線にする（となりの点との高さの差。ピクセルの大きさに合わせてならす）
  bool flatGround = mat == 10 && aux > -0.02 && aux < 0.04;
  if (uQual > 0.5 && mat != 3 && !flatGround) {
    if (mat == 7 || mat == 9 || mat == 10) {
      float e = max(0.012, fwp * 1.3);
      float h0 = hW(mat, vPos, aux, fwp);
      vec3 g = vec3(hW(mat, vPos + vec3(e, 0.0, 0.0), aux, fwp), hW(mat, vPos + vec3(0.0, e, 0.0), aux, fwp), hW(mat, vPos + vec3(0.0, 0.0, e), aux, fwp)) - h0;
      g /= e;
      g -= n * dot(g, n);
      n = normalize(n - g * lod);
    } else if (mat != 0 && mat != 6 && mat != 13) {
      float e = max(0.0025, fwu * 1.3);
      float h0 = hUV(mat, uv, aux, fwu), h1 = hUV(mat, uv + vec2(e, 0.0), aux, fwu), h2 = hUV(mat, uv + vec2(0.0, e), aux, fwu);
      vec3 dp2p = cross(dpy, n), dp1p = cross(n, dpx);
      vec3 T = dp2p * dux.x + dp1p * duy.x, B = dp2p * dux.y + dp1p * duy.y;
      float mx = max(dot(T, T), dot(B, B));
      if (mx > 1e-24) {
        float inv = inversesqrt(mx) * sign(dot(dpx, dp2p));
        n = normalize(n - (T * (h1 - h0) + B * (h2 - h0)) * (inv / e) * lod);
      }
    }
  }
  float sh = shadowAt(vLP, vLQ);
  float ndl0 = dot(n, uSun);
  float ndl = max(ndl0, 0.0);
  float dif = max((ndl0 + wrap) / (1.0 + wrap), 0.0);
  vec3 amb = mix(uGndCol, uSkyCol, n.y * 0.5 + 0.5);
  amb += uSunCol * 0.045 * max(dot(n, normalize(vec3(-uSun.x, 0.25, -uSun.z))), 0.0);
  vec3 hv = normalize(v + uSun);
  float ndh = max(dot(n, hv), 0.0), ndv = max(dot(n, v), 0.001), vdh = max(dot(v, hv), 0.0);
  rough = max(rough, min(fwp * 6.0, 0.6));
  { vec3 dnx = dFdx(n), dny = dFdy(n); rough = sqrt(min(rough * rough + min((dot(dnx, dnx) + dot(dny, dny)) * 0.6, 0.3), 1.0)); }
  float a = rough * rough, a2 = a * a;
  float dd = ndh * ndh * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * dd * dd);
  float k = a * 0.5;
  float Gv = 1.0 / ((ndl * (1.0 - k) + k) * (ndv * (1.0 - k) + k) * 4.0);
  float F = f0 + (1.0 - f0) * pow(1.0 - vdh, 5.0);
  vec3 specCol = mix(vec3(1.0), alb * 2.2, metal);
  vec3 spec = specCol * uSunCol * min(D * Gv * F, 1.6) * ndl * sh;
  float fe = f0 + (1.0 - f0) * pow(1.0 - ndv, 5.0);
  vec3 env = skyEnv(reflect(-v, n)) * specCol * fe * (1.0 - rough) * (1.0 - rough) * ao;
  vec3 c = alb * (1.0 - metal * 0.8) * (amb * ao + uSunCol * dif * sh) + (spec + env) * uSpecK;
  c += alb * uSunCol * trans * (pow(max(dot(v, -uSun), 0.0), 3.0) * 0.5 + max(-ndl0, 0.0) * 0.3) * sh * ao;
  c += emCol * em * 4.0;
  c = mix(c, uTint.rgb, uTint.a);
  o = vec4(enc(min(fogged(c, vPos), vec3(10.0))), 1.0);
}`;
  const DEPTH_VS = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uVP;
void main(){ gl_Position = uVP * vec4(aPos, 1.0); }`;
  const DEPTH_FS = `#version 300 es
precision mediump float; void main(){}`;
  const GRASS_VS = `#version 300 es
layout(location=0) in vec2 aV; layout(location=1) in vec4 aI; layout(location=2) in vec4 aJ;
uniform mat4 uVP; uniform mat4 uLVP; uniform mat4 uLVP2; uniform float uTime; uniform vec4 uPush[3]; uniform float uHead; uniform vec3 uCamR; uniform vec3 uCamU; uniform vec3 uEye; uniform float uPixK;
out vec3 vPos; out vec4 vCol; out vec4 vLP; out vec4 vLQ; out float vH; out vec2 vQ; out vec3 vN; out float vFar;
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x), mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec3 root = aI.xyz;
  float h = aJ.x;
  float cy = cos(aI.w), sy = sin(aI.w);
  vec2 off = vec2(0.0);
  float flat_ = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 d = root.xz - uPush[i].xy;
    float l = length(d);
    float f = clamp(1.0 - l / uPush[i].z, 0.0, 1.0);
    off += (d / max(l, 0.01)) * f * 0.8;
    flat_ = max(flat_, f * uPush[i].w);
  }
  // 風：大きなうねりが谷を渡っていく
  float gust = vnoise(root.xz * 0.05 + vec2(uTime * 0.34, uTime * 0.2));
  float gust2 = vnoise(root.xz * 0.19 - vec2(uTime * 0.55, uTime * 0.12));
  float w = (gust * 1.7 - 0.45) + (gust2 - 0.5) * 0.7 + sin(uTime * 2.9 + root.x * 1.3 + root.z * 0.9) * 0.1;
  vec2 bend = vec2(0.82, 0.46) * w * 0.3 + off;
  float isHead = step(0.5, uHead);
  float y = mix(aV.y, 1.0, isHead);
  h *= 1.0 - flat_ * 0.6;
  vec3 p = root;
  float dcam = distance(root, uEye);
  float far = smoothstep(7.0, 38.0, dcam);
  float wd = max(aJ.y, dcam * uPixK * 2.0);
  float sink = 1.0 - 0.55 * smoothstep(26.0, 60.0, dcam);
  p.xz += vec2(cy, sy) * aV.x * wd * (1.0 - y * mix(0.85, 0.4, far)) * (1.0 - isHead);
  vFar = far;
  p.xz += bend * y * y * h;
  p.y += y * h * sink * (1.0 - 0.3 * dot(bend, bend));
  p += (uCamR * aV.x + uCamU * (aV.y - 0.5) * 2.0) * 0.5 * isHead * (0.075 + 0.04 * aJ.z);
  vPos = p; vH = y; vQ = vec2(aV.x, (aV.y - 0.5) * 2.0);
  vN = normalize(vec3(-bend.x * y * 1.6 + cy * aV.x * 0.9 * (1.0 - far), 1.0, -bend.y * y * 1.6 + sy * aV.x * 0.9 * (1.0 - far)));
  float patch_ = vnoise(root.xz * 0.055 + 40.0);
  vCol = vec4(mix(aJ.z, 0.5, far * 0.9), smoothstep(0.38, 0.72, patch_), gust * (0.4 + 0.6 * gust2), aJ.w);
  vLP = uLVP * vec4(root + vec3(0.0, 0.15, 0.0), 1.0);
  vLQ = uLVP2 * vec4(root + vec3(0.0, 0.3, 0.0), 1.0);
  gl_Position = uVP * vec4(p, 1.0);
}`;
  const GRASS_FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec4 vCol; in vec4 vLP; in vec4 vLQ; in float vH; in vec2 vQ; in vec3 vN; in float vFar;
${COMMON}
uniform vec3 uG0; uniform vec3 uG1; uniform float uHead;
out vec4 o;
void main(){
  float sh = shadowAt(vLP, vLQ);
  vec3 amb = mix(uGndCol, uSkyCol, 0.8);
  vec3 vd = normalize(vPos - uCam);
  if (uHead > 0.5) {
    float r = length(vQ), an = atan(vQ.y, vQ.x);
    float pet = 0.62 + 0.38 * abs(cos(an * 2.5));
    if (r > pet) discard;
    int kind = int(vCol.a + 0.5);
    vec3 pc = kind == 1 ? vec3(0.95, 0.93, 0.86) : kind == 2 ? vec3(1.0, 0.72, 0.1) : vec3(0.45, 0.4, 0.95);
    vec3 alb = r < 0.3 ? vec3(0.95, 0.6, 0.06) : pc * (0.75 + 0.25 * r);
    vec3 c = alb * (amb + uSunCol * (0.5 + 0.3 * max(dot(vd, uSun), 0.0)) * sh);
    o = vec4(enc(fogged(c, vPos)), 1.0);
    return;
  }
  float hh = mix(vH, 0.62, vFar * 0.75);   // 遠くでは 根もと と 先 の色の差を小さくする
  vec3 dry = vec3(0.34, 0.3, 0.07), lush = mix(uG0, uG1, hh);
  vec3 alb = mix(lush, mix(uG0 * 1.5, dry, hh), vCol.g * 0.75) * (0.76 + 0.48 * vCol.r);
  vec3 n = normalize(vN);
  float ndl = max(dot(n, uSun), 0.0) * 0.8 + 0.2;
  vec3 c = alb * (amb * mix(0.42, 1.0, hh) + uSunCol * ndl * sh * mix(0.45, 1.0, hh));
  float back = pow(max(dot(vd, uSun), 0.0), 3.0);
  float tipK = vH * vH * (1.0 - vFar * 0.7);
  c += alb * uSunCol * (back * 1.3 + 0.12) * tipK * sh;
  c += uSunCol * vec3(0.5, 0.6, 0.25) * 0.11 * vCol.b * tipK * sh;
  o = vec4(enc(min(fogged(c, vPos), vec3(10.0))), 1.0);
}`;
  const SKY_VS = `#version 300 es
layout(location=0) in vec2 aP; out vec2 vP;
void main(){ vP = aP; gl_Position = vec4(aP, 1.0, 1.0); }`;
  const SKY_FS = `#version 300 es
precision highp float;
in vec2 vP; uniform mat4 uInvVP; uniform vec3 uSun; uniform vec3 uFogCol; uniform vec3 uFogSun; uniform float uTime; uniform float uStorm;
uniform float uEnc;
vec3 enc(vec3 c){ return uEnc > 0.5 ? c / (1.0 + max(c.r, max(c.g, c.b))) : c; }
out vec4 o;
${NOISE}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
vec3 fogColor(vec3 rd){ float s = max(dot(rd, uSun), 0.0); return uFogCol + uFogSun * (pow(s, 8.0) * 0.55 + pow(s, 2.0) * 0.16); }
void main(){
  vec4 a = uInvVP * vec4(vP, -1.0, 1.0); vec4 b = uInvVP * vec4(vP, 1.0, 1.0);
  vec3 rd = normalize(b.xyz / b.w - a.xyz / a.w);
  float y = max(rd.y, 0.0);
  float sd = max(dot(rd, uSun), 0.0);
  float calm = 1.0 - uStorm;
  vec3 zen = mix(vec3(0.07, 0.19, 0.56), vec3(0.03, 0.04, 0.1), uStorm);
  vec3 hor = fogColor(rd);
  vec3 col = mix(hor, zen, pow(y, 0.48));
  col += uFogSun * (pow(sd, 40.0) * 0.9 + pow(sd, 7.0) * 0.3) * (1.0 - uStorm * 0.85);
  col += vec3(1.0, 0.9, 0.72) * smoothstep(0.99925, 0.9997, sd) * 9.0 * calm;
  if (rd.y > 0.005) {
    // 高いすじ雲
    vec2 u2 = rd.xz / (rd.y + 0.3) * vec2(0.9, 2.6) + vec2(uTime * 0.004, 0.0);
    float ci = smoothstep(0.52, 0.85, fbm(u2 + 31.0)) * smoothstep(0.0, 0.25, rd.y) * 0.35 * calm;
    col = mix(col, vec3(1.0, 0.86, 0.72) * (0.9 + 1.2 * pow(sd, 3.0)), ci);
    // わた雲（太陽の側が明るく、ふちが金色に光る）
    vec2 uv = rd.xz / (rd.y + 0.12) * 1.5 + vec2(uTime * 0.012, uTime * 0.005);
    float c = fbm(uv);
    float cov = mix(0.56, 0.3, uStorm);
    float m = smoothstep(cov, cov + 0.28, c) * smoothstep(0.0, 0.16, rd.y);
    float toSun = fbm(uv + normalize(uSun.xz + 1e-4) * 0.22);
    float lit = clamp((c - toSun) * 3.2 + 0.55, 0.0, 1.0);
    vec3 cl = mix(vec3(0.34, 0.37, 0.52), vec3(1.25, 1.02, 0.78), lit);
    cl += vec3(1.5, 0.85, 0.4) * pow(sd, 5.0) * (1.0 - smoothstep(cov, cov + 0.5, c)) * 1.6;
    cl = mix(cl, vec3(0.1, 0.11, 0.17) + vec3(0.08, 0.1, 0.16) * lit, uStorm * 0.92);
    col = mix(col, cl, m * 0.92);
  }
  // 遠くの山なみ（3層。遠いほど空の色にとける）
  float ang = atan(rd.x, rd.z);
  float r0 = 0.05 + 0.2 * fbm(vec2(ang * 1.6 + 7.0, 1.5)) + 0.03 * vnoise(vec2(ang * 13.0, 9.0));
  float r1 = 0.04 + 0.15 * fbm(vec2(ang * 2.4 + 3.0, 0.5)) + 0.025 * vnoise(vec2(ang * 21.0, 2.0));
  float r2 = 0.015 + 0.105 * fbm(vec2(ang * 3.3 + 11.0, 4.5)) + 0.018 * vnoise(vec2(ang * 31.0, 7.0));
  vec3 m0 = mix(vec3(0.42, 0.5, 0.72), vec3(0.1, 0.12, 0.2), uStorm);
  vec3 m1 = mix(vec3(0.27, 0.36, 0.56), vec3(0.08, 0.1, 0.17), uStorm);
  vec3 m2 = mix(vec3(0.15, 0.25, 0.33), vec3(0.05, 0.07, 0.11), uStorm);
  float snow = smoothstep(r0 - 0.06, r0 - 0.015, rd.y + 0.02 * vnoise(vec2(ang * 40.0, 3.0))) * (1.0 - uStorm * 0.6);
  vec3 c0 = mix(m0, vec3(1.0, 0.9, 0.82), snow * 0.75);
  c0 = mix(c0, hor, 0.55);
  col = mix(col, c0, smoothstep(r0 + 0.003, r0 - 0.003, rd.y));
  col = mix(col, mix(m1, hor, 0.38), smoothstep(r1 + 0.003, r1 - 0.003, rd.y));
  col = mix(col, mix(m2, hor, 0.2), smoothstep(r2 + 0.003, r2 - 0.003, rd.y));
  col = mix(col, hor, smoothstep(0.035, -0.02, rd.y));
  o = vec4(enc(min(col, vec3(12.0))), 1.0);
}`;
  const PART_VS = `#version 300 es
layout(location=0) in vec2 aQ; layout(location=1) in vec4 aP; layout(location=2) in vec4 aC; layout(location=3) in vec4 aV;
uniform mat4 uV; uniform mat4 uP;
out vec2 vQ; out vec4 vC;
void main(){
  vec4 vp = uV * vec4(aP.xyz, 1.0);
  vec2 q = aQ * aP.w;
  if (aV.w > 0.0) {
    vec3 vv = (uV * vec4(aV.xyz, 0.0)).xyz;
    float sp = length(vv.xy);
    vec2 ax = sp > 0.001 ? vv.xy / sp : vec2(0.0, 1.0);
    vec2 pr = vec2(-ax.y, ax.x);
    q = ax * aQ.y * aP.w * (1.0 + aV.w * sp) + pr * aQ.x * aP.w * 0.45;
  }
  vp.xy += q;
  vQ = aQ; vC = aC;
  gl_Position = uP * vp;
}`;
  const PART_FS = `#version 300 es
precision highp float;
in vec2 vQ; in vec4 vC; out vec4 o;
void main(){
  float r = length(vQ);
  float a = smoothstep(1.0, 0.0, r);
  a = a * a;
  o = vec4(vC.rgb * a, vC.a * a);
}`;
  const FX_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; uniform mat4 uVP; out vec4 vC;
void main(){ vC = aCol; gl_Position = uVP * vec4(aPos, 1.0); }`;
  const FX_FS = `#version 300 es
precision highp float; in vec4 vC; out vec4 o; void main(){ o = vC; }`;
  const QUAD_VS = `#version 300 es
layout(location=0) in vec2 aP; out vec2 vUV; void main(){ vUV = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }`;
  // 半分の解像度で「接する所の暗がり」と「光のすじ」を同時に計算する（r: 暗がり, g: 光のすじ）
  const AV_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform highp sampler2D uDepth; uniform highp sampler2DShadow uShadow; uniform highp sampler2DShadow uShadowFar;
uniform mat4 uInvVP; uniform mat4 uVPm; uniform mat4 uLVP; uniform mat4 uLVP2; uniform vec3 uCam; uniform vec3 uSun; uniform vec2 uPx; uniform float uTime;
out vec4 o;
vec3 wpos(vec2 uv, float d){ vec4 p = uInvVP * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
float lin(float z){ return 252.0 / (420.3 - (z * 2.0 - 1.0) * 419.7); }
float litAt(vec3 q){
  vec4 a = uLVP * vec4(q, 1.0); vec3 p = a.xyz / a.w * 0.5 + 0.5;
  float l = 1.0;
  vec4 b = uLVP2 * vec4(q, 1.0); vec3 p2 = b.xyz / b.w * 0.5 + 0.5;
  if (p2.x > 0.0 && p2.x < 1.0 && p2.y > 0.0 && p2.y < 1.0 && p2.z < 1.0) l = texture(uShadowFar, vec3(p2.xy, p2.z - 0.0006));
  if (p.x > 0.02 && p.x < 0.98 && p.y > 0.02 && p.y < 0.98 && p.z < 1.0) l = min(l, texture(uShadow, vec3(p.xy, p.z - 0.001)));
  return l;
}
void main(){
  float d = texture(uDepth, vUV).r;
  vec3 P = wpos(vUV, d);
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float ao = 1.0;
  if (d < 0.99995) {
    float dxp = texture(uDepth, vUV + vec2(uPx.x, 0.0)).r, dxm = texture(uDepth, vUV - vec2(uPx.x, 0.0)).r;
    float dyp = texture(uDepth, vUV + vec2(0.0, uPx.y)).r, dym = texture(uDepth, vUV - vec2(0.0, uPx.y)).r;
    vec3 ddx = abs(dxp - d) < abs(dxm - d) ? wpos(vUV + vec2(uPx.x, 0.0), dxp) - P : P - wpos(vUV - vec2(uPx.x, 0.0), dxm);
    vec3 ddy = abs(dyp - d) < abs(dym - d) ? wpos(vUV + vec2(0.0, uPx.y), dyp) - P : P - wpos(vUV - vec2(0.0, uPx.y), dym);
    vec3 N = normalize(cross(ddx, ddy));
    if (dot(N, uCam - P) < 0.0) N = -N;
    float dist = length(P - uCam);
    float rad = clamp(dist * 0.09, 0.35, 1.5);
    vec3 t = normalize(cross(N, vec3(0.31, 0.87, 0.38)));
    vec3 bt = cross(N, t);
    float occ = 0.0;
    float lp = lin(d);
    for (int i = 0; i < NAO; i++) {
      float fi = float(i);
      float an = (fi + ign) * 2.399963, r = sqrt((fi + 0.5) / float(NAO));
      float hg = sqrt(max(1.0 - r * r, 0.0));
      vec3 S = P + (t * cos(an) * r + bt * sin(an) * r + N * (hg * 0.75 + 0.08)) * rad;
      vec4 c = uVPm * vec4(S, 1.0);
      vec2 suv = c.xy / c.w * 0.5 + 0.5;
      float ls = c.w;
      float ld = lin(texture(uDepth, suv).r);
      float rc = smoothstep(0.0, 1.0, rad * 1.6 / max(abs(lp - ld), 0.0001));
      occ += step(ld, ls - 0.04) * rc;
    }
    ao = 1.0 - occ / float(NAO);
    ao = mix(1.0, ao, exp(-dist * 0.018));
  }
  // 光のすじ：カメラからの線を進み、日なたの空気だけを足す
  vec3 rd = P - uCam;
  float L = min(length(rd), 75.0);
  rd = normalize(rd);
  float acc = 0.0;
  float stp = L / float(NVOL);
  for (int i = 0; i < NVOL; i++) {
    vec3 q = uCam + rd * stp * (float(i) + ign);
    acc += litAt(q) * exp(-max(q.y, 0.0) * 0.05);
  }
  float cs = dot(rd, uSun);
  float ph = 0.16 + 1.0 * pow(max(cs, 0.0), 5.0) + 0.2 * max(cs, 0.0);
  float vol = acc / float(NVOL) * (L / 75.0) * ph;
  o = vec4(ao, sqrt(clamp(vol * 0.5, 0.0, 1.0)), lin(d) / 420.0, 1.0);
}`;
  const AVBLUR_FS = `#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir; out vec4 o;
void main(){
  vec4 c0 = texture(uTex, vUV);
  float l0 = c0.b * 420.0;
  vec2 acc = c0.rg * 0.3; float w = 0.3;
  for (int i = -3; i <= 3; i++) {
    if (i == 0) continue;
    vec4 c = texture(uTex, vUV + uDir * float(i));
    float wk = (i == -3 || i == 3 ? 0.08 : i == -2 || i == 2 ? 0.14 : 0.2) * smoothstep(0.12, 0.0, abs(c.b * 420.0 - l0) / max(l0, 0.5));
    acc += c.rg * wk; w += wk;
  }
  o = vec4(acc / w, c0.b, 1.0);
}`;
  const BRIGHT_FS = `#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uTex; uniform vec2 uPx; out vec4 o;
void main(){
  vec3 t0 = texture(uTex, vUV + uPx * vec2(-1.0, -1.0)).rgb, t1 = texture(uTex, vUV + uPx * vec2(1.0, -1.0)).rgb;
  vec3 t2 = texture(uTex, vUV + uPx * vec2(-1.0, 1.0)).rgb, t3 = texture(uTex, vUV + uPx * vec2(1.0, 1.0)).rgb;
  float w0 = 1.0 / (1.0 + max(t0.r, max(t0.g, t0.b))), w1 = 1.0 / (1.0 + max(t1.r, max(t1.g, t1.b)));
  float w2 = 1.0 / (1.0 + max(t2.r, max(t2.g, t2.b))), w3 = 1.0 / (1.0 + max(t3.r, max(t3.g, t3.b)));
  vec3 c = (t0 * w0 + t1 * w1 + t2 * w2 + t3 * w3) / (w0 + w1 + w2 + w3);
  c = min(c, vec3(12.0));
  float l = max(c.r, max(c.g, c.b));
  float k = max(l - 1.1, 0.0) / max(l, 0.0001);
  o = vec4(c * k, 1.0);
}`;
  const BLUR_FS = `#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir; out vec4 o;
void main(){
  vec3 c = texture(uTex, vUV).rgb * 0.227027;
  c += (texture(uTex, vUV + uDir * 1.3846).rgb + texture(uTex, vUV - uDir * 1.3846).rgb) * 0.316216;
  c += (texture(uTex, vUV + uDir * 3.2308).rgb + texture(uTex, vUV - uDir * 3.2308).rgb) * 0.070270;
  o = vec4(c, 1.0);
}`;
  const DEC_FS = `#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uTex; out vec4 o;
void main(){ vec3 c = texture(uTex, vUV).rgb; o = vec4(c / max(1.0 - max(c.r, max(c.g, c.b)), 0.02), 1.0); }`;
  const COPY_FS = `#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uTex; out vec4 o; void main(){ o = vec4(texture(uTex, vUV).rgb, 1.0); }`;
  const FINAL_FS = `#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uTex; uniform sampler2D uB1; uniform sampler2D uB2; uniform sampler2D uAV;
uniform float uHurt; uniform float uFlash; uniform float uSat; uniform float uFade; uniform float uCA; uniform float uExp; uniform vec3 uTintC; uniform float uTintA;
uniform float uAOK; uniform vec3 uVolCol; uniform vec2 uPx; uniform float uStorm; uniform float uDof; uniform float uFocus; uniform float uSharp; uniform float uBloomK;
out vec4 o;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec2 d = vUV - 0.5;
  vec3 c;
  if (uCA > 0.0) {
    c.r = texture(uTex, vUV + d * uCA).r; c.g = texture(uTex, vUV).g; c.b = texture(uTex, vUV - d * uCA).b;
  } else c = texture(uTex, vUV).rgb;
  // ほんの少しだけ輪かくを立てる
  vec3 nb = texture(uTex, vUV + vec2(uPx.x, 0.0)).rgb + texture(uTex, vUV - vec2(uPx.x, 0.0)).rgb + texture(uTex, vUV + vec2(0.0, uPx.y)).rgb + texture(uTex, vUV - vec2(0.0, uPx.y)).rgb;
  c = max(c + (c - nb * 0.25) * uSharp, 0.0);
  vec3 av = texture(uAV, vUV).rgb;
  if (uDof > 0.0) {
    // ピントの合った物のふちを守る（まわり4点のうち、いちばんピントに近い奥行きを使う）
    float dz = abs(av.b * 420.0 - uFocus);
    dz = min(dz, min(min(abs(texture(uAV, vUV + uPx * vec2(1.5, 1.5)).b * 420.0 - uFocus), abs(texture(uAV, vUV + uPx * vec2(-1.5, 1.5)).b * 420.0 - uFocus)),
                     min(abs(texture(uAV, vUV + uPx * vec2(1.5, -1.5)).b * 420.0 - uFocus), abs(texture(uAV, vUV + uPx * vec2(-1.5, -1.5)).b * 420.0 - uFocus))));
    float coc = clamp(dz / uFocus - 0.3, 0.0, 1.0) * uDof;
    if (coc > 0.02) {
      vec3 acc = c * 0.3; float w = 0.3;
      for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float an = fi * 2.399963, r = sqrt((fi + 0.5) / 16.0) * coc * 11.0;
        vec2 o2 = vec2(cos(an), sin(an)) * r * uPx;
        float tc = clamp(abs(texture(uAV, vUV + o2).b * 420.0 - uFocus) / uFocus - 0.3, 0.0, 1.0) * uDof;
        float wk = 0.12 + tc;
        acc += texture(uTex, vUV + o2).rgb * wk; w += wk;
      }
      c = mix(c, acc / w, min(coc * 4.0, 1.0));
    }
  }
  float aoV = mix(1.0, av.r, uAOK);
  c *= mix(vec3(aoV), vec3(1.0), clamp(dot(c, vec3(0.3, 0.5, 0.2)) * 0.22 - 0.25, 0.0, 1.0)) ;
  c += uVolCol * av.g * av.g * 2.0;
  vec3 bl = texture(uB1, vUV).rgb * 0.55 + texture(uB2, vUV).rgb * 0.75;
  c += bl * uBloomK;
  c *= uExp;
  c = aces(c);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat * 1.1);
  c = clamp(c, 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.3);
  // 色づくり：明るい所はあたたかく、暗い所は青みどりに。怒りの嵐では全体を青むらさきへ
  vec3 shTone = mix(vec3(0.93, 1.0, 1.1), vec3(0.86, 0.9, 1.2), uStorm);
  vec3 hiTone = mix(vec3(1.06, 1.0, 0.9), vec3(0.95, 0.98, 1.1), uStorm);
  c *= mix(shTone, hiTone, smoothstep(0.05, 0.75, l));
  c = mix(c, uTintC * l * 1.6, uTintA);
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  float vg = dot(d, d);
  c *= 1.0 - vg * 0.6;
  c = mix(c, vec3(0.7, 0.04, 0.02), clamp(uHurt, 0.0, 1.0) * smoothstep(0.1, 0.55, vg) * 0.6);
  c += uFlash;
  c *= 1.0 - uFade;
  c += (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      console.error('shader compile error: ' + log);
      throw new Error('shader compile error: ' + log);
    }
    return s;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link error: ' + gl.getProgramInfoLog(p));
    const cache = {};
    return { p, u: (n) => (n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n))) };
  }

  // ---------- GPU メッシュ ----------
  const VB = STRIDE * 4;
  function makeLitMesh(dynamic) {
    const vao = gl.createVertexArray();
    const vb = gl.createBuffer(), ib = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, VB, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, VB, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, VB, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, VB, 40);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bindVertexArray(null);
    return { vao, vb, ib, n: 0, usage: dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW };
  }
  function uploadLit(mesh, batch) {
    gl.bindVertexArray(mesh.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb);
    gl.bufferData(gl.ARRAY_BUFFER, batch.v.subarray(0, batch.nv * STRIDE), mesh.usage);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, batch.i.subarray(0, batch.ni), mesh.usage);
    mesh.n = batch.ni;
    gl.bindVertexArray(null);
  }
  function drawMesh(mesh) {
    if (!mesh.n) return;
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_INT, 0);
  }

  function tex2D(w, h, ifmt, fmt, type, filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function colorTarget(w, h, R) {
    const tex = tex2D(w, h, R.cfmt, gl.RGBA, R.ctype, gl.LINEAR);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fbo, tex, w, h };
  }
  function shadowTarget(size) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, size };
  }

  // ---------- 初期化 ----------
  G.init = function (canvas, quality) {
    gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) return null;
    // 描画の土台が失われたあと（webglcontextrestored）にも呼ばれる。同じ入れ物を使い回し、GPU の部品だけ作り直す
    const R = G.R || (G.R = {});
    const keepPost = R.post, keepStorm = R.storm || 0;
    for (const k of ['ms', 'scene', 'sceneEnc', 'b4a', 'b4b', 'b8a', 'b8b', 'dt', 'av1', 'av2', 'grass', 'flowers']) R[k] = null;
    R.canvas = canvas; R.gl = gl; R.quality = quality || 'high';
    const Q = (R.q = {
      high: { msaa: 4, shadow: 2048, shadowFar: 4096, grass: 130000, scale: 1, dpr: 1.25, fx: 1, nao: 10, nvol: 12 },
      mid: { msaa: 2, shadow: 1024, shadowFar: 2048, grass: 70000, scale: 1, dpr: 1, fx: 1, nao: 6, nvol: 8 },
      low: { msaa: 0, shadow: 1024, shadowFar: 1024, grass: 28000, scale: 0.75, dpr: 1, fx: 0, nao: 6, nvol: 8 },
    }[R.quality] || { msaa: 4, shadow: 2048, shadowFar: 4096, grass: 130000, scale: 1, dpr: 1.25, fx: 1, nao: 10, nvol: 12 });
    const fl = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
    R.hdr = !!fl;
    R.cfmt = R.hdr ? gl.RGBA16F : gl.RGBA8;
    R.ctype = R.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    Q.msaa = Math.min(Q.msaa, gl.getParameter(gl.MAX_SAMPLES));
    Q.shadowFar = Math.min(Q.shadowFar, gl.getParameter(gl.MAX_TEXTURE_SIZE));

    R.pLit = program(LIT_VS, LIT_FS);
    R.pDepth = program(DEPTH_VS, DEPTH_FS);
    R.pGrass = program(GRASS_VS, GRASS_FS);
    R.pSky = program(SKY_VS, SKY_FS);
    R.pPart = program(PART_VS, PART_FS);
    R.pFx = program(FX_VS, FX_FS);
    R.pBright = program(QUAD_VS, BRIGHT_FS);
    R.pBlur = program(QUAD_VS, BLUR_FS);
    R.pFinal = program(QUAD_VS, FINAL_FS);
    R.pCopy = program(QUAD_VS, COPY_FS);
    R.pDec = program(QUAD_VS, DEC_FS);
    if (Q.fx) { R.pAV = program(QUAD_VS, AV_FS.replace('precision highp float;', 'precision highp float;\n#define NAO ' + Q.nao + '\n#define NVOL ' + Q.nvol)); R.pAVBlur = program(QUAD_VS, AVBLUR_FS); }

    // 全画面三角形
    R.quad = gl.createVertexArray();
    gl.bindVertexArray(R.quad);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // 影（近く：毎フレーム。遠く：谷ぜんぶ・動かないものだけ・1回）
    const sn = shadowTarget(Q.shadow);
    R.shSize = sn.size; R.shTex = sn.tex; R.shFbo = sn.fbo;
    R.shFar = shadowTarget(Q.shadowFar);
    R.farDirty = true;
    // 1x1 の白（効果を切ったときの代わり）
    R.white = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, R.white);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    R.terrain = makeLitMesh(false);
    R.props = makeLitMesh(false);
    R.dyn = makeLitMesh(true);
    R.batch = new Batch(90000);

    // 効果メッシュ
    R.fx = new FxBatch(24000);
    R.fxVao = gl.createVertexArray();
    R.fxVb = gl.createBuffer();
    R.fxIb = gl.createBuffer();
    gl.bindVertexArray(R.fxVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, R.fxVb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.fxIb);

    // パーティクル
    R.partMax = 5000;
    R.partData = new Float32Array(R.partMax * 12);
    R.partN = 0;
    R.partVao = gl.createVertexArray();
    gl.bindVertexArray(R.partVao);
    const pq = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pq);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    R.partVb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, R.partVb);
    gl.bufferData(gl.ARRAY_BUFFER, R.partData.byteLength, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 48, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);

    R.w = 0; R.h = 0;
    R.view = M4.create(); R.proj = M4.create(); R.vp = M4.create(); R.ivp = M4.create(); R.lvp = M4.create(); R.lvp2 = M4.create();
    // 夕方に近い、低くてあたたかい日ざし
    R.sun = V.norm([-0.62, 0.45, 0.52]);
    {
      const S2 = 128, lv = M4.create(), lp = M4.create();
      M4.lookAt(lv, V.mul(R.sun, 200), [0, 0, 0], [0, 1, 0]);
      M4.ortho(lp, -S2, S2, -S2, S2, 20, 390);
      M4.mul(R.lvp2, lp, lv);
    }
    R.camR = [1, 0, 0]; R.camU = [0, 1, 0];
    R.sharpK = 0.08;
    R.post = keepPost || { hurt: 0, flash: 0, sat: 1, fade: 0, ca: 0, exp: 1, tintA: 0, tintC: [0.4, 0.8, 1.0] };
    R.storm = keepStorm;
    R.push = new Float32Array(12);
    return R;
  };

  G.resize = function () {
    const R = G.R, c = R.canvas, Q = R.q;
    const dpr = Math.min(window.devicePixelRatio || 1, Q.dpr) * Q.scale * (R.dynScale || 1);
    const w = Math.max(2, Math.floor(c.clientWidth * dpr)), h = Math.max(2, Math.floor(c.clientHeight * dpr));
    if (w === R.w && h === R.h) return;
    R.w = w; R.h = h;
    c.width = w; c.height = h;
    const del = (t) => { if (t) { gl.deleteFramebuffer(t.fbo); if (t.tex) gl.deleteTexture(t.tex); if (t.rbs) t.rbs.forEach((r) => gl.deleteRenderbuffer(r)); } };
    del(R.ms); del(R.scene); del(R.sceneEnc); R.sceneEnc = null; del(R.b4a); del(R.b4b); del(R.b8a); del(R.b8b); del(R.dt); del(R.av1); del(R.av2);
    R.scene = colorTarget(w, h, R);
    const depth = gl.createRenderbuffer();
    if (Q.msaa > 0) {
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      const cr = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, cr);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, Q.msaa, R.cfmt, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, cr);
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, Q.msaa, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      R.ms = { fbo, rbs: [cr, depth] };
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { console.warn('MSAA FBO incomplete; fallback'); Q.msaa = 0; R.ms = null; }
    }
    if (!(Q.msaa > 0)) {
      R.ms = null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.scene.fbo);
      const d2 = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, d2);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d2);
      R.scene.rbs = [d2];
    }
    // 奥行きを読むための写し（草を描く前の奥行きを写す）
    R.dt = null; R.av1 = null; R.av2 = null;
    if (Q.fx) {
      const tex = tex2D(w, h, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
        R.dt = { fbo, tex, w, h };
        const w2 = Math.max(2, w >> 1), h2 = Math.max(2, h >> 1);
        R.av1 = colorTarget(w2, h2, R); R.av2 = colorTarget(w2, h2, R);
        if (R.ms) {
          // 「おさえた色」の受け皿。もどした後の絵（R.scene）には奥行きも付けて、そこに光の演出を描く
          R.sceneEnc = colorTarget(w, h, R);
          gl.bindFramebuffer(gl.FRAMEBUFFER, R.scene.fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, null, 0); del(R.sceneEnc); R.sceneEnc = null; }
        }
      } else { console.warn('depth copy FBO incomplete; AO off'); gl.deleteFramebuffer(fbo); gl.deleteTexture(tex); }
    }
    const w4 = Math.max(2, w >> 2), h4 = Math.max(2, h >> 2), w8 = Math.max(2, w >> 3), h8 = Math.max(2, h >> 3);
    R.b4a = colorTarget(w4, h4, R); R.b4b = colorTarget(w4, h4, R);
    R.b8a = colorTarget(w8, h8, R); R.b8b = colorTarget(w8, h8, R);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  G.setTerrain = function (batch) { uploadLit(G.R.terrain, batch); G.R.farDirty = true; };
  G.setProps = function (batch) { uploadLit(G.R.props, batch); G.R.farDirty = true; };
  function grassSet(R, key, data, count) {
    let g = R[key];
    if (!g) {
      g = R[key] = { n: 0 };
      g.vb = gl.createBuffer();
      const mk = (base, nv) => {
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const bb = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bb);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(base), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, g.vb);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(1, 1);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(2, 1);
        return { vao, nv };
      };
      g.blade = mk([-0.5, 0, 0.5, 0, -0.38, 0.5, 0.38, 0.5, 0, 1], 5);
      g.head = mk([-1, 0, 1, 0, -1, 1, 1, 1], 4);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, g.vb);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 8), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    g.n = count;
  }
  // 草: [x,y,z,向き, 高さ,幅,乱数,0] × count
  G.setGrass = function (data, count) { grassSet(G.R, 'grass', data, count); };
  // 花: [x,y,z,向き, 高さ,幅,乱数,色(1白 2黄 3青むらさき)] × count
  G.setFlowers = function (data, count) { grassSet(G.R, 'flowers', data, count); };

  // カメラ: eye, at, fov(度)。focus: 影の中心
  G.setCamera = function (eye, at, fov, focus) {
    const R = G.R;
    R.eye = eye;
    M4.lookAt(R.view, eye, at, [0, 1, 0]);
    M4.perspective(R.proj, (fov * Math.PI) / 180, R.w / R.h, 0.3, 420);
    R.pixK = (2 * Math.tan((fov * Math.PI) / 360)) / Math.max(1, R.h); // 1ピクセルが 距離1 でどれだけの長さか
    M4.mul(R.vp, R.proj, R.view);
    M4.invert(R.ivp, R.vp);
    const f = V.norm(V.sub(at, eye));
    let r = V.cross(f, [0, 1, 0]);
    r = V.len(r) < 0.001 ? [1, 0, 0] : V.norm(r);
    R.camR = r; R.camU = V.cross(r, f);
    // 影の箱（テクセルにそろえてちらつきを止める）
    const S = 30;
    const lv = M4.create(), lp = M4.create();
    const le = V.mad([0, 0, 0], R.sun, 80);
    M4.lookAt(lv, le, [0, 0, 0], [0, 1, 0]);
    const fc = M4.xform(lv, focus);
    const tex = (S * 2) / R.shSize;
    const cx = Math.round(fc[0] / tex) * tex, cy = Math.round(fc[1] / tex) * tex;
    M4.ortho(lp, cx - S, cx + S, cy - S, cy + S, 1, 190);
    M4.mul(R.lvp, lp, lv);
  };

  function setCommon(P, time) {
    const R = G.R;
    gl.uniform3fv(P.u('uCam'), R.eye);
    gl.uniform3fv(P.u('uSun'), R.sun);
    gl.uniform3fv(P.u('uSunCol'), R.sunCol);
    gl.uniform3fv(P.u('uSkyCol'), R.skyCol);
    gl.uniform3fv(P.u('uGndCol'), R.gndCol);
    gl.uniform3fv(P.u('uFogCol'), R.fogCol);
    gl.uniform3fv(P.u('uFogSun'), R.fogSun);
    gl.uniform1f(P.u('uFogD'), 0.004);
    gl.uniform1f(P.u('uShTexel'), 1 / R.shSize);
    gl.uniform1f(P.u('uShTexel2'), 1 / R.shFar.size);
    gl.uniform1f(P.u('uTime'), time);
    gl.uniform1f(P.u('uStorm'), R.storm);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, R.shTex);
    gl.uniform1i(P.u('uShadow'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, R.shFar.tex);
    gl.uniform1i(P.u('uShadowFar'), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniformMatrix4fv(P.u('uVP'), false, R.vp);
    gl.uniformMatrix4fv(P.u('uLVP'), false, R.lvp);
    gl.uniformMatrix4fv(P.u('uLVP2'), false, R.lvp2);
  }

  function blurPass(P, src, tmp, dst) {
    gl.useProgram(P.p);
    gl.uniform1i(P.u('uTex'), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tmp.fbo);
    gl.viewport(0, 0, tmp.w, tmp.h);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform2f(P.u('uDir'), 1 / src.w, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.bindTexture(gl.TEXTURE_2D, tmp.tex);
    gl.uniform2f(P.u('uDir'), 0, 1 / src.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // 1フレーム描く。time: 秒
  G.render = function (time) {
    const R = G.R;
    if (gl.isContextLost()) return;
    const st = R.storm, L = M.lerp;
    const off = R.off || {};   // 検査用：部品ごとに切る
    R.sunCol = [L(3.5, 0.75, st), L(2.5, 0.72, st), L(1.42, 0.78, st)];
    R.skyCol = [L(0.25, 0.14, st), L(0.36, 0.17, st), L(0.64, 0.3, st)];
    R.gndCol = [L(0.19, 0.05, st), L(0.165, 0.06, st), L(0.085, 0.075, st)];
    R.fogCol = [L(0.5, 0.12, st), L(0.6, 0.14, st), L(0.8, 0.23, st)];
    R.fogSun = [L(0.8, 0.08, st), L(0.44, 0.08, st), L(0.18, 0.12, st)];
    uploadLit(R.dyn, R.batch);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    // --- 遠くの影（動かないものだけ。作り直したときだけ描く）---
    if (R.farDirty && R.terrain.n) {
      R.farDirty = false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.shFar.fbo);
      gl.viewport(0, 0, R.shFar.size, R.shFar.size);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(2.5, 4.0);
      gl.useProgram(R.pDepth.p);
      gl.uniformMatrix4fv(R.pDepth.u('uVP'), false, R.lvp2);
      drawMesh(R.terrain);
      drawMesh(R.props);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    // --- 近くの影 ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.shFbo);
    gl.viewport(0, 0, R.shSize, R.shSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2.0, 3.0);
    gl.useProgram(R.pDepth.p);
    gl.uniformMatrix4fv(R.pDepth.u('uVP'), false, R.lvp);
    drawMesh(R.dyn);
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // --- シーン ---
    const sceneFbo = R.ms ? R.ms.fbo : R.scene.fbo;
    const encPath = !!(R.ms && R.dt && R.sceneEnc);
    const encK = encPath ? 1 : 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    gl.viewport(0, 0, R.w, R.h);
    gl.clearColor(R.fogCol[0], R.fogCol[1], R.fogCol[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // 空
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(R.pSky.p);
    gl.uniformMatrix4fv(R.pSky.u('uInvVP'), false, R.ivp);
    gl.uniform3fv(R.pSky.u('uSun'), R.sun);
    gl.uniform3fv(R.pSky.u('uFogCol'), R.fogCol);
    gl.uniform3fv(R.pSky.u('uFogSun'), R.fogSun);
    gl.uniform1f(R.pSky.u('uTime'), time);
    gl.uniform1f(R.pSky.u('uStorm'), st);
    gl.uniform1f(R.pSky.u('uEnc'), encK);
    gl.bindVertexArray(R.quad);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    // 地形・小物・キャラクター
    let P = R.pLit;
    gl.useProgram(P.p);
    setCommon(P, time);
    gl.uniform4f(P.u('uTint'), 0, 0, 0, 0);
    gl.uniform1f(P.u('uQual'), R.q.fx && !off.bump && !R.noFx ? 1 : 0);
    gl.uniform1f(P.u('uSpecK'), off.spec ? 0 : 1);
    gl.uniform1f(P.u('uEnc'), encK);
    if (!off.dyn) drawMesh(R.dyn);
    if (!off.props) drawMesh(R.props);
    if (!off.terrain) drawMesh(R.terrain);
    // 草を描く前の奥行きを写す（暗がりと光のすじの計算に使う）
    const useAV = !!(R.dt && R.av1) && !off.av && !R.noFx;
    if (useAV || encPath) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sceneFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, R.dt.fbo);
      gl.blitFramebuffer(0, 0, R.w, R.h, 0, 0, R.w, R.h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    }
    // 草と花
    if (R.grass && R.grass.n && !off.grass) {
      P = R.pGrass;
      gl.useProgram(P.p);
      setCommon(P, time);
      gl.uniform4fv(P.u('uPush'), R.push);
      gl.uniform3f(P.u('uG0'), 0.05, 0.105, 0.022);
      gl.uniform3f(P.u('uG1'), 0.2, 0.33, 0.065);
      gl.uniform3fv(P.u('uCamR'), R.camR);
      gl.uniform3fv(P.u('uCamU'), R.camU);
      gl.uniform3fv(P.u('uEye'), R.eye);
      gl.uniform1f(P.u('uPixK'), R.pixK || 0.001);
      gl.uniform1f(P.u('uEnc'), encK);
      gl.uniform1f(P.u('uHead'), 0);
      gl.bindVertexArray(R.grass.blade.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, R.grass.blade.nv, R.grass.n);
      if (R.flowers && R.flowers.n) {
        gl.bindVertexArray(R.flowers.blade.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, R.flowers.blade.nv, R.flowers.n);
        gl.uniform1f(P.u('uHead'), 1);
        gl.bindVertexArray(R.flowers.head.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, R.flowers.head.nv, R.flowers.n);
      }
    }
    const drawFx = () => {
    // 効果メッシュ
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    if (R.fx.ni && !off.fx) {
      gl.useProgram(R.pFx.p);
      gl.uniformMatrix4fv(R.pFx.u('uVP'), false, R.vp);
      gl.bindVertexArray(R.fxVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, R.fxVb);
      gl.bufferData(gl.ARRAY_BUFFER, R.fx.v.subarray(0, R.fx.nv * 7), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.fxIb);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, R.fx.i.subarray(0, R.fx.ni), gl.DYNAMIC_DRAW);
      gl.drawElements(gl.TRIANGLES, R.fx.ni, gl.UNSIGNED_INT, 0);
    }
    // パーティクル
    if (R.partN && !off.fx) {
      gl.useProgram(R.pPart.p);
      gl.uniformMatrix4fv(R.pPart.u('uV'), false, R.view);
      gl.uniformMatrix4fv(R.pPart.u('uP'), false, R.proj);
      gl.bindVertexArray(R.partVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, R.partVb);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, R.partData.subarray(0, R.partN * 12));
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, R.partN);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    };
    if (!encPath) drawFx();
    gl.disable(gl.DEPTH_TEST);

    if (R.ms) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, R.ms.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, encPath ? R.sceneEnc.fbo : R.scene.fbo);
      gl.blitFramebuffer(0, 0, R.w, R.h, 0, 0, R.w, R.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    gl.bindVertexArray(R.quad);
    if (encPath) {
      // 明るさをもどす → その上に光の演出を描く（奥行きは 草を描く前のものを使う）
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.scene.fbo);
      gl.viewport(0, 0, R.w, R.h);
      gl.depthMask(false);
      gl.useProgram(R.pDec.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, R.sceneEnc.tex);
      gl.uniform1i(R.pDec.u('uTex'), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST);
      drawFx();
      gl.disable(gl.DEPTH_TEST);
      gl.bindVertexArray(R.quad);
    }

    // --- 接する所の暗がり と 光のすじ（半分の解像度）---
    if (useAV) {
      P = R.pAV;
      gl.useProgram(P.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.av1.fbo);
      gl.viewport(0, 0, R.av1.w, R.av1.h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.dt.tex); gl.uniform1i(P.u('uDepth'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.shTex); gl.uniform1i(P.u('uShadow'), 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, R.shFar.tex); gl.uniform1i(P.u('uShadowFar'), 2);
      gl.uniformMatrix4fv(P.u('uInvVP'), false, R.ivp);
      gl.uniformMatrix4fv(P.u('uVPm'), false, R.vp);
      gl.uniformMatrix4fv(P.u('uLVP'), false, R.lvp);
      gl.uniformMatrix4fv(P.u('uLVP2'), false, R.lvp2);
      gl.uniform3fv(P.u('uCam'), R.eye);
      gl.uniform3fv(P.u('uSun'), R.sun);
      gl.uniform2f(P.u('uPx'), 1 / R.av1.w, 1 / R.av1.h);
      gl.uniform1f(P.u('uTime'), time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      blurPass(R.pAVBlur, R.av1, R.av2, R.av1);
    }

    // --- ブルーム ---
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(R.pBright.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.b4a.fbo);
    gl.viewport(0, 0, R.b4a.w, R.b4a.h);
    gl.bindTexture(gl.TEXTURE_2D, R.scene.tex);
    gl.uniform1i(R.pBright.u('uTex'), 0);
    gl.uniform2f(R.pBright.u('uPx'), 1 / R.w, 1 / R.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    blurPass(R.pBlur, R.b4a, R.b4b, R.b4a);
    // 1/8 へ
    gl.useProgram(R.pCopy.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.b8a.fbo);
    gl.viewport(0, 0, R.b8a.w, R.b8a.h);
    gl.bindTexture(gl.TEXTURE_2D, R.b4a.tex);
    gl.uniform1i(R.pCopy.u('uTex'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    blurPass(R.pBlur, R.b8a, R.b8b, R.b8a);
    blurPass(R.pBlur, R.b8a, R.b8b, R.b8a);

    // --- 仕上げ ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, R.w, R.h);
    P = R.pFinal;
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.scene.tex); gl.uniform1i(P.u('uTex'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.b4a.tex); gl.uniform1i(P.u('uB1'), 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, R.b8a.tex); gl.uniform1i(P.u('uB2'), 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, useAV ? R.av1.tex : R.white); gl.uniform1i(P.u('uAV'), 3);
    const po = R.post;
    gl.uniform1f(P.u('uHurt'), po.hurt);
    gl.uniform1f(P.u('uFlash'), po.flash);
    gl.uniform1f(P.u('uSat'), po.sat);
    gl.uniform1f(P.u('uFade'), po.fade);
    gl.uniform1f(P.u('uCA'), po.ca);
    gl.uniform1f(P.u('uExp'), po.exp * 1.12);
    gl.uniform3fv(P.u('uTintC'), po.tintC);
    gl.uniform1f(P.u('uTintA'), po.tintA);
    gl.uniform1f(P.u('uAOK'), useAV ? 0.85 : 0);
    gl.uniform3f(P.u('uVolCol'), R.sunCol[0] * 0.14, R.sunCol[1] * 0.14, R.sunCol[2] * 0.14);
    gl.uniform2f(P.u('uPx'), 1 / R.w, 1 / R.h);
    gl.uniform1f(P.u('uStorm'), st);
    gl.uniform1f(P.u('uDof'), useAV ? R.dofK || 0 : 0);
    gl.uniform1f(P.u('uFocus'), R.focusD || 5);
    gl.uniform1f(P.u('uSharp'), off.sharp ? 0 : R.sharpK);
    gl.uniform1f(P.u('uBloomK'), off.bloom ? 0 : 0.5);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  };

  // 世界座標 → 画面のピクセル（CSS px）。見えないときは null
  G.project = function (p) {
    const R = G.R;
    const c = M4.xform(R.vp, p);
    if (c[3] <= 0.01) return null;
    return [(c[0] / c[3] * 0.5 + 0.5) * R.canvas.clientWidth, (1 - (c[1] / c[3] * 0.5 + 0.5)) * R.canvas.clientHeight, c[3]];
  };
})();
