// 狩りの谷 — 自動で遊ぶボット（Node の検証と ?auto=1 の両方で使う）
// skill: 0〜1。モンスターの技ごとに「ちゃんと対応できるか」をこの確率で決める。
(function () {
  'use strict';
  const KT = globalThis.KT || (globalThis.KT = {});
  const M = KT.M, S = KT.Sim, W = KT.World;
  const Bot = (KT.Bot = {});

  Bot.create = function (opt) {
    opt = opt || {};
    const b = {
      skill: opt.skill === undefined ? 0.8 : opt.skill,
      rng: new M.RNG((opt.seed || 7) * 7919 + 13),
      last: {}, atkKey: '', react: true, tick: 0, hold: 0, wantItem: null, usedPower: false, side: 1, sideT: 0,
    };
    b.think = (s) => think(s, b);
    return b;
  };

  function think(s, b) {
    const h = s.hunter, m = s.mon;
    const inp = { mx: 0, mz: 0, atk: false, heavy: false, guard: false, dodge: false, sprint: false, item: false, itemNext: false, itemPrev: false, art: false };
    b.tick++;
    if (h.state === 'dead' || s.result) { b.last = inp; return inp; }
    const dx = m.x - h.x, dz = m.z - h.z;
    const d = Math.hypot(dx, dz) || 1;
    const toMon = Math.atan2(dx, dz);
    const fromMon = Math.atan2(-dx, -dz);
    const sy = Math.sin(m.yaw), cy = Math.cos(m.yaw);
    const lx = -dx * cy + dz * sy; // モンスターから見たハンターの横位置
    const lz = -dx * sy - dz * cy; // 前後位置（+が前）
    const ang = Math.atan2(lx, lz);
    const press = (k) => { if (!b.last[k]) inp[k] = true; };
    const go = (a, mag) => { inp.mx = Math.sin(a) * (mag || 1); inp.mz = Math.cos(a) * (mag || 1); };
    const perp = m.yaw + (lx >= 0 ? 1 : -1) * Math.PI / 2; // モンスターの正面から横へ逃げる向き

    // 技ごとの対応を決める
    const key = m.state + ':' + m.atk + ':' + (m.chain || 0);
    if (key !== b.atkKey) { b.atkKey = key; b.react = b.rng.next() < b.skill; }
    if (b.tick % 240 === 0) b.side = b.rng.next() < 0.5 ? 1 : -1;

    let dodge = null; // 回避する向き
    let avoid = null; // 歩いて避ける向き
    let safe = m.state !== 'atk'; // 攻めてよいか
    const canDodge = h.st >= 22 && (h.state === 'idle' || h.state === 'guard' || h.state === 'charge' || h.state === 'item' || (h.state === 'atk' && h.mt >= h.move.cancel));
    if (m.state === 'atk' && b.react) {
      const t = m.t;
      switch (m.atk) {
        case 'bite':
          if (Math.abs(ang) < 1.0 && lz < 8.5) { if (t > 0.5 && t < 0.9) dodge = perp; else if (t < 0.5) avoid = perp; }
          safe = t > 0.92 || Math.abs(ang) > 1.2;
          break;
        case 'claw':
          if (Math.abs(ang) < 1.4 && d < 7) { if (t > 0.46 && t < 0.84) dodge = fromMon; else if (t < 0.46) avoid = fromMon; }
          safe = t > 0.86 || Math.abs(ang) > 1.6;
          break;
        case 'tailsweep': {
          const dir = m.arg || 1;
          if (d < 10.5) {
            if (t < 0.6) avoid = fromMon;
            else if (t < 1.45) {
              const tailAng = m.yaw + Math.PI - m.p.tailYaw;
              const df = M.angDiff(tailAng, fromMon) * dir;
              const dh = M.angDiff(m.yaw, fromMon) * dir;
              if ((df > -0.2 && df < 1.3) || (d < 6 && dh > -0.2 && dh < 1.2)) dodge = toMon + dir * 1.2;
            }
          }
          safe = t > 1.45;
          break;
        }
        case 'charge':
          if (m.phase === 0) avoid = perp;
          else if (m.phase === 1) {
            if (lz > 0 && Math.abs(lx) < 3.2) { if (lz / 15 < 0.2) dodge = perp; else avoid = perp; }
          }
          safe = m.phase === 2;
          break;
        case 'pounce':
          if (m.phase === 0) avoid = perp;
          else if (m.phase === 1) {
            const cx = m.tx + sy * 1.6, cz = m.tz + cy * 1.6;
            const dc = Math.hypot(h.x - cx, h.z - cz);
            if (dc < 5.2) {
              const rem = (1 - m.pt / 0.65) * 0.65;
              const away = Math.atan2(h.x - cx, h.z - cz);
              if (rem < 0.2) dodge = away; else avoid = away;
            }
          }
          safe = m.phase === 2;
          break;
        case 'bolt':
          safe = Math.abs(ang) > 0.9;
          if (!safe && d > 6) avoid = perp;
          break;
        case 'tailslam':
          if (lz < 0 && Math.abs(lx) < 2.6 && d < 11) { if (t > 1.0 && t < 1.34) dodge = perp; else if (t < 1.0) avoid = perp; }
          safe = t > 1.34 || Math.abs(lx) > 2.8;
          break;
        case 'thunder':
          safe = true;
          break;
        case 'roar':
          if (d < 20 && !m.fired && t > 0.3) dodge = fromMon;
          safe = t > 0.6;
          break;
        default:
          safe = true;
      }
    } else if (m.state === 'atk' && !b.react) safe = true;

    // 雷の玉と落雷
    if (b.react) {
      for (let i = 0; i < s.shots.length; i++) {
        const o = s.shots[i];
        const rx = h.x - o.x, rz = h.z - o.z;
        const sp = Math.hypot(o.vx, o.vz);
        const along = (rx * o.vx + rz * o.vz) / sp;
        const off = Math.abs(rx * o.vz - rz * o.vx) / sp;
        if (along > 0 && along < 3.0 && off < 1.7) dodge = Math.atan2(o.vz, -o.vx) + (rx * o.vz - rz * o.vx > 0 ? 0 : Math.PI);
      }
      for (let i = 0; i < s.strikes.length; i++) {
        const k = s.strikes[i];
        const dk = Math.hypot(h.x - k.x, h.z - k.z);
        if (dk < k.r + 0.6) {
          const away = dk > 0.1 ? Math.atan2(h.x - k.x, h.z - k.z) : toMon;
          if (k.delay - k.t < 0.22) dodge = away;
          else { avoid = away; safe = false; }
        }
      }
    }

    if (dodge !== null && canDodge) {
      go(dodge);
      press('dodge');
      b.last = inp;
      return inp;
    }

    // 回復・砥石・力の実
    const tier = S.sharpTier(h);
    let want = null;
    const potion = h.items[0].n;
    const calm = m.state === 'down' || m.state === 'graze' || d > 11;
    if (h.hp < 45 && potion > 0) want = 0;
    else if (tier >= 3 && calm) want = 1;
    else if (!b.usedPower && h.buffT <= 0 && h.items[2].n > 0 && m.state === 'graze') want = 2;
    if (h.state === 'item') { b.last = inp; if (avoid !== null && dodge !== null) { go(dodge); press('dodge'); } return inp; }
    if (want !== null && h.state === 'idle') {
      if (want === 0 && !calm && d < 12) {
        go(fromMon); inp.sprint = h.st > 15;
      } else if (h.itemSel !== want) {
        press('itemNext');
      } else {
        press('item');
        if (want === 2) b.usedPower = true;
      }
      b.last = inp;
      return inp;
    }

    if (avoid !== null) {
      go(avoid);
      inp.sprint = h.st > 25;
      b.last = inp;
      return inp;
    }

    // 攻める：狙う場所を決める
    const sph = S.monSpheres(s);
    const opening = m.state === 'down' || m.state === 'flinch';
    let tgt = null, best = 1e9;
    for (let i = 0; i < sph.length; i++) {
      const p = sph[i];
      if (p.y - h.y > 3.0 && !opening) continue;
      let c = Math.hypot(p.x - h.x, p.z - h.z) - p.r;
      if (p.part === 'head') c -= opening ? 6 : 0.5;
      if (p.part === 'back') c += m.rage.on || opening ? -1 : 3;
      if (p.part === 'tail' && !m.parts.tail.cut) c -= 0.8;
      if (c < best) { best = c; tgt = p; }
    }
    if (!tgt) { b.last = inp; return inp; }
    const tx = tgt.x - h.x, tz = tgt.z - h.z;
    const td = Math.hypot(tx, tz);
    const ta = Math.atan2(tx, tz);
    const gs = h.weapon === 'gs';
    const reach = (gs ? 2.5 : 1.35) + tgt.r;
    const facing = Math.abs(M.angDiff(h.yaw, ta)) < 0.5;

    if (h.state === 'charge') {
      go(ta, 0.4);
      const stay = opening || (m.state === 'atk' && safe);
      inp.heavy = h.chargeLv < 3 && stay && td < reach + 0.5;
      b.last = inp;
      return inp;
    }
    if (h.art >= 100 && td < reach && (opening || safe) && (h.state === 'idle' || h.state === 'atk')) {
      go(ta, 0.3);
      press('art');
      b.last = inp;
      return inp;
    }
    if (td > reach) {
      go(ta);
      inp.sprint = td > 9 && h.st > 30;
      if (!gs && !h.focus && h.st > 70 && td < 5 && h.state === 'idle') press('guard');
    } else {
      go(ta, 0.3);
      if (safe || !b.react) {
        if (gs && opening && h.state === 'idle' && m.state === 'down' && m.t < m.downDur - 2.4) { inp.heavy = true; }
        else if (b.tick % 6 < 3) inp.atk = true;
      } else if (gs && h.state === 'idle' && Math.abs(ang) < 1.0 && d < 7) {
        inp.guard = true;
        go(toMon, 0.3);
      }
    }
    b.last = inp;
    return inp;
  }
})();
