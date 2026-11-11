// 狩りの谷 — 入力（キーボード＋マウス / ゲームパッド / タッチ）
(function () {
  'use strict';
  const KT = globalThis.KT;
  const In = (KT.Input = { mode: 'kbm', camDX: 0, camDY: 0, lockPressed: false, pausePressed: false, touch: false, locked: false });
  const keys = {};
  const latch = {}; // 1フレームより短い押しも落とさない
  const mouse = { l: false, r: false, m: false };
  const tb = {}; // タッチのボタン
  let stick = null, camTouch = null, wheel = 0, padPrev = {};
  let canvas = null;

  const KEYMAP = {
    atk: ['KeyJ'], heavy: ['KeyK'], guard: ['KeyL', 'KeyC', 'ControlLeft'], dodge: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'],
    item: ['KeyE'], itemNext: ['KeyQ'], itemPrev: ['KeyZ'], art: ['KeyR'],
  };

  In.init = function (cv) {
    canvas = cv;
    In.touch = 'ontouchstart' in window && navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) < 900;
    document.body.classList.toggle('kt-touch', In.touch);
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      keys[e.code] = true;
      latch[e.code] = true;
      In.mode = 'kbm';
      if (e.code === 'KeyF' || e.code === 'KeyT' || e.code === 'Tab') In.lockPressed = true;
      if (e.code === 'Escape' || e.code === 'KeyP') In.pausePressed = true;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.l = mouse.r = mouse.m = false; });
    cv.addEventListener('mousedown', (e) => {
      In.mode = 'kbm';
      if (In.wantLock && !In.noLock && !In.locked && cv.requestPointerLock) { try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* 無視 */ } }
      if (e.button === 0) { mouse.l = true; latch.ML = true; }
      else if (e.button === 2) { mouse.r = true; latch.MR = true; }
      else if (e.button === 1) { mouse.m = true; e.preventDefault(); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) mouse.l = false;
      else if (e.button === 2) mouse.r = false;
      else if (e.button === 1) mouse.m = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (In.locked) { In.camDX += e.movementX; In.camDY += e.movementY; }
      else if (mouse.r || mouse.l) { In.camDX += e.movementX; In.camDY += e.movementY; }
    });
    window.addEventListener('wheel', (e) => { wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const was = In.locked;
      In.locked = document.pointerLockElement === cv;
      if (was && !In.locked && In.wantLock) In.pausePressed = true;
    });

    // タッチ
    const st = document.getElementById('kt-stick');
    const tEl = document.getElementById('kt-touch');
    document.querySelectorAll('.kt-tb').forEach((el) => {
      const b = el.dataset.b;
      const on = (e) => {
        e.preventDefault(); e.stopPropagation();
        In.mode = 'touch';
        if (b === 'lock') In.lockPressed = true;
        else if (b === 'pause') In.pausePressed = true;
        else tb[b] = true;
        el.classList.add('kt-on');
      };
      const off = (e) => { e.preventDefault(); tb[b] = false; el.classList.remove('kt-on'); };
      el.addEventListener('touchstart', on, { passive: false });
      el.addEventListener('touchend', off, { passive: false });
      el.addEventListener('touchcancel', off, { passive: false });
    });
    cv.addEventListener('touchstart', (e) => {
      In.mode = 'touch';
      if (!In.touchUI) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth * 0.45 && !stick) {
          stick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
          st.style.display = 'block';
          st.style.left = t.clientX - 65 + 'px'; st.style.top = t.clientY - 65 + 'px';
        } else if (!camTouch) camTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }, { passive: false });
    cv.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (stick && t.identifier === stick.id) {
          let dx = (t.clientX - stick.ox) / 55, dy = (t.clientY - stick.oy) / 55;
          const l = Math.hypot(dx, dy);
          if (l > 1) { dx /= l; dy /= l; }
          stick.x = dx; stick.y = dy;
          st.firstElementChild.style.transform = `translate(${dx * 40}px,${dy * 40}px)`;
        } else if (camTouch && t.identifier === camTouch.id) {
          In.camDX += (t.clientX - camTouch.x) * 1.6; In.camDY += (t.clientY - camTouch.y) * 1.6;
          camTouch.x = t.clientX; camTouch.y = t.clientY;
        }
      }
    }, { passive: false });
    const tend = (e) => {
      for (const t of e.changedTouches) {
        if (stick && t.identifier === stick.id) { stick = null; st.style.display = 'none'; st.firstElementChild.style.transform = ''; }
        if (camTouch && t.identifier === camTouch.id) camTouch = null;
      }
    };
    cv.addEventListener('touchend', tend);
    cv.addEventListener('touchcancel', tend);
    void tEl;
  };

  const down = (name) => KEYMAP[name].some((c) => keys[c] || latch[c]);

  // カメラの向き camYaw を使って、移動を世界の向きに直す
  In.poll = function (camYaw) {
    let x = 0, y = 0;
    const o = { mx: 0, mz: 0, atk: false, heavy: false, guard: false, dodge: false, sprint: false, item: false, itemNext: false, itemPrev: false, art: false };
    if (keys.KeyW || keys.ArrowUp) y += 1;
    if (keys.KeyS || keys.ArrowDown) y -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    for (const k in KEYMAP) o[k] = down(k);
    if (In.wantLock) { o.atk = o.atk || mouse.l || !!latch.ML; o.heavy = o.heavy || mouse.r || !!latch.MR; o.guard = o.guard || mouse.m; }
    for (const k in latch) delete latch[k];
    if (wheel !== 0) { if (wheel > 0) o.itemNext = true; else o.itemPrev = true; wheel = 0; }

    // ゲームパッド
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      const ax = dz(p.axes[0] || 0), ay = dz(p.axes[1] || 0);
      const rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
      const B = (n) => !!(p.buttons[n] && p.buttons[n].pressed);
      if (ax || ay || rx || ry || p.buttons.some((b) => b.pressed)) In.mode = 'pad';
      if (ax || ay) { x = ax; y = -ay; }
      In.camDX += rx * 14; In.camDY += ry * 9;
      o.dodge = o.dodge || B(0); o.heavy = o.heavy || B(1); o.item = o.item || B(2); o.atk = o.atk || B(3);
      o.art = o.art || B(4); o.sprint = o.sprint || B(5); o.guard = o.guard || B(7);
      o.itemPrev = o.itemPrev || B(14); o.itemNext = o.itemNext || B(15);
      const lk = B(10) || B(11) || B(6), ps = B(9);
      if (lk && !padPrev.lk) In.lockPressed = true;
      if (ps && !padPrev.ps) In.pausePressed = true;
      padPrev = { lk, ps };
      break;
    }
    // タッチ
    if (stick) { x = stick.x; y = -stick.y; if (Math.hypot(x, y) > 0.93) o.sprint = true; }
    for (const k in tb) if (tb[k]) o[k] = true;

    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    const s = Math.sin(camYaw), c = Math.cos(camYaw);
    // 前 = (s, c)、画面の右 = (-c, s)
    o.mx = s * y - c * x;
    o.mz = c * y + s * x;
    return o;
  };
})();
