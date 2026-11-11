// 狩りの谷 — 画面（タイトル・拠点・HUD・結果・ひとやすみ）
(function () {
  'use strict';
  const KT = globalThis.KT;
  const D = KT.Data, S = KT.Sim, In = KT.Input;
  const UI = (KT.UI = {});
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  let app = null;
  const last = {};

  UI.ATKINFO = {
    bite: ['かみつき', '正面に立たない。横か足もとへ回りこむ。'],
    claw: ['ひっかき', '前足を上げたら、うしろへ回避する。'],
    tailsweep: ['尻尾まわし', '体をひねったら はなれる。近いなら尻尾に合わせて回避。'],
    charge: ['突進', 'まっすぐ来る。横へ走ればよけられる。'],
    pounce: ['とびかかり', '深くしゃがんだら、着地する場所からはなれる。'],
    bolt: ['雷の玉', '玉と玉のあいだへ。横へ走ればよけられる。'],
    tailslam: ['尻尾たたき', '背中を向けたら、尻尾のまうしろに立たない。'],
    thunder: ['落雷', '赤い輪の外へ出る。最後は体のまわり全部に落ちる。'],
  };
  UI.MEMO = [
    ['head', '頭は やわらかい。水色の数字が出る。'],
    ['leg', '足を攻めつづけると 転ぶ。'],
    ['tail', '尻尾は 切れる。切ると とどく範囲がへる。'],
    ['back', '怒ると 背中の結晶が光って やわらかくなる。転ばせると とどく。割ると 怒りが止まる。'],
    ['tired', '怒りがおさまると 疲れて すきが大きくなる。'],
    ['perfect', '当たる瞬間に回避すると「ジャスト回避」。次の一撃が強くなる。'],
  ];

  function keysHTML(weapon) {
    const g = weapon === 'gs' ? 'ガード（刃で受ける）' : '昂ぶり（速くなる・スタミナがへる）';
    const hv = weapon === 'gs' ? '強攻撃（押しつづけて ため）' : '強攻撃（突進斬り）';
    let rows;
    if (In.mode === 'pad') rows = [['左スティック', '移動'], ['Y', '攻撃'], ['B', hv], ['A', '回避'], ['RB', '走る'], ['RT', g], ['LB', '奥義（ゲージ満タンで）'], ['X', 'アイテムを使う（十字キー左右で切替）'], ['R3', '視点をモンスターに固定'], ['START', 'ひとやすみ']];
    else if (In.touch) rows = [['左側をドラッグ', '移動（大きく倒すと走る）'], ['右側をドラッグ', '視点'], ['攻 / 強', '攻撃 / ' + hv], ['回避', '回避'], ['構え', g], ['奥義', 'ゲージ満タンで'], ['使う / 切替', 'アイテム']];
    else rows = [['W A S D', '移動'], ['左クリック / J', '攻撃'], ['右クリック / K', hv], ['Space', '回避'], ['Shift', '走る'], ['L / C', g], ['R', '奥義（ゲージ満タンで）'], ['E', 'アイテムを使う（Q で切替）'], ['F', '視点をモンスターに固定'], ['P / Esc', 'ひとやすみ']];
    return rows.map((r) => `<b>${r[0]}</b><span>${r[1]}</span>`).join('');
  }

  UI.init = function (a) {
    app = a;
    $('kt-start').onclick = () => app.toBase();
    $('kt-go').onclick = () => app.startHunt();
    $('kt-resume').onclick = () => app.resume();
    $('kt-quit').onclick = () => app.quit();
    $('kt-vol').oninput = (e) => app.setOpt('vol', +e.target.value / 100);
    $('kt-shake').onchange = (e) => app.setOpt('shake', e.target.checked);
    $('kt-qual').onchange = (e) => app.setOpt('quality', e.target.value);
    $('kt-fps').onchange = (e) => app.setOpt('fps', +e.target.value);
    $('kt-helpbtn').onclick = () => { $('kt-keys').innerHTML = keysHTML(app.weapon()); $('kt-help').classList.remove('kt-hide'); };
    $('kt-helpclose').onclick = () => $('kt-help').classList.add('kt-hide');
  };

  UI.show = function (name) {
    $('kt-title').classList.toggle('kt-hide', name !== 'title');
    $('kt-base').classList.toggle('kt-hide', name !== 'base');
    $('kt-hud').classList.toggle('kt-hide', name !== 'hunt');
    $('kt-result').classList.toggle('kt-hide', name !== 'result');
    $('kt-touch').classList.toggle('kt-hide', !(name === 'hunt' && In.touch));
    In.touchUI = name === 'hunt' && In.touch;
    if (name !== 'hunt') $('kt-pause').classList.add('kt-hide');
    if (name !== 'base') $('kt-help').classList.add('kt-hide');
  };
  UI.pause = function (on, weapon) {
    $('kt-pause').classList.toggle('kt-hide', !on);
    if (on) $('kt-keys2').innerHTML = keysHTML(weapon);
  };
  UI.fade = function (v) { $('kt-fade').style.opacity = v; };

  function costHTML(cost, sv) {
    const parts = [];
    for (const k in cost) {
      const have = k === 'z' ? sv.zeny : sv.mats[k] || 0;
      const nm = k === 'z' ? 'お金' : D.mats[k].name;
      parts.push(`<span class="${have < cost[k] ? 'kt-ng' : ''}">${nm} ${have}/${cost[k]}</span>`);
    }
    return parts.join('');
  }
  UI.canPay = function (cost, sv) {
    for (const k in cost) if ((k === 'z' ? sv.zeny : sv.mats[k] || 0) < cost[k]) return false;
    return true;
  };

  UI.renderBase = function (sv, sel) {
    // クエスト
    const q = $('kt-quests');
    q.innerHTML = '';
    D.ranks.forEach((r, i) => {
      const open = i === 0 || sv.cleared[i - 1];
      const b = el('button', 'kt-quest' + (sel === i ? ' kt-sel' : ''));
      const best = sv.best[i] ? `最速 ${fmtTime(sv.best[i])}` : sv.cleared[i] ? '' : open ? 'まだ狩っていない' : `★${i} を狩ると出る`;
      b.innerHTML = `<span class="kt-star">${'★'.repeat(r.star)}</span><span><div class="kt-qname">${r.name}</div><div class="kt-qsub">${best}</div></span>`;
      b.disabled = !open;
      b.onclick = () => app.selectQuest(i);
      q.appendChild(b);
    });
    $('kt-goinfo').innerHTML = `ねらい：<b>${D.monsterName}</b>（${'★'.repeat(D.ranks[sel].star)}）<br>3回 力尽きると失敗`;
    // 狩猟メモ
    $('kt-memo').innerHTML = UI.MEMO.map(([k, t]) => (sv.notes[k] ? `<li>${t}</li>` : '<li class="kt-unknown">？？？（狩りの中で見つかる）</li>')).join('');
    // 装備
    const tabs = $('kt-wtabs');
    tabs.innerHTML = '';
    for (const id of ['gs', 'db']) {
      const b = el('button', 'kt-btn' + (sv.weapon === id ? ' kt-sel' : ''), D.weapons[id].name);
      b.onclick = () => app.setWeapon(id);
      tabs.appendChild(b);
    }
    const eq = $('kt-equip');
    eq.innerHTML = '';
    const wd = D.weapons[sv.weapon], wl = sv.wlv[sv.weapon];
    const w = wd.levels[wl];
    eq.appendChild(el('div', 'kt-eqsub', wd.desc));
    const row = el('div', 'kt-row');
    row.appendChild(el('div', '', `<div class="kt-eq">${w.name}</div><div class="kt-eqsub">攻撃 ${w.atk}　切れ味 ${D.sharpNames[w.top]}　会心 ${Math.round(w.aff * 100)}%</div>`));
    if (wl < wd.levels.length - 1) {
      const cost = D.weaponCost[wl];
      const b = el('button', 'kt-btn', '強化');
      b.disabled = !UI.canPay(cost, sv);
      b.onclick = () => app.upgrade('weapon');
      row.appendChild(b);
      eq.appendChild(row);
      eq.appendChild(el('div', 'kt-cost', `→ 攻撃 ${wd.levels[wl + 1].atk}：` + costHTML(cost, sv)));
    } else { row.appendChild(el('div', 'kt-eqsub', '最大')); eq.appendChild(row); }
    const ar = D.armor[sv.alv];
    const row2 = el('div', 'kt-row');
    row2.appendChild(el('div', '', `<div class="kt-eq">${ar.name}</div><div class="kt-eqsub">防御 ${ar.def}（受けるダメージ ${Math.round(10000 / (100 + ar.def))}%）</div>`));
    if (sv.alv < D.armor.length - 1) {
      const cost = D.armorCost[sv.alv];
      const b = el('button', 'kt-btn', '強化');
      b.disabled = !UI.canPay(cost, sv);
      b.onclick = () => app.upgrade('armor');
      row2.appendChild(b);
      eq.appendChild(row2);
      eq.appendChild(el('div', 'kt-cost', `→ 防御 ${D.armor[sv.alv + 1].def}：` + costHTML(cost, sv)));
    } else { row2.appendChild(el('div', 'kt-eqsub', '最大')); eq.appendChild(row2); }
    // 素材
    let mh = `<div class="kt-mat"><span class="kt-dot" style="background:#e8c35a"></span>お金 ${sv.zeny}</div>`;
    for (const k in D.mats) mh += `<div class="kt-mat"><span class="kt-dot" style="background:${D.mats[k].color}"></span>${D.mats[k].name} ${sv.mats[k] || 0}</div>`;
    $('kt-mats').innerHTML = mh;
    $('kt-vol').value = Math.round(sv.opts.vol * 100);
    $('kt-shake').checked = sv.opts.shake;
    $('kt-qual').value = sv.opts.quality;
    $('kt-fps').value = String(sv.opts.fps);
  };

  function fmtTime(t) { return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); }
  UI.fmtTime = fmtTime;
  function setW(id, key, pct) {
    const v = Math.round(pct * 10) / 10;
    if (last[key] !== v) { last[key] = v; $(id).style.width = v + '%'; }
  }
  function setT(id, key, txt) { if (last[key] !== txt) { last[key] = txt; $(id).textContent = txt; } }

  const MONTXT = { normal: 'ふつう', rage: '怒っている', tired: '疲れている', weak: '弱っている', dead: 'たおれた' };
  // レーダー：自分がまん中。カメラの向きが上。雷晶獣を点で出す（場のふちは うすい輪）
  let radarCtx = null;
  function radar(s, camYaw) {
    const cv = $('kt-radar');
    if (!cv || In.touch) return;
    const c = radarCtx || (radarCtx = cv.getContext('2d'));
    const S2 = cv.width, R0 = S2 / 2 - 6, h = s.hunter, m = s.mon, k = R0 / 52;
    c.clearRect(0, 0, S2, S2);
    c.save();
    c.translate(S2 / 2, S2 / 2);
    c.beginPath(); c.arc(0, 0, R0, 0, 6.2832); c.fillStyle = 'rgba(6,12,20,0.5)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(190,232,255,0.85)'; c.stroke();
    c.save(); c.clip();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(190,232,255,0.22)';
    for (const r of [R0 * 0.33, R0 * 0.66]) { c.beginPath(); c.arc(0, 0, r, 0, 6.2832); c.stroke(); }
    c.beginPath(); c.moveTo(-R0, 0); c.lineTo(R0, 0); c.moveTo(0, -R0); c.lineTo(0, R0); c.stroke();
    // 世界 → レーダー（カメラの向きを上に）
    const sy = Math.sin(camYaw), cy = Math.cos(camYaw);
    const map = (x, z) => { const dx = x - h.x, dz = z - h.z; return [(dx * cy - dz * sy) * k, -(dx * sy + dz * cy) * k]; };
    const o = map(0, 0);
    c.beginPath(); c.arc(o[0], o[1], KT.World.R * k, 0, 6.2832); c.lineWidth = 2; c.strokeStyle = 'rgba(120,200,255,0.4)'; c.stroke();
    // 雷晶獣
    let p = map(m.x, m.z);
    const d = Math.hypot(p[0], p[1]);
    if (d > R0 - 9) { p = [p[0] * (R0 - 9) / d, p[1] * (R0 - 9) / d]; }
    const rage = m.rage.on, dead = m.state === 'dead';
    c.beginPath(); c.arc(p[0], p[1], 7, 0, 6.2832);
    c.fillStyle = dead ? 'rgba(150,160,170,0.8)' : rage ? '#ff5a3a' : '#5fe3ff';
    c.shadowColor = c.fillStyle; c.shadowBlur = dead ? 0 : 12; c.fill(); c.shadowBlur = 0;
    if (!dead && m.state === 'atk') { c.beginPath(); c.arc(p[0], p[1], 12, 0, 6.2832); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke(); }
    c.restore();
    // 自分（上向きの三角）
    c.beginPath(); c.moveTo(0, -8); c.lineTo(6, 6); c.lineTo(0, 3); c.lineTo(-6, 6); c.closePath(); c.fillStyle = '#ffffff'; c.fill();
    c.restore();
  }
  // 操作ガイド（右下）。キーボード＋マウスとパッドで自動に切りかわる
  function keys(h) {
    const stance = h.weapon === 'gs' ? 'ガード' : '昂ぶり';
    const key = In.mode + h.weapon;
    if (last.keys === key) return;
    last.keys = key;
    const rows = In.mode === 'pad'
      ? [['Y', '攻撃'], ['B', '強攻撃'], ['A', '回避'], ['RT', stance], ['LB', '奥義']]
      : [['L-Click', '攻撃'], ['R-Click', '強攻撃'], ['Space', '回避'], ['L', stance], ['R', '奥義']];
    $('kt-keys').innerHTML = In.touch ? '' : rows.map(([k2, t]) => `<kbd>${k2}</kbd><span>${t}</span>`).join('');
  }
  UI.hud = function (s, lockOn, camYaw) {
    const h = s.hunter;
    radar(s, camYaw || 0);
    keys(h);
    setW('kt-hp', 'hp', (h.hp / h.hpMax) * 100);
    setW('kt-hp-red', 'red', (h.red / h.hpMax) * 100);
    setW('kt-st', 'st', (h.st / h.stMax) * 100);
    const tier = S.sharpTier(h);
    const shEl = $('kt-sharp').firstElementChild;
    const sw = Math.round((h.sharp / h.sharpMax) * 100);
    if (last.sharpW !== sw || last.tier !== tier) { last.sharpW = sw; last.tier = tier; shEl.style.width = sw + '%'; shEl.style.background = D.sharpColors[tier]; }
    setT('kt-buff', 'buff', (h.buffT > 0 ? '力↑ ' : '') + (h.focus ? '昂ぶり' : ''));
    setT('kt-time', 'time', fmtTime(s.result ? s.stats.time : s.t));
    setT('kt-faint', 'faint', `力尽き ${h.faints} / 3`);
    const ms = s.mon.aware ? S.monStatus(s) : 'unaware';
    if (last.ms !== ms) {
      last.ms = ms;
      const me = $('kt-mon');
      me.className = ms === 'rage' ? 'kt-rage' : ms === 'tired' ? 'kt-tired' : ms === 'weak' ? 'kt-weak' : '';
      me.lastElementChild.textContent = ms === 'unaware' ? 'まだ気づいていない' : MONTXT[ms];
    }
    const art = Math.round(h.art);
    if (last.art !== art) {
      last.art = art;
      $('kt-artbar').firstElementChild.style.width = art + '%';
      $('kt-art').classList.toggle('kt-ready', art >= 100);
      $('kt-artlbl').textContent = art >= 100 ? '奥義 ' + (In.mode === 'pad' ? 'LB' : In.touch ? '' : 'R') + ' で発動！' : '奥義';
    }
    const it = h.items[h.itemSel];
    const itxt = D.items[it.id].name + (it.n >= 0 ? ' ×' + it.n : '');
    if (last.item !== itxt + In.mode) {
      last.item = itxt + In.mode;
      $('kt-item').firstElementChild.textContent = itxt;
      $('kt-item').lastElementChild.textContent = In.mode === 'pad' ? 'X で使う ／ 十字で切替' : In.touch ? '' : 'E で使う ／ Q で切替';
    }
    setT('kt-lock', 'lock', In.touch ? '' : (lockOn ? '視点固定：入' : '視点固定：切') + (In.mode === 'pad' ? '（R3）' : '（F）'));
  };
  UI.resetHud = function () { for (const k in last) delete last[k]; $('kt-tip').classList.add('kt-hide'); };

  UI.banner = function (text, sub, color) {
    const b = $('kt-banner');
    b.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    b.style.color = color || '#fff';
    b.classList.remove('kt-fx-show');
    void b.offsetWidth;
    b.classList.add('kt-fx-show');
  };
  UI.tip = function (text) {
    if (last.tip === text) return;
    last.tip = text;
    const t = $('kt-tip');
    t.classList.toggle('kt-hide', !text);
    if (text) t.firstElementChild.textContent = text;
  };

  UI.result = function (r) {
    const c = $('kt-rescard');
    if (r.clear) {
      let loot = '';
      for (const k in r.mats) loot += `<span class="kt-chip${k === 'gem' ? ' kt-rare' : ''}"><span class="kt-dot" style="background:${D.mats[k].color}"></span>${D.mats[k].name} ×${r.mats[k]}</span>`;
      loot += `<span class="kt-chip"><span class="kt-dot" style="background:#e8c35a"></span>お金 +${r.zeny}</span>`;
      const br = [r.breaks.head ? '角' : '', r.breaks.back ? '背の結晶' : '', r.breaks.tail ? '尻尾' : ''].filter(Boolean).join('・');
      c.innerHTML = `<h2 class="kt-serif kt-win">討伐完了</h2>
        <div class="kt-res"><div>時間<b>${fmtTime(r.time)}</b>${r.newBest ? '最速を更新！' : ''}</div><div>評価<b class="kt-rank kt-serif">${r.rank}</b></div><div>力尽き<b>${r.faints}</b></div></div>
        <div class="kt-eqsub">${br ? 'こわした部位：' + br : '部位をこわすと 素材がふえる'}</div>
        <div class="kt-loot">${loot}</div>
        ${r.newMemo ? `<div class="kt-hint">狩猟メモに ${r.newMemo} つ 書きたした。</div>` : ''}
        ${r.unlock ? `<div class="kt-hint">新しいクエスト「${r.unlock}」が出た。</div>` : ''}
        <div class="kt-stack"><button class="kt-btn kt-primary" id="kt-back">拠点へもどる</button></div>`;
    } else {
      let hint = '';
      if (r.worst) hint = `<div class="kt-hint">いちばん痛かった技：<b>${UI.ATKINFO[r.worst][0]}</b>（${r.worstN}回）<br>${UI.ATKINFO[r.worst][1]}</div>`;
      c.innerHTML = `<h2 class="kt-serif kt-lose">クエスト失敗</h2>
        <div class="kt-res"><div>時間<b>${fmtTime(r.time)}</b></div><div>相手の残り体力<b>${Math.round(r.monHp * 100)}%</b></div></div>
        ${hint}
        ${r.newMemo ? `<div class="kt-hint">狩猟メモに ${r.newMemo} つ 書きたした。</div>` : ''}
        <div class="kt-stack"><button class="kt-btn kt-primary" id="kt-retry">もういちど挑む</button><button class="kt-btn" id="kt-back">拠点へもどる</button></div>`;
      $('kt-retry').onclick = () => app.startHunt();
    }
    $('kt-back').onclick = () => app.toBase();
  };
})();
