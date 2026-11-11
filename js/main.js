// 狩りの谷 — 本体（ループ・カメラ・セーブ・案内）
// URL の切り替え: ?fps=N（こま数の上限。0 で上限なし） ?dyn=0（自動で細かさを下げない） ?speed=N（早送り。検査用） ?nolock=1（マウスを固定しない） ?auto=1（ボットが遊ぶ・無音） ?mute=1 ?bg=1（タイマーで進める） ?seed=N ?quest=0..2 ?weapon=gs|db ?q=low|mid|high ?skill=0.85
(function () {
  'use strict';
  const KT = globalThis.KT;
  const M = KT.M, V = M.V, G = KT.GL, S = KT.Sim, W = KT.World, D = KT.Data, F = KT.Fx, Au = KT.Audio, In = KT.Input, UI = KT.UI, A = KT.Actors;
  const params = new URLSearchParams(location.search);
  const AUTO = params.get('auto') === '1';
  const SPEED = M.clamp(+(params.get('speed') || 1), 1, 16);
  const dbg = (window.KTdbg = { errors: [], frames: 0, state: 'boot', result: null });

  function showErr(msg) {
    dbg.errors.push(String(msg));
    let e = document.getElementById('kt-err');
    if (!e) { e = document.createElement('div'); e.id = 'kt-err'; document.body.appendChild(e); }
    e.textContent = 'エラー: ' + msg;
  }
  window.addEventListener('error', (e) => showErr(e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));

  // ---------- セーブ ----------
  const KEY = 'kari-no-tani-v1';
  const touchDev = 'ontouchstart' in window && navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) < 900;
  function defSave() {
    return { v: 2, zeny: 0, mats: {}, weapon: 'gs', wlv: { gs: 0, db: 0 }, alv: 0, cleared: [false, false, false], best: [0, 0, 0], notes: {}, tut: {}, opts: { vol: 0.4, shake: true, quality: touchDev ? 'mid' : 'high', fps: 60 } };
  }
  let sv = defSave();
  try {
    const raw = AUTO ? null : localStorage.getItem(KEY);
    if (raw) { const o = JSON.parse(raw); sv = Object.assign(defSave(), o); sv.opts = Object.assign(defSave().opts, o.opts || {}); }
  } catch (e) { /* セーブが読めなくても遊べる */ }
  function save() { if (AUTO) return; try { localStorage.setItem(KEY, JSON.stringify(sv)); } catch (e) { /* 無視 */ } }
  // 前の版のセーブ：こま数の上限が無かった（240Hz の画面だと 240枚/秒 を全力で描いて、パソコンが熱くなりすぎた）
  let noteText = '';
  if ((sv.v | 0) < 2) { sv.v = 2; sv.opts.fps = 60; noteText = 'パソコンに負担をかけすぎないよう、1秒に描く回数を 60 までにしました。拠点の「設定」→「こま数」で変えられます。'; save(); }
  // 止まった記録（原因を調べるため。この端末の中だけに残る）
  const LOGKEY = 'kari-no-tani-log';
  function logStop(msg) {
    if (AUTO) return;
    try {
      const a = JSON.parse(localStorage.getItem(LOGKEY) || '[]');
      a.push({ t: new Date().toISOString(), state: dbg.state, q: G.R ? G.R.quality : '', size: G.R ? G.R.w + 'x' + G.R.h : '', msg: String(msg).slice(0, 300) });
      localStorage.setItem(LOGKEY, JSON.stringify(a.slice(-8)));
    } catch (e) { /* 無視 */ }
  }
  const FPS_PARAM = params.get('fps') !== null ? params.get('fps') : window.KT_FPS != null ? String(window.KT_FPS) : null;
  const fpsCap = () => (FPS_PARAM !== null ? +FPS_PARAM || 0 : sv.opts.fps | 0);
  const DYN = params.get('dyn') !== '0' && SPEED === 1;
  if (params.get('weapon')) sv.weapon = params.get('weapon') === 'db' ? 'db' : 'gs';
  if (params.get('wlv')) sv.wlv[sv.weapon] = M.clamp(+params.get('wlv') | 0, 0, 4);
  if (params.get('alv')) sv.alv = M.clamp(+params.get('alv') | 0, 0, 4);

  // ---------- 状態 ----------
  const canvas = document.getElementById('kt-gl'), ov = document.getElementById('kt-ov');
  const octx = ov.getContext('2d');
  const app = { state: 'title', sel: 0, paused: false };
  let sim = null, rs = null, bot = null;
  let time = 0, lastNow = 0, acc = 0, simAdv = 0;
  const cam = { yaw: 0, pitch: 0.28, dist: 7.5, t: [0, 2, -30], lock: true, intro: 0, eye: [0, 5, -40], at: [0, 2, 0] };
  let ftAvg = 1 / 60, slowT = 0;
  let fadeCur = 0, fadeTarget = 0, dmgBy = {}, memoNew = 0, huntSeed = 1, moved = 0, usedHeavy = false, resultShown = false;

  if (params.get('quest')) app.sel = M.clamp(+params.get('quest') | 0, 0, 2);
  if (params.get('mute') === '1' || (AUTO && params.get('sound') !== '1')) Au.muted = true;
  Au.vol = sv.opts.vol;

  const R = G.init(canvas, params.get('q') || sv.opts.quality);
  if (!R) { showErr('この端末・ブラウザでは WebGL2 が使えません。'); return; }
  try { KT.WorldBuild.build(); } catch (e) { showErr(e.message); throw e; }
  In.init(canvas);
  In.noLock = params.get('nolock') === '1';
  // Blender で作ったモデル（assets/models.js に入っている）を読む。?models=0 で使わない
  A.useModels = params.get('models') !== '0';
  if (A.useModels && KT.Assets) {
    for (const k in KT.Assets) {
      try { const bin = atob(KT.Assets[k]); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); G.loadGLB(k, u8); } catch (e) { console.warn('モデルの読みこみに失敗: ' + k); }
    }
  }
  let glLost = false, lostAt = 0;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    glLost = true; lostAt = performance.now();
    logStop('描画が止まった（WebGL context lost）');
    if (app.state === 'hunt' && sim && !sim.result && !app.paused) { app.paused = true; UI.pause(true, sim.hunter.weapon); if (document.pointerLockElement) document.exitPointerLock(); }
  });
  canvas.addEventListener('webglcontextrestored', () => {
    try {
      const order = ['high', 'mid', 'low'];
      const nx = order[Math.min(2, order.indexOf(R.quality) + 1)] || 'low';
      sv.opts.quality = nx; save();
      G.init(canvas, nx);
      KT.WorldBuild.build();
      glLost = false; lastNow = performance.now();
      setNote('描画が止まったので、画質を「' + ({ high: '高', mid: '中', low: '低' })[nx] + '」に下げて立て直しました。');
      if (app.state === 'base') UI.renderBase(sv, app.sel);
    } catch (e2) { showErr('描画を立て直せませんでした。ページを読みこみ直してください（F5）。\n' + e2.message); }
  });

  function newSim(seed) {
    sim = S.create({ seed, weapon: sv.weapon, wlv: sv.wlv[sv.weapon], alv: sv.alv, rank: app.sel });
    rs = A.newState();
    F.reset();
  }

  function note(k) { if (!sv.notes[k]) { sv.notes[k] = true; memoNew++; save(); } }
  const K = (kbm, pad, touch) => (In.mode === 'pad' ? pad : In.touch ? touch : kbm);

  // ---------- アプリの操作（UI から呼ばれる） ----------
  app.toBase = function () {
    Au.init(); Au.resume();
    app.state = 'base'; app.paused = false;
    In.wantLock = false;
    if (document.pointerLockElement) document.exitPointerLock();
    newSim(1);
    UI.show('base');
    UI.renderBase(sv, app.sel);
    Au.music('camp');
    Au.play('click');
    fadeTarget = 0;
    R.post.sat = 1;
  };
  app.selectQuest = function (i) { app.sel = i; newSim(1); UI.renderBase(sv, app.sel); Au.play('click'); };
  app.setWeapon = function (id) { sv.weapon = id; save(); newSim(1); UI.renderBase(sv, app.sel); Au.play('click'); };
  app.upgrade = function (kind) {
    const lv = kind === 'weapon' ? sv.wlv[sv.weapon] : sv.alv;
    const cost = (kind === 'weapon' ? D.weaponCost : D.armorCost)[lv];
    if (!cost || !UI.canPay(cost, sv)) { Au.play('deny'); return; }
    for (const k in cost) { if (k === 'z') sv.zeny -= cost[k]; else sv.mats[k] -= cost[k]; }
    if (kind === 'weapon') sv.wlv[sv.weapon]++; else sv.alv++;
    save();
    newSim(1);
    UI.renderBase(sv, app.sel);
    Au.play('ok'); Au.play('sharpen');
    F.onEvent({ type: 'art' }, sim, rs);
  };
  app.setOpt = function (k, v) {
    sv.opts[k] = v;
    save();
    if (k === 'vol') { Au.setVolume(v); Au.play('click'); }
    if (k === 'quality') location.reload();
  };
  app.startHunt = function () {
    Au.init(); Au.resume();
    huntSeed = params.get('seed') ? +params.get('seed') : ((Date.now() & 0xffff) | 1);
    newSim(huntSeed);
    bot = AUTO ? KT.Bot.create({ skill: +(params.get('skill') || 0.85), seed: huntSeed }) : null;
    app.state = 'hunt'; app.paused = false;
    dmgBy = {}; memoNew = 0; moved = 0; usedHeavy = false; resultShown = false;
    UI.resetHud();
    UI.show('hunt');
    cam.yaw = 0; cam.pitch = 0.26; cam.dist = 7.5; cam.intro = 0; cam.lock = true;
    cam.t = [sim.hunter.x, sim.hunter.y + 1.5, sim.hunter.z];
    In.wantLock = !In.touch && !AUTO;
    In.camDX = In.camDY = 0; In.pausePressed = false; In.lockPressed = false;
    if (In.wantLock && !In.noLock && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 無視 */ } }
    Au.music('camp');
    Au.play('ok');
    UI.banner('狩猟開始', D.monsterName + ' を狩れ', '#f3efe4');
    fadeCur = 1; fadeTarget = 0;
    acc = 0;
  };
  app.resume = function () {
    app.paused = false;
    UI.pause(false);
    if (In.wantLock && !In.noLock && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 無視 */ } }
    In.pausePressed = false;
  };
  app.quit = function () { app.toBase(); };
  app.weapon = () => sv.weapon;
  UI.init(app);

  // ---------- できごと ----------
  function handle(e) {
    F.onEvent(e, sim, rs);
    Au.onEvent(e, sim);
    if (app.state !== 'hunt') return;
    const po = R.post;
    switch (e.type) {
      case 'hit':
        if (e.cls === 2 && e.part === 'head') note('head');
        if (e.cls === 2 && e.part === 'back') note('back');
        sv.tut.atk = true;
        break;
      case 'swing': if (sim.hunter.move && sim.hunter.move.heavy) usedHeavy = true; break;
      case 'chargeLv': usedHeavy = true; break;
      case 'dodge': sv.tut.dodge = true; break;
      case 'break':
        UI.banner(e.part === 'head' ? '角を折った！' : e.part === 'back' ? '背の結晶を割った！' : '尻尾を切った！', '部位破壊', '#ffd76a');
        if (e.part === 'tail') note('tail');
        if (e.part === 'back') note('back');
        break;
      case 'topple': if (!e.back && sim.mon.parts.leg.acc === 0) note('leg'); break;
      case 'perfect': UI.banner('ジャスト回避', '次の一撃が強くなる', '#8feaff'); po.tintA = 0.4; po.ca = 0.012; note('perfect'); break;
      case 'pguard': UI.banner('ジャストガード', '強攻撃で反撃', '#ffe08a'); po.ca = 0.01; note('perfect'); break;
      case 'roar': po.ca = 0.011; Au.music(sim.mon.rage.on ? 'rage' : 'battle'); break;
      case 'rage': Au.music('rage'); break;
      case 'calm': Au.music('battle'); note('tired'); break;
      case 'hurt': {
        po.hurt = Math.min(1.2, po.hurt + 0.45 + e.dmg / 50);
        const k = e.src && UI.ATKINFO[e.src] ? e.src : null;
        if (k) { dmgBy[k] = dmgBy[k] || { n: 0, d: 0 }; dmgBy[k].n++; dmgBy[k].d += e.dmg; }
        break;
      }
      case 'faint': UI.banner('力尽きた…', sim.hunter.faints + 1 < 3 ? 'キャンプへ運ばれる' : '', '#ff9a88'); break;
      case 'respawn': fadeCur = 1; fadeTarget = 0; cam.t = [sim.hunter.x, sim.hunter.y + 1.5, sim.hunter.z]; cam.yaw = 0; break;
      case 'art': UI.banner(sim.hunter.weapon === 'gs' ? '奥義　天墜・轟雷斬' : '奥義　乱舞・百雷', '', '#8feaff'); usedHeavy = true; break;
      case 'kill': Au.music('clear'); po.flash = 0.35; break;
      case 'fail': Au.music('fail'); break;
    }
  }

  function finishHunt() {
    resultShown = true;
    app.state = 'result';
    In.wantLock = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const st = sim.stats;
    const r = { clear: sim.result === 'clear', time: st.time, faints: sim.hunter.faints, breaks: st.breaks, newMemo: memoNew };
    if (r.clear) {
      const rw = D.rewards(st, sim.rankIdx, new M.RNG(huntSeed * 31 + 7));
      r.mats = rw.mats; r.zeny = rw.zeny; r.rank = D.rankOf(st);
      for (const k in rw.mats) sv.mats[k] = (sv.mats[k] || 0) + rw.mats[k];
      sv.zeny += rw.zeny;
      const i = sim.rankIdx;
      if (!sv.cleared[i] && D.ranks[i + 1]) r.unlock = '★'.repeat(i + 2) + ' ' + D.ranks[i + 1].name;
      sv.cleared[i] = true;
      if (!sv.best[i] || st.time < sv.best[i]) { r.newBest = sv.best[i] > 0; sv.best[i] = st.time; }
    } else {
      r.monHp = sim.mon.hp / sim.mon.hpMax;
      let wk = null;
      for (const k in dmgBy) if (!wk || dmgBy[k].d > dmgBy[wk].d) wk = k;
      if (wk) { r.worst = wk; r.worstN = dmgBy[wk].n; }
    }
    save();
    dbg.result = { result: sim.result, time: st.time, faints: r.faints, breaks: st.breaks, hits: st.hits, dmg: st.dmg, monHp: sim.mon.hp };
    UI.result(r);
    UI.show('result');
  }

  // ---------- 案内（できたら消える。時間では消えない） ----------
  function tips() {
    const h = sim.hunter, m = sim.mon;
    if (sim.result || h.state === 'dead') return UI.tip(null);
    if (h.hp < 40 && h.items[0].n > 0 && h.state !== 'item') {
      return UI.tip(h.itemSel === 0 ? K('E で 回復薬を飲む', 'X で 回復薬を飲む', '「使う」で 回復薬を飲む') : K('Q で 回復薬に切りかえる', '十字キーで 回復薬に切りかえる', '「切替」で 回復薬にする'));
    }
    if (S.sharpTier(h) >= 4 && h.state !== 'item') {
      return UI.tip(h.itemSel === 1 ? K('E で 砥石を使う（切れ味がもどる）', 'X で 砥石を使う', '「使う」で 砥石を使う') : K('切れ味が落ちた。Q で 砥石に切りかえる', '切れ味が落ちた。十字キーで 砥石に', '切れ味が落ちた。「切替」で 砥石に'));
    }
    if (sv.cleared[0]) return UI.tip(null);
    const t = sv.tut;
    if (!t.move) { if (moved > 6) { t.move = true; save(); } return UI.tip(K('W A S D で 移動', '左スティックで 移動', '画面の左側をドラッグして 移動')); }
    if (!m.aware) return UI.tip('奥にいる 雷晶獣に 近づこう');
    if (!t.atk) return UI.tip(K('左クリック（または J）で 攻撃', 'Y で 攻撃', '「攻」で 攻撃'));
    if (!t.dodge) return UI.tip(K('Space で 回避。動きを見て よけよう', 'A で 回避。動きを見て よけよう', '「回避」で よけよう'));
    if (!t.heavy) {
      if (usedHeavy) { t.heavy = true; save(); }
      return UI.tip(h.weapon === 'gs' ? K('右クリックを 押しつづけて ため斬り', 'B を 押しつづけて ため斬り', '「強」を 押しつづけて ため斬り') : K('右クリックで 突進斬り。L で「昂ぶり」', 'B で 突進斬り。RT で「昂ぶり」', '「強」で 突進斬り。「構え」で 昂ぶり'));
    }
    UI.tip(null);
  }

  // ---------- カメラ ----------
  function fwdOf(yaw) { return [Math.sin(yaw), 0, Math.cos(yaw)]; }
  function updateCamera(dt) {
    const h = sim.hunter, m = sim.mon, ps = sim.pose;
    let eye, at, fov = 55;
    if (app.state === 'title') {
      const a = time * 0.06 + 0.6;
      at = [m.x, m.y + 2.2, m.z];
      eye = [m.x + Math.sin(a) * 15, m.y + 4.5, m.z + Math.cos(a) * 15];
      fov = 48;
    } else if (app.state === 'base') {
      const a = Math.sin(time * 0.22) * 0.75;
      at = [h.x, h.y + 1.15, h.z];
      eye = [h.x + Math.sin(a) * 4.4, h.y + 1.7, h.z + Math.cos(a) * 4.4];
      fov = 42;
    } else {
      const d = Math.hypot(m.x - h.x, m.z - h.z);
      const tp = [h.x, h.y + 1.55 + h.yOff * 0.5, h.z];
      const k = 1 - Math.exp(-12 * dt);
      cam.t = V.lerp(cam.t, tp, k);
      const sens = In.mode === 'touch' ? 0.0045 : 0.0026;
      if (In.lockPressed) { cam.lock = !cam.lock; In.lockPressed = false; Au.play('click'); }
      const engaged = cam.lock && m.aware && m.state !== 'dead' && h.state !== 'dead';
      if (engaged) {
        const want = Math.atan2(m.x - h.x, m.z - h.z);
        cam.yaw += M.angDiff(cam.yaw, want) * (1 - Math.exp(-3.4 * dt));
        const wp = 0.2 + 0.2 * M.sat(1 - d / 14) + 0.32 * M.sat(1 - d / 4.5) + M.clamp(m.p.yOff * 0.03, 0, 0.15);
        cam.pitch += (wp - cam.pitch) * (1 - Math.exp(-2.5 * dt)) + In.camDY * sens * 0.4;
        cam.dist += (7.4 + 2.6 * M.sat(1 - d / 12) - cam.dist) * (1 - Math.exp(-2.5 * dt));
      } else {
        cam.yaw -= In.camDX * sens;
        cam.pitch += In.camDY * sens;
        cam.dist += (7.4 - cam.dist) * (1 - Math.exp(-2.5 * dt));
      }
      In.camDX = In.camDY = 0;
      cam.pitch = M.clamp(cam.pitch, -0.12, 1.25);
      cam.yaw = M.wrapPi(cam.yaw);
      const f = fwdOf(cam.yaw);
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      eye = [cam.t[0] - f[0] * cp * cam.dist, cam.t[1] + sp * cam.dist + 0.4, cam.t[2] - f[2] * cp * cam.dist];
      at = V.mad(cam.t, f, 2.0);
      if (engaged) at = V.lerp(at, [ps.chest[0], ps.chest[1] * 0.6 + cam.t[1] * 0.4, ps.chest[2]], 0.22);
      if (sim.result === 'clear') {
        const u = M.ease.inOut(M.sat(sim.endT / 2.5));
        const a = time * 0.25;
        at = V.lerp(at, [m.x, m.y + 1.6, m.z], u);
        eye = V.lerp(eye, [m.x + Math.sin(a) * 12, m.y + 4.5, m.z + Math.cos(a) * 12], u * 0.85);
      }
      // 開始の見せ場：先にねらう相手を映す
      cam.intro += dt;
      if (cam.intro < 3.0 && !AUTO) {
        const u = M.ease.inOut(M.sat((cam.intro - 1.7) / 1.3));
        const a = 0.9 + cam.intro * 0.18;
        const ie = [m.x + Math.sin(a) * 13, m.y + 3.6, m.z + Math.cos(a) * 13], ia = [m.x, m.y + 2.2, m.z];
        eye = V.lerp(ie, eye, u); at = V.lerp(ia, at, u);
      }
    }
    const gy = W.height(eye[0], eye[2]) + 0.5;
    if (eye[1] < gy) eye[1] = gy;
    if (sv.opts.shake && F.trauma > 0) {
      const s2 = F.trauma * F.trauma * 0.38;
      eye = [eye[0] + (M.noise2(time * 31, 1) - 0.5) * s2, eye[1] + (M.noise2(time * 37, 5) - 0.5) * s2, eye[2] + (M.noise2(time * 29, 9) - 0.5) * s2];
    }
    if (dbg.camFn) { const o = dbg.camFn(sim, time); eye = o.eye; at = o.at; fov = o.fov || fov; } // 検査用：撮る位置を決める
    cam.eye = eye; cam.at = at;
    const dHM = Math.hypot(m.x - h.x, m.z - h.z);
    const focus = app.state === 'hunt' || app.state === 'result' ? (dHM < 38 ? [(h.x + m.x) / 2, 0, (h.z + m.z) / 2] : [h.x, 0, h.z]) : [at[0], 0, at[2]];
    G.setCamera(eye, at, fov, focus);
    // タイトルと拠点だけ、前後をぼかす（狩りの中は見やすさを優先して ぼかさない）
    const wantDof = dbg.camFn ? 0 : app.state === 'base' ? 1 : app.state === 'title' ? 0.4 : 0;
    R.dofK = (R.dofK || 0) + (wantDof - (R.dofK || 0)) * Math.min(1, dt * 4 + (app.paused ? 1 : 0));
    R.focusD = V.dist(eye, at);
  }

  // ---------- 1フレーム ----------
  function frame(now) {
    let dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    if (dbg.freeze) dt = 0; // 検査用：時間を止める
    // 重いとき（決めた こま数 に とどかない状態が3秒つづく）は、描く細かさを自動で下げる
    if (DYN && dt > 0 && dt < 0.1 && !app.paused) {
      const capIv = fpsCap() > 0 ? 1 / fpsCap() : 1 / 60;
      ftAvg += (dt - ftAvg) * 0.04;
      slowT = ftAvg > Math.max(1 / 45, capIv * 1.35) ? slowT + dt : Math.max(0, slowT - dt * 2);
      if (slowT > 3) {
        slowT = 0; ftAvg = capIv;
        if ((R.dynScale || 1) > 0.62) R.dynScale = Math.max(0.6, (R.dynScale || 1) - 0.14);
        else if (!R.noFx) R.noFx = true;
        dbg.dyn = { scale: R.dynScale || 1, noFx: !!R.noFx };
      }
    }
    const tP0 = performance.now();
    time += dt;
    dbg.frames++;
    dbg.state = app.state;
    G.resize();
    const dpr = R.w / Math.max(1, canvas.clientWidth);
    if (ov.width !== R.w || ov.height !== R.h) { ov.width = R.w; ov.height = R.h; }

    simAdv = 0;
    if (app.state === 'hunt' || app.state === 'result') {
      if (In.pausePressed) {
        In.pausePressed = false;
        if (app.state === 'hunt' && !sim.result) { app.paused = !app.paused; UI.pause(app.paused, sim.hunter.weapon); if (!app.paused) app.resume(); else if (document.pointerLockElement) document.exitPointerLock(); }
      }
      if (!app.paused) {
        acc += dt * SPEED;
        let n = 0;
        while (acc >= S.DT && n < 5 * SPEED) {
          if (dbg.stopAt && sim.t >= dbg.stopAt) { acc = 0; break; } // 検査用：決めた時刻で止めて撮る
          const inp = app.state === 'result' ? null : bot ? bot.think(sim) : In.poll(cam.yaw);
          const t0 = sim.t + sim.endT;
          const hx = sim.hunter.x, hz = sim.hunter.z;
          S.step(sim, inp);
          F.sampleTrail(sim);
          moved += Math.hypot(sim.hunter.x - hx, sim.hunter.z - hz);
          simAdv += sim.t + sim.endT - t0;
          for (let i = 0; i < sim.events.length; i++) handle(sim.events[i]);
          sim.events.length = 0;
          acc -= S.DT;
          n++;
        }
        if (n === 5 * SPEED) acc = 0;
        if (sim.mon.aware && !sim.result && sim.mon.state !== 'graze') { /* 音楽は roar で切りかわる */ }
        if (app.state === 'hunt' && sim.result && !resultShown && sim.endT > (sim.result === 'clear' ? 5.0 : 2.2)) finishHunt();
        if (app.state === 'hunt' && sim.hunter.state === 'dead' && !sim.result) fadeTarget = sim.faintT > 1.7 ? 1 : 0;
      }
    } else {
      S.step(sim, null);
      simAdv = S.DT;
      for (let i = 0; i < sim.events.length; i++) { F.onEvent(sim.events[i], sim, rs); }
      sim.events.length = 0;
    }
    const adt = app.paused ? 0 : dt;
    updateCamera(adt);

    // キャラクターを組み立てる
    const tP1 = performance.now();
    R.inst.length = 0;
    const b = R.batch;
    b.reset();
    A.drawMonster(b, sim, rs, adt, time);
    const hInfo = A.drawHunter(b, sim, rs, adt, time);
    if (A.drawCat) A.drawCat(b, sim, time);
    for (let i = 0; i < rs.events.length; i++) { F.onEvent(rs.events[i], sim, rs); if (app.state === 'hunt') Au.onEvent(rs.events[i], sim); }
    rs.events.length = 0;
    F.update(adt, time, sim, rs, cam.eye, simAdv);

    const h = sim.hunter, m = sim.mon, ps = sim.pose;
    const pu = R.push;
    pu[0] = h.x; pu[1] = h.z; pu[2] = 1.3; pu[3] = 0.5;
    pu[4] = ps.belly[0]; pu[5] = ps.belly[2]; pu[6] = 3.4; pu[7] = m.p.yOff > 1 ? 0 : 0.9;
    pu[8] = ps.chest[0]; pu[9] = ps.chest[2]; pu[10] = 2.8; pu[11] = m.p.yOff > 1 ? 0 : 0.9;

    // 画面全体の効果
    const po = R.post;
    po.hurt = Math.max(0, po.hurt - adt * 1.6);
    const low = app.state === 'hunt' && h.hp < 30 && h.state !== 'dead' ? 0.3 + 0.12 * Math.sin(time * 6) : 0;
    const hurtShow = Math.max(po.hurt, low);
    po.ca = Math.max(0, po.ca - adt * 0.03);
    po.tintA = Math.max(0, po.tintA - adt * 0.9);
    po.flash = Math.max(0, po.flash - adt * 1.2);
    R.storm += ((m.rage.on && m.state !== 'dead' ? 1 : 0) - R.storm) * (1 - Math.exp(-1.2 * dt));
    po.sat += ((app.state === 'hunt' && h.state === 'dead' ? 0.2 : 1) - po.sat) * (1 - Math.exp(-3 * dt));
    fadeCur += (fadeTarget - fadeCur) * (1 - Math.exp(-5 * dt));
    po.fade = fadeCur;
    // 点の光：近い街の光を12個まで ＋ 動く光（背の結晶・剣・雷の玉）。合わせて16個まで
    {
      const st = KT.WorldBuild.lights || [];
      const fx0 = cam.at[0], fz0 = cam.at[2];
      const cand = st.map((l) => [Math.hypot(l.p[0] - fx0, l.p[2] - fz0) - l.r, l]).sort((a, b2) => a[0] - b2[0]);
      const ls = [];
      for (let i = 0; i < cand.length && ls.length < 12; i++) ls.push(cand[i][1]);
      if (m.state !== 'dead') {
        const g = (0.5 + m.p.glow * 1.7 + (m.rage.on ? 0.55 : 0)) * (0.92 + 0.08 * Math.sin(time * 29));
        ls.push({ p: [ps.back[0], ps.back[1] + 2.2, ps.back[2]], r: 15 + g * 4, c: [0.2 * g, 1.25 * g, 2.1 * g] });
        ls.push({ p: [ps.head[0], ps.head[1] + 0.6, ps.head[2]], r: 9, c: [0.25 * g, 1.3 * g, 2.2 * g] });
      }
      if (hInfo && hInfo.blades && hInfo.blades[0]) {
        const bl = hInfo.blades[0], k = (0.55 + h.wlv * 0.22) * (h.state === 'atk' || h.state === 'charge' ? 1.9 : 1);
        ls.push({ p: [bl.g[0] + bl.d[0] * bl.len * 0.6, bl.g[1] + bl.d[1] * bl.len * 0.6 + 0.1, bl.g[2] + bl.d[2] * bl.len * 0.6], r: 9, c: [0.5 * k, 2.2 * k, 3.6 * k] });
      }
      if (sim.shots.length) { const o = sim.shots[0]; ls.push({ p: [o.x, 1.0, o.z], r: 12, c: [1.2, 5, 8] }); }
      R.lights = ls;
    }
    const keepHurt = po.hurt;
    po.hurt = hurtShow;
    const tP2 = performance.now();
    G.render(time);
    if (dbg.prof) R.gl.finish(); // 検査用：GPU が描き終わるまで待って時間を測る
    const tP3 = performance.now();
    po.hurt = keepHurt;
    {
      const c = dbg.cpu || (dbg.cpu = { sim: 0, build: 0, render: 0 });
      c.sim += (tP1 - tP0 - c.sim) * 0.05; c.build += (tP2 - tP1 - c.build) * 0.05; c.render += (tP3 - tP2 - c.render) * 0.05;
    }

    octx.clearRect(0, 0, ov.width, ov.height);
    octx.save();
    F.drawNums(octx, adt, dpr);
    octx.restore();

    if (app.state === 'hunt') { UI.hud(sim, cam.lock, cam.yaw); tips(); }
    Au.tick();
    if (dbg.afterFrame) dbg.afterFrame(); // 検査用：描いた直後の絵を読む
  }
  // ダメージ数字は CSS px で投影されるので、キャンバスの倍率を合わせる
  const _dn = F.drawNums;
  F.drawNums = function (ctx, dt, dpr) { ctx.scale(dpr, dpr); _dn(ctx, dt, 1); };

  // タイトルに出す お知らせ（1回だけ）
  const noteEl = document.getElementById('kt-note');
  function setNote(t) { noteText = t || ''; if (noteEl) { noteEl.textContent = noteText; noteEl.classList.toggle('kt-hide', !noteText); } }
  try {
    const lg = AUTO ? [] : JSON.parse(localStorage.getItem(LOGKEY) || '[]');
    const last = lg[lg.length - 1];
    if (last && last.t > (localStorage.getItem(LOGKEY + '-seen') || '')) { noteText = '前回の記録: ' + last.msg + (noteText ? '\n' + noteText : ''); localStorage.setItem(LOGKEY + '-seen', last.t); }
  } catch (e) { /* 無視 */ }
  setNote(noteText);

  newSim(1);
  UI.show('title');
  dbg.app = app;
  dbg.rs = () => rs;
  dbg.sim = () => sim;
  dbg.cam = cam;

  let lastDraw = -1e9, errStreak = 0, stopped = false;
  function loop(now) {
    if (stopped) return;
    if (!BG) requestAnimationFrame(loop);
    // こま数の上限：画面が 144Hz や 240Hz でも、決めた回数しか描かない（熱と電気をへらす）。止めている間は もっと少なく
    const cap = app.paused ? Math.min(15, fpsCap() || 15) : fpsCap();
    if (cap > 0) {
      const iv = 1000 / cap, el = now - lastDraw;
      if (el < iv - 1) return;
      lastDraw = now - Math.min(Math.max(0, el - iv), iv);
    }
    if (glLost) {
      lastNow = now;
      if (lostAt && now - lostAt > 8000) { lostAt = 0; showErr('描画が止まりました。ページを読みこみ直してください（F5）。'); }
      return;
    }
    try { frame(now); errStreak = 0; } catch (e) {
      errStreak++;
      const msg = e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n');
      if (errStreak === 1) { showErr(msg); logStop('エラー: ' + e.message); console.error(e); }
      if (errStreak >= 20) { stopped = true; showErr('くり返しエラーが出たので止めました。ページを読みこみ直してください（F5）。\n' + msg); }
    }
  }
  const BG = params.get('bg') === '1';
  lastNow = performance.now();
  if (BG) setInterval(() => loop(performance.now()), 16);
  else requestAnimationFrame(loop);
  if (AUTO) { app.sel = M.clamp(+(params.get('quest') || 0) | 0, 0, 2); app.startHunt(); }
})();
