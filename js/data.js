// 狩りの谷 — データ（武器・防具・クエスト・素材）
(function () {
  'use strict';
  const KT = globalThis.KT || (globalThis.KT = {});
  const D = (KT.Data = {});

  D.title = '狩りの谷';
  D.monsterName = '雷晶獣 ゼルグラム';

  // 切れ味の段（上から）: 白 / 青 / 緑 / 黄 / 赤
  D.sharpMods = [1.32, 1.2, 1.05, 1.0, 0.6];
  D.sharpNames = ['白', '青', '緑', '黄', '赤'];
  D.sharpColors = ['#f4f6ff', '#4d8dff', '#58c84a', '#f2d23c', '#e2483a'];

  D.weapons = {
    gs: {
      id: 'gs', name: '大剣', desc: '重い一撃。ためて放つ。刃でガードできる。',
      len: 2.5, rad: 0.58, sharpMax: 50, run: 4.7, sprint: 6.7,
      levels: [
        { name: '鉄牙の大剣', atk: 100, aff: 0, top: 2 },
        { name: '鉄牙の大剣・改', atk: 118, aff: 0, top: 2 },
        { name: '雷牙の大剣', atk: 138, aff: 0.05, top: 1 },
        { name: '雷牙の大剣・改', atk: 160, aff: 0.1, top: 1 },
        { name: '轟雷剣ゼルグラム', atk: 188, aff: 0.15, top: 0 },
      ],
    },
    db: {
      id: 'db', name: '双剣', desc: '手数で押す。「昂ぶり」で速くなる。',
      len: 0.95, rad: 0.45, sharpMax: 90, run: 5.5, sprint: 7.8,
      levels: [
        { name: '鉄爪の双剣', atk: 100, aff: 0.05, top: 2 },
        { name: '鉄爪の双剣・改', atk: 118, aff: 0.05, top: 2 },
        { name: '雷爪の双剣', atk: 138, aff: 0.1, top: 1 },
        { name: '雷爪の双剣・改', atk: 160, aff: 0.15, top: 1 },
        { name: '迅雷双ゼルグラム', atk: 188, aff: 0.25, top: 0 },
      ],
    },
  };

  D.armor = [
    { name: '旅人の服', def: 0 },
    { name: '革の狩衣', def: 22 },
    { name: '雷獣の狩衣', def: 48 },
    { name: '雷獣の狩衣・改', def: 78 },
    { name: '轟雷の鎧', def: 115 },
  ];

  // クエスト（同じ相手が段階ごとに強くなり、技が増える）
  D.ranks = [
    { name: '谷の雷晶獣', star: 1, hp: 3800, dmg: 0.72, spd: 0.92, wait: [1.0, 1.7], thunder: false, combo: 0, part: 1.0, zeny: 800 },
    { name: '怒れる雷晶獣', star: 2, hp: 5600, dmg: 1.0, spd: 1.0, wait: [0.7, 1.3], thunder: true, combo: 0.35, part: 1.35, zeny: 1600 },
    { name: '轟雷のぬし', star: 3, hp: 8000, dmg: 1.3, spd: 1.08, wait: [0.45, 0.95], thunder: true, combo: 0.7, part: 1.8, zeny: 3200 },
  ];

  D.mats = {
    scale: { name: '雷獣の鱗', color: '#6fa8c9' },
    shell: { name: '雷獣の甲殻', color: '#48708c' },
    horn: { name: '雷獣の尖角', color: '#e8e2c8' },
    tail: { name: '雷獣の尾', color: '#7d93a8' },
    crystal: { name: '蓄雷晶', color: '#7cf0ff' },
    gem: { name: '雷光の宝玉', color: '#ffe36a' },
  };

  // 強化の値段（Lv n → n+1）
  D.weaponCost = [
    { z: 500, scale: 3 },
    { z: 1200, shell: 3, horn: 1 },
    { z: 2500, shell: 4, crystal: 2, tail: 1 },
    { z: 5000, horn: 2, crystal: 3, gem: 1 },
  ];
  D.armorCost = [
    { z: 400, scale: 2 },
    { z: 1000, scale: 4, shell: 2 },
    { z: 2200, shell: 4, tail: 1, horn: 1 },
    { z: 4500, crystal: 3, tail: 2, gem: 1 },
  ];

  D.items = {
    potion: { name: '回復薬', dur: 1.5, at: 1.0 },
    whet: { name: '砥石', dur: 2.0, at: 1.7 },
    power: { name: '力の実', dur: 1.2, at: 0.9 },
  };

  // 報酬（上振れは運。部位破壊のぶんは必ずもらえる）
  D.rewards = function (stats, rankIdx, rng) {
    const r = {};
    const add = (k, n) => { if (n > 0) r[k] = (r[k] || 0) + n; };
    add('scale', 2 + rankIdx + (rng.next() < 0.5 ? 1 : 0));
    add('shell', 1 + rankIdx);
    if (stats.breaks.head) add('horn', 1 + (rankIdx >= 2 ? 1 : 0));
    if (stats.breaks.back) add('crystal', 1 + (rankIdx >= 1 ? 1 : 0));
    if (stats.breaks.tail) add('tail', 1);
    const nb = (stats.breaks.head ? 1 : 0) + (stats.breaks.back ? 1 : 0) + (stats.breaks.tail ? 1 : 0);
    const gemP = [0.04, 0.08, 0.14][rankIdx] + nb * 0.03;
    // ★3 で3か所すべて壊したら必ず出る（上限を運だけで止めない）
    if (rng.next() < gemP || (rankIdx >= 2 && nb === 3)) add('gem', 1);
    const tSec = stats.time;
    const zeny = D.ranks[rankIdx].zeny + Math.max(0, Math.round((600 - tSec) * (1 + rankIdx)));
    return { mats: r, zeny };
  };

  D.rankOf = function (stats) {
    const t = stats.time;
    if (stats.faints === 0 && t < 300) return 'S';
    if (stats.faints <= 1 && t < 480) return 'A';
    return 'B';
  };
})();
