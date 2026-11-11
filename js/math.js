// 狩りの谷 — 数学ユーティリティ（ブラウザと Node の両方で動く）
(function () {
  'use strict';
  const KT = globalThis.KT || (globalThis.KT = {});
  const M = (KT.M = {});

  M.clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  M.sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  M.lerp = (a, b, t) => a + (b - a) * t;
  M.smooth = (a, b, x) => {
    const t = M.sat((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  // t が a→b の区間を 0→1 で進む（区間外は 0 か 1）
  M.tr = (t, a, b) => M.sat((t - a) / (b - a));
  M.wrapPi = (a) => {
    a = (a + Math.PI) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a - Math.PI;
  };
  M.angDiff = (from, to) => M.wrapPi(to - from);
  M.angApproach = (cur, target, maxStep) => {
    const d = M.wrapPi(target - cur);
    if (Math.abs(d) <= maxStep) return target;
    return cur + Math.sign(d) * maxStep;
  };
  M.approach = (cur, target, step) => {
    if (cur < target) return Math.min(target, cur + step);
    return Math.max(target, cur - step);
  };
  M.damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
  M.ease = {
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOut: (t) => t * t * (3 - 2 * t),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    outBack: (t) => {
      const c = 1.70158;
      return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    },
  };
  M.DEG = Math.PI / 180;

  // 決定的な乱数（mulberry32）
  M.RNG = function (seed) {
    this.s = seed >>> 0 || 1;
  };
  M.RNG.prototype.next = function () {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  M.RNG.prototype.range = function (a, b) {
    return a + (b - a) * this.next();
  };
  M.RNG.prototype.pick = function (arr) {
    return arr[Math.floor(this.next() * arr.length)];
  };

  // 値ノイズ
  M.hash2 = (ix, iz) => {
    let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  M.noise2 = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const a = M.hash2(ix, iz), b = M.hash2(ix + 1, iz);
    const c = M.hash2(ix, iz + 1), d = M.hash2(ix + 1, iz + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  };
  M.fbm = (x, z, oct) => {
    let v = 0, amp = 0.5, f = 1;
    for (let i = 0; i < (oct || 4); i++) {
      v += amp * M.noise2(x * f, z * f);
      f *= 2.03;
      amp *= 0.5;
    }
    return v;
  };

  // ---- vec3（配列 [x,y,z]）----
  const V = (M.V = {});
  V.add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  V.sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  V.mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  V.mad = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  V.dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  V.cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  V.len = (a) => Math.hypot(a[0], a[1], a[2]);
  V.dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  V.norm = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  V.lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // 方位 psi（0=前, +で x 側）と仰角 e から単位ベクトル
  V.dir = (psi, e) => {
    const ce = Math.cos(e);
    return [Math.sin(psi) * ce, Math.sin(e), Math.cos(psi) * ce];
  };
  // y 軸まわりに yaw 回す（前 = (sin, 0, cos)）
  V.rotY = (a, yaw) => {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    return [a[0] * c + a[2] * s, a[1], -a[0] * s + a[2] * c];
  };
  // 軸 n（単位）まわりに角度 ang 回す
  V.rotAxis = (v, n, ang) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    const d = V.dot(n, v), cr = V.cross(n, v);
    return [
      v[0] * c + cr[0] * s + n[0] * d * (1 - c),
      v[1] * c + cr[1] * s + n[1] * d * (1 - c),
      v[2] * c + cr[2] * s + n[2] * d * (1 - c),
    ];
  };

  // ---- mat4（列優先 Float32Array）----
  const M4 = (M.M4 = {});
  M4.create = () => {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  };
  M4.mul = (out, a, b) => {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    out.set(o);
    return out;
  };
  M4.perspective = (out, fovy, aspect, near, far) => {
    const f = 1 / Math.tan(fovy / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  };
  M4.ortho = (out, l, r, b, t, n, f) => {
    out.fill(0);
    out[0] = 2 / (r - l);
    out[5] = 2 / (t - b);
    out[10] = -2 / (f - n);
    out[12] = -(r + l) / (r - l);
    out[13] = -(t + b) / (t - b);
    out[14] = -(f + n) / (f - n);
    out[15] = 1;
    return out;
  };
  M4.lookAt = (out, eye, at, up) => {
    const z = V.norm(V.sub(eye, at));
    const x = V.norm(V.cross(up, z));
    const y = V.cross(z, x);
    out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
    out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
    out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
    out[12] = -V.dot(x, eye); out[13] = -V.dot(y, eye); out[14] = -V.dot(z, eye); out[15] = 1;
    return out;
  };
  M4.invert = (out, a) => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return out;
    det = 1 / det;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  };
  // 点を変換して [x,y,z,w]
  M4.xform = (m, p) => {
    const x = p[0], y = p[1], z = p[2];
    return [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
      m[3] * x + m[7] * y + m[11] * z + m[15],
    ];
  };
})();
