// 住民税の計算・非課税判定のテスト: node --test tests/*.test.js
// 期待値は地方税法・同施行令・同施行規則（e-Gov 法令検索の原文）、総務省の資料、
// 市区町村の公式の計算例（横浜市・名古屋市 令和8年度）から写した。出典は lib/juminzei-values.js の SOURCES
const test = require('node:test');
const assert = require('node:assert/strict');
const J = require('../lib/juminzei.js');
const JV = require('../lib/juminzei-values.js');

const R9 = 2027, R8 = 2026;

// --- 市区町村の公式の計算例を再現する ---

test('横浜市「令和８年度市民税・県民税・森林環境税の計算（例）」を再現する', () => {
  // 給与 550 万円、社会保険料 394,800 円、一般生命保険料（新）9 万円、地震保険料 2 万円、
  // 配偶者（無収入）、子 17 歳・13 歳。指定都市。神奈川県の県民税 2.025%、均等割 市 3,900 円・県 1,300 円
  const r = J.calc({
    income: 5500000, shakai: 394800, seimei: { newIppan: 90000 }, jishin: { jishin: 20000 },
    spouse: { has: true, amount: 0 }, relatives: [{ age: '16-18' }, { age: 'u16' }],
    city: { shitei: true, custom: true, prefRate: '2.025', cityRate: '8', prefKinto: 1300, cityKinto: 3900 },
  }, R8);
  assert.equal(r.kyuyoShotoku, 3960000);
  assert.equal(r.seimei.total, 28000);
  assert.equal(r.jishin, 10000);
  assert.equal(r.haigusha.amount, 330000);
  assert.equal(r.relatives.fuyo, 330000);
  assert.equal(r.kojo, 1522800);
  assert.equal(r.taxable, 2437000);
  assert.equal(r.cityRaw, 194960);
  assert.equal(r.prefRaw, 49349);            // 49,349.25 → 1 円未満切り捨て
  assert.equal(r.diffSum, 150000);           // 基礎 5 万＋配偶者 5 万＋一般扶養 5 万
  assert.equal(r.choseiBase, 50000);         // 15 万 − 43.7 万 < 5 万 → 5 万
  assert.equal(r.choseiCity, 2000);
  assert.equal(r.choseiPref, 500);
  assert.equal(r.cityWari, 192900);
  assert.equal(r.prefWari, 48800);
  assert.equal(r.wari, 241700);
  assert.equal(r.prefKinto + r.cityKinto, 5200);
  assert.equal(r.shinrin, 1000);
  assert.equal(r.total, 247900);
});

test('名古屋市「市民税・県民税の計算例（令和8年度）」を再現する', () => {
  // 給与 5,505,000 円、社会保険料 825,600 円、旧契約の一般生命保険料 8 万円、妻（所得なし）、子 19 歳・16 歳・12 歳。
  // 名古屋市は市民税 7.7%（減税後）・均等割 2,800 円、愛知県の県民税 2%・均等割 1,500 円
  const r = J.calc({
    income: 5505000, shakai: 825600, seimei: { oldIppan: 80000 },
    spouse: { has: true, amount: 0 }, relatives: [{ age: '19-22' }, { age: '16-18' }, { age: 'u16' }],
    city: { shitei: true, custom: true, prefRate: '2', cityRate: '7.7', prefKinto: 1500, cityKinto: 2800 },
  }, R8);
  assert.equal(r.kyuyoShotoku, 3963200);
  assert.equal(r.seimei.total, 35000);
  assert.equal(r.relatives.fuyo, 780000);
  assert.equal(r.kojo, 2400600);
  assert.equal(r.taxable, 1562000);
  assert.equal(r.cityRaw, 120274);
  assert.equal(r.prefRaw, 31240);
  assert.equal(r.diffSum, 330000);           // 配偶者 5 万＋特定扶養 18 万＋一般扶養 5 万＋基礎 5 万
  assert.equal(r.choseiCity, 13200);
  assert.equal(r.choseiPref, 3300);
  assert.equal(r.city, 109800);              // 所得割＋均等割（100 円未満切り捨て）
  assert.equal(r.pref, 29400);
  assert.equal(r.total, 140200);             // 森林環境税 1,000 円を含む
});

// --- 非課税の基準（総務省の図・改正の概要の例） ---

test('均等割の非課税（単身・給与だけ）: 総務省の例 1級地 110万円・2級地 106.5万円・3級地 103万円（令和8年度）、1級地 119万円（令和9年度）', () => {
  assert.equal(J.incomeLine(J.kintowariLimit(0, 1, R8), R8), 1100000);
  assert.equal(J.incomeLine(J.kintowariLimit(0, 2, R8), R8), 1065000);
  assert.equal(J.incomeLine(J.kintowariLimit(0, 3, R8), R8), 1030000);
  assert.equal(J.incomeLine(J.kintowariLimit(0, 1, R9), R9), 1190000);
  assert.equal(J.incomeLine(J.kintowariLimit(0, 2, R9), R9), 1155000);
  assert.equal(J.incomeLine(J.kintowariLimit(0, 3, R9), R9), 1120000);
});

test('均等割の非課税限度額: 35万円×率×(人数+1)+10万円（扶養ありは+21万円×率）', () => {
  // [人数, 1 級地, 2 級地, 3 級地]
  const cases = [
    [0, 450000, 415000, 380000],
    [1, 1010000, 919000, 828000],     // 70+10+21 / 63+10+18.9 / 56+10+16.8
    [3, 1710000, 1549000, 1388000],
    [4, 2060000, 1864000, 1668000],
  ];
  for (const [n, a, b, c] of cases) {
    assert.equal(J.kintowariLimit(n, 1, R9), a, `${n} 人・1 級地`);
    assert.equal(J.kintowariLimit(n, 2, R9), b, `${n} 人・2 級地`);
    assert.equal(J.kintowariLimit(n, 3, R9), c, `${n} 人・3 級地`);
  }
});

test('所得割の非課税限度額: 35万円×(人数+1)+10万円（扶養ありは+32万円）。級地で変わらない', () => {
  assert.equal(J.shotokuwariLimit(0, R9), 450000);
  assert.equal(J.shotokuwariLimit(1, R9), 1120000);
  assert.equal(J.shotokuwariLimit(3, R9), 1820000);
  const base = { income: 1560000, spouse: { has: true, amount: 0 } };   // 給与所得 82 万円（令和9年度）
  for (const k of [1, 2, 3]) assert.equal(J.calc({ ...base, city: { kyuchi: k } }, R9).shotokuLimit, 1120000);
});

test('非課税の判定: 単身の境界（令和9年度 1級地）', () => {
  const at = (income, kyuchi = 1) => J.calc({ income, city: { kyuchi } }, R9);
  let r = at(1190000);                        // 給与所得 45 万円
  assert.equal(r.goukei, 450000);
  assert.ok(r.kintoHikazei && r.shotokuHikazei);
  assert.equal(r.total, 0);
  r = at(1191000);                            // 45.1 万円 → 課税
  assert.ok(!r.kintoHikazei && !r.shotokuHikazei);
  assert.ok(r.total > 0);
  // 2 級地: 均等割は 41.5 万円まで非課税
  r = at(1155000, 2);
  assert.ok(r.kintoHikazei);
  r = at(1156000, 2);                         // 41.6 万円: 均等割は課税、所得割は 45 万円以下なので非課税
  assert.ok(!r.kintoHikazei && r.shotokuHikazei);
  assert.equal(r.wari, 0);
  assert.equal(r.total, 5000);                // 均等割 4,000 円＋森林環境税 1,000 円
  assert.equal(r.installments.futsu.count, 1);   // 均等割だけなら 6 月に 1 回
});

test('非課税の判定: 家族の人数（16歳未満も数える。特定親族は数えない）', () => {
  // 配偶者（無収入）と 16 歳未満の子 2 人 → 3 人。所得割 182 万円、均等割 171 万円（1 級地）
  const fam = { spouse: { has: true, amount: 0 }, relatives: [{ age: 'u16' }, { age: 'u16' }] };
  let r = J.calc({ ...fam, income: 2600000 }, R9);   // 給与所得 1,740,000
  assert.equal(r.count, 3);
  assert.equal(r.kintoLimit, 1710000);
  assert.equal(r.shotokuLimit, 1820000);
  assert.ok(!r.kintoHikazei);
  assert.ok(r.shotokuHikazei);
  r = J.calc({ ...fam, income: 2550000 }, R9);       // 1,705,000 → 均等割も非課税
  assert.ok(r.kintoHikazei && r.shotokuHikazei);
  // 3 級地では均等割 138.8 万円
  r = J.calc({ ...fam, income: 2200000, city: { kyuchi: 3 } }, R9);   // 給与所得 1,460,000
  assert.equal(r.kintoLimit, 1388000);
  assert.ok(!r.kintoHikazei && r.shotokuHikazei);
  // 特定親族（19〜22 歳で所得 62 万円超）は人数に入らない
  r = J.calc({ income: 1500000, relatives: [{ age: '19-22', amount: 1500000 }] }, R9);
  assert.equal(r.count, 0);
  assert.equal(r.relatives.tokutei, 450000);
});

test('非課税の判定: 障害者・未成年者・寡婦・ひとり親は合計所得金額 135万円以下なら非課税', () => {
  // 令和9年度: 給与所得 135 万円 = 収入 2,050,000 円（〜219.1 万円未満は 収入 − 74 万円）
  const f = (self, income) => J.calc({ income, self }, R9);
  for (const self of [{ shogai: 'ippan' }, { minor: true }, { kafu: 'kafu' }, { kafu: 'hitorioya' }]) {
    assert.equal(f(self, 2090000).total, 0, JSON.stringify(self));
    assert.ok(f(self, 2091000).total > 0, JSON.stringify(self));
  }
  assert.equal(f({ seikatsuhogo: true }, 5000000).total, 0);
});

test('所得割の非課税限度額のすぐ上は、所得から所得割を引いた額が限度額を下回らないよう減らす（附則3条の3）', () => {
  // 配偶者（無収入）: 限度額 112 万円。給与所得 113 万円（収入 187 万円）
  const r = J.calc({ income: 1870000, spouse: { has: true, amount: 0 } }, R9);
  assert.equal(r.goukei, 1130000);
  assert.equal(r.taxable, 370000);           // 113 万 − 基礎 43 万 − 配偶者 33 万
  // 調整控除前 37,000 → 調整控除（10 万と 37 万の少ないほう × 5%）5,000 → 32,000
  assert.equal(r.prefAfterChosei + r.cityAfterChosei, 32000);
  // 113 万 − 3.2 万 = 109.8 万 < 112 万 → 2.2 万円減らして 1 万円
  assert.equal(Math.round(r.genKei), 22000);
  assert.equal(r.wari, 10000);
});

// --- 税率・調整控除・端数 ---

test('標準の税率: 道府県民税 4%・市町村民税 6%、指定都市は 2%・8%', () => {
  const b = { income: 6000000, shakai: 900000 };
  const a = J.calc(b, R9), s = J.calc({ ...b, city: { shitei: true } }, R9);
  assert.equal(a.taxable, s.taxable);
  assert.equal(a.prefRaw, a.taxable * 4 / 100);
  assert.equal(a.cityRaw, a.taxable * 6 / 100);
  assert.equal(s.prefRaw, s.taxable * 2 / 100);
  assert.equal(s.cityRaw, s.taxable * 8 / 100);
  // 調整控除の割合: 2%・3%（指定都市は 1%・4%）
  assert.equal(a.choseiPref, a.choseiBase * 2 / 100);
  assert.equal(a.choseiCity, a.choseiBase * 3 / 100);
  assert.equal(s.choseiPref, s.choseiBase * 1 / 100);
  assert.equal(s.choseiCity, s.choseiBase * 4 / 100);
  // 合計はどちらも同じ
  assert.equal(a.prefWari + a.cityWari, s.prefWari + s.cityWari);
});

test('調整控除: 合計課税所得金額 200万円以下は「人的控除の差」と「課税所得」の少ないほう', () => {
  // 単身（差 5 万円）で課税所得 3 万円 → 3 万円 × 5%
  let r = J.calc({ income: 1220000 }, R9);   // 給与所得 48 万 − 基礎 43 万 = 5 万
  assert.equal(r.taxable, 50000);
  assert.equal(r.choseiBase, 50000);
  r = J.calc({ income: 1210000 }, R9);        // 47 万 − 43 万 = 4 万
  assert.equal(r.choseiBase, 40000);
  // ちょうど 200 万円
  r = J.calc({ income: 3595999, shakai: 0, relatives: [{ age: '23-69' }] }, R9);
  const t = r.taxable;
  assert.ok(t <= 2000000);
  assert.equal(r.choseiBase, Math.min(r.diffSum, t));
});

test('調整控除: 合計課税所得金額 200万円超は「差 −（課税所得 − 200万円）」、5万円が下限', () => {
  // 配偶者＋特定扶養 2 人: 差 = 5+5+18+18 = 46 万円
  const fam = { spouse: { has: true, amount: 0 }, relatives: [{ age: '19-22' }, { age: '19-22' }] };
  let r = J.calc({ ...fam, income: 6400000, shakai: 900000 }, R9);
  assert.equal(r.diffSum, 460000);
  assert.ok(r.taxable > 2000000);
  assert.equal(r.choseiBase, Math.max(460000 - (r.taxable - 2000000), 50000));
  assert.ok(r.choseiBase > 50000);
  r = J.calc({ ...fam, income: 9000000, shakai: 1200000 }, R9);
  assert.equal(r.choseiBase, 50000);          // 下限
  // 合計所得金額 2,500 万円超は調整控除なし
  r = J.calc({ income: 27000001 }, R9);
  assert.ok(r.goukei > 25000000);
  assert.equal(r.choseiPref + r.choseiCity, 0);
});

test('人的控除の差: 障害者・寡婦・ひとり親（母 5万円・父 1万円）・勤労学生・老人・同居老親', () => {
  const d = (x) => J.calc({ income: 3000000, ...x }, R9).diffSum;
  assert.equal(d({}), 50000);
  assert.equal(d({ self: { shogai: 'ippan' } }), 60000);
  assert.equal(d({ self: { shogai: 'tokubetsu' } }), 150000);
  assert.equal(d({ self: { kafu: 'kafu' }, relatives: [{ age: 'u16' }] }), 60000);
  assert.equal(d({ self: { kafu: 'hitorioya', parent: 'mother' }, relatives: [{ age: 'u16' }] }), 100000);
  assert.equal(d({ self: { kafu: 'hitorioya', parent: 'father' }, relatives: [{ age: 'u16' }] }), 60000);
  assert.equal(d({ relatives: [{ age: '70' }] }), 150000);
  assert.equal(d({ relatives: [{ age: '70dokyo' }] }), 180000);
  assert.equal(d({ relatives: [{ age: 'u16', shogai: 'dokyo' }] }), 270000);
  assert.equal(d({ spouse: { has: true, over70: true } }), 150000);
  assert.equal(J.calc({ income: 1500000, self: { kinro: true } }, R9).diffSum, 60000);
});

test('端数: 課税所得は 1,000円未満、所得割は 100円未満を切り捨て', () => {
  const r = J.calc({ income: 3333333, shakai: 123456 }, R9);
  assert.equal(r.taxable % 1000, 0);
  assert.equal(r.prefWari % 100, 0);
  assert.equal(r.cityWari % 100, 0);
  assert.equal(r.taxable, Math.floor((r.goukei - r.kojo) / 1000) * 1000);
});

test('均等割と森林環境税: 1,000円＋3,000円＋1,000円（標準）', () => {
  const r = J.calc({ income: 3000000 }, R9);
  assert.equal(r.prefKinto, 1000);
  assert.equal(r.cityKinto, 3000);
  assert.equal(r.shinrin, 1000);
});

// --- 所得控除（住民税の額） ---

test('基礎控除 43万円（2,400万円以下）・29万円・15万円・0', () => {
  const k = (income) => J.calc({ income }, R9).kiso;
  assert.equal(k(5000000), 430000);
  assert.equal(k(24000000 + 1950000), 430000);
  assert.equal(k(24000001 + 1950000), 290000);
  assert.equal(k(24500000 + 1950000), 290000);
  assert.equal(k(24500001 + 1950000), 150000);
  assert.equal(k(25000000 + 1950000), 150000);
  assert.equal(k(25000001 + 1950000), 0);
});

test('生命保険料控除（住民税の式）: 境界と上限', () => {
  const s = (p) => J.seimeiKojo(p, R9);
  assert.equal(s({ newIppan: 12000 }).total, 12000);
  assert.equal(s({ newIppan: 32000 }).total, 22000);
  assert.equal(s({ newIppan: 56000 }).total, 28000);
  assert.equal(s({ newIppan: 56001 }).total, 28000);
  assert.equal(s({ oldIppan: 15000 }).total, 15000);
  assert.equal(s({ oldIppan: 40000 }).total, 27500);
  assert.equal(s({ oldIppan: 70000 }).total, 35000);
  assert.equal(s({ oldIppan: 70001 }).total, 35000);
  assert.equal(s({ newIppan: 30000, oldIppan: 30000 }).ippan, 28000);   // 合計は 2 万 8 千円まで
  assert.equal(s({ newIppan: 100000, oldIppan: 100000 }).ippan, 35000);  // 旧だけのほうが多い
  assert.equal(s({ newIppan: 100000, oldIppan: 100000, kaigo: 100000, newNenkin: 100000, oldNenkin: 100000 }).total, 70000);
  assert.equal(s({ newIppan: 12001 }).total, 12001);   // 12,001 × 1/2 + 6,000 = 12,000.5 → 切り上げ
});

test('地震保険料控除（住民税の式）', () => {
  const j = (p) => J.jishinKojo(p, R9);
  assert.equal(j({ jishin: 20000 }), 10000);
  assert.equal(j({ jishin: 50000 }), 25000);
  assert.equal(j({ jishin: 80000 }), 25000);
  assert.equal(j({ oldLong: 5000 }), 5000);
  assert.equal(j({ oldLong: 15000 }), 10000);
  assert.equal(j({ oldLong: 20000 }), 10000);
  assert.equal(j({ jishin: 40000, oldLong: 15000 }), 25000);
});

test('配偶者控除・配偶者特別控除（住民税の額）', () => {
  const h = (s, honnin = 5000000) => J.haigushaKojo(honnin, { has: true, incomeType: 'shotoku', amount: s }, R9);
  assert.equal(h(620000).amount, 330000);
  assert.equal(h(620000).kind, 'haigusha');
  assert.equal(h(620001).kind, 'tokubetsu');
  assert.equal(h(620001).amount, 330000);
  assert.equal(h(1000000).amount, 330000);
  assert.equal(h(1000001).amount, 310000);
  assert.equal(h(1050000).amount, 310000);
  assert.equal(h(1050001).amount, 260000);
  assert.equal(h(1100001).amount, 210000);
  assert.equal(h(1150001).amount, 160000);
  assert.equal(h(1200001).amount, 110000);
  assert.equal(h(1250001).amount, 60000);
  assert.equal(h(1300000).amount, 60000);
  assert.equal(h(1300001).amount, 30000);
  assert.equal(h(1330000).amount, 30000);
  assert.equal(h(1330001).amount, 0);
  // 本人 900 万超 950 万以下は 3 分の 2、950 万超は 3 分の 1（1 万円未満切り上げ）
  assert.equal(h(1000001, 9200000).amount, 210000);
  assert.equal(h(1000001, 9700000).amount, 110000);
  assert.equal(h(1050001, 9200000).amount, 180000);
  assert.equal(h(1050001, 9700000).amount, 90000);
  assert.equal(h(0, 9200000).amount, 220000);
  assert.equal(h(0, 9700000).amount, 110000);
  assert.equal(h(0, 10000001).amount, 0);
  // 令和8年度は 58 万円が境目
  const h8 = (s) => J.haigushaKojo(5000000, { has: true, incomeType: 'shotoku', amount: s }, R8);
  assert.equal(h8(580000).kind, 'haigusha');
  assert.equal(h8(580001).kind, 'tokubetsu');
});

test('扶養控除・特定親族特別控除（住民税の額）と所得要件 62万円（令和9年度）・58万円（令和8年度）', () => {
  const rel = (list, n) => J.relativesKojo(list, n);
  assert.equal(rel([{ age: '16-18', incomeType: 'shotoku', amount: 620000 }], R9).fuyo, 330000);
  assert.equal(rel([{ age: '16-18', incomeType: 'shotoku', amount: 620001 }], R9).fuyo, 0);
  assert.equal(rel([{ age: '16-18', incomeType: 'shotoku', amount: 580001 }], R8).fuyo, 0);
  assert.equal(rel([{ age: '19-22' }], R9).fuyo, 450000);
  assert.equal(rel([{ age: '70' }], R9).fuyo, 380000);
  assert.equal(rel([{ age: '70dokyo' }], R9).fuyo, 450000);
  assert.equal(rel([{ age: 'u16' }], R9).fuyo, 0);
  // 給与だけの子: 令和9年度は収入 136 万円まで扶養親族
  assert.equal(rel([{ age: '16-18', amount: 1360000 }], R9).count, 1);
  assert.equal(rel([{ age: '16-18', amount: 1361000 }], R9).count, 0);
  assert.equal(rel([{ age: '16-18', amount: 1230000 }], R8).count, 1);
  assert.equal(rel([{ age: '16-18', amount: 1231000 }], R8).count, 0);
  // 特定親族特別控除
  const t = J.tokuteiShinzokuAmount;
  assert.equal(t(950000), 450000);
  assert.equal(t(950001), 410000);
  assert.equal(t(1000000), 410000);
  assert.equal(t(1000001), 310000);
  assert.equal(t(1050001), 210000);
  assert.equal(t(1100001), 110000);
  assert.equal(t(1150000), 110000);
  assert.equal(t(1150001), 60000);
  assert.equal(t(1200001), 30000);
  assert.equal(t(1230000), 30000);
  assert.equal(t(1230001), 0);
});

test('障害者・寡婦・ひとり親・勤労学生の控除（住民税の額）と勤労学生の所得要件', () => {
  const k = (x, n = R9) => J.calc({ income: 1500000, ...x }, n).steps;
  const amt = (steps, key) => steps.find((s) => s.key === key).amount;
  assert.equal(amt(k({ self: { shogai: 'ippan' } }), 'shogai'), 260000);
  assert.equal(amt(k({ self: { shogai: 'tokubetsu' } }), 'shogai'), 300000);
  assert.equal(amt(k({ relatives: [{ age: 'u16', shogai: 'dokyo' }] }), 'shogai'), 530000);
  assert.equal(amt(k({ self: { kafu: 'kafu' } }), 'kafu'), 260000);
  assert.equal(amt(k({ self: { kafu: 'hitorioya' } }), 'kafu'), 300000);
  assert.equal(amt(k({ self: { kinro: true } }), 'kinro'), 260000);
  // 勤労学生: 令和9年度 89 万円以下（収入 163 万円）、令和8年度 85 万円以下（収入 150 万円）
  assert.equal(amt(J.calc({ income: 1630000, self: { kinro: true } }, R9).steps, 'kinro'), 260000);
  assert.equal(amt(J.calc({ income: 1631000, self: { kinro: true } }, R9).steps, 'kinro'), 0);
  assert.equal(amt(J.calc({ income: 1500000, self: { kinro: true } }, R8).steps, 'kinro'), 260000);
  assert.equal(amt(J.calc({ income: 1501000, self: { kinro: true } }, R8).steps, 'kinro'), 0);
});

// --- 納め方 ---

test('特別徴収: 12分の1を100円未満切り捨て、端数は6月。普通徴収: 4回で1,000円未満は6月', () => {
  let i = J.installments(172500, false);
  assert.deepEqual(i.tokubetsu, { first: 15200, rest: 14300 });
  assert.equal(i.tokubetsu.first + i.tokubetsu.rest * 11, 172500);
  assert.deepEqual(i.futsu, { first: 43500, rest: 43000, count: 4 });
  i = J.installments(1200, false);
  assert.equal(i.tokubetsu.first + i.tokubetsu.rest * 11, 1200);
  assert.equal(i.tokubetsu.rest, 100);
  i = J.installments(5000, true);
  assert.deepEqual(i.futsu, { first: 5000, rest: 0, count: 1 });
});

// --- 住宅ローン控除 ---

test('住宅借入金等特別税額控除: 所得税から引ききれない額を 2:3 で、上限 5%・9万7,500円', () => {
  // 年収 300 万・単身、住宅ローン控除 20 万円（令和4〜7年入居）
  const r = J.calc({ income: 3000000, shakai: 450000, jutaku: { amount: 200000, year: 'r4_r7' } }, R9);
  const left = r.jutaku.left;
  assert.ok(left > 0);
  // 上限: 所得税の課税総所得金額等＋（所得税の基礎控除 104 万 − 48 万）の 5%、9 万 7,500 円まで
  assert.ok(r.jutaku.pref + r.jutaku.city <= 97500);
  assert.ok(r.jutaku.pref <= r.prefAfterChosei && r.jutaku.city <= r.cityAfterChosei);
  // 令和8年以後に入居なら基礎控除の調整なし → 上限は小さいか同じ
  const r8 = J.calc({ income: 3000000, shakai: 450000, jutaku: { amount: 200000, year: 'r8' } }, R9);
  assert.ok(r8.jutaku.cap <= r.jutaku.cap);
});

test('住宅借入金等特別税額控除: 上限の円の額（5% は 97,500円、特定取得 7% は 136,500円）', () => {
  const big = { income: 9000000, shakai: 1000000, jutaku: { amount: 900000, year: 'h28_r3' } };
  let r = J.calc(big, R9);
  assert.equal(r.jutaku.cap, 97500);
  assert.equal(r.jutaku.pref, 39000);
  assert.equal(r.jutaku.city, 58500);
  r = J.calc({ ...big, jutaku: { ...big.jutaku, tokutei: true } }, R9);
  assert.equal(r.jutaku.cap, 136500);
  assert.equal(r.jutaku.pref, 54600);
  assert.equal(r.jutaku.city, 81900);
  r = J.calc({ ...big, city: { shitei: true } }, R9);
  assert.equal(r.jutaku.pref, 19500);
  assert.equal(r.jutaku.city, 78000);
});

// --- ふるさと納税の上限の目安 ---

test('ふるさと納税の上限の目安: 所得割（調整控除後）× 20% ÷ 特例控除の割合 ＋ 2,000円', () => {
  const r = J.calc({ income: 5000000, shakai: 720000 }, R9);
  const f = r.furusato;
  assert.ok(f);
  const expect = Math.floor(Math.min(r.prefAfterChosei * 0.2 / (f.ratio / 100 * 2 / 5), r.cityAfterChosei * 0.2 / (f.ratio / 100 * 3 / 5))) + 2000;
  assert.equal(f.limit, expect);
  // 割合の表（復興特別所得税を含む）
  assert.deepEqual(JV.nendo[R9].furusato.table.map((x) => x[1]), [84.895, 79.79, 69.58, 66.517, 56.307, 49.16, 44.055]);
  // 非課税の人には出さない
  assert.equal(J.calc({ income: 1000000 }, R9).furusato, null);
  // 令和8年度（比較）には出さない
  assert.equal(J.calc({ income: 5000000 }, R8).furusato, null);
});

// --- 年度の違い ---

test('令和9年度と令和8年度: 給与所得（最低 74万円／65万円）と非課税ライン', () => {
  assert.equal(J.kyuyoShotoku(1500000, R9).value, 760000);
  assert.equal(J.kyuyoShotoku(1500000, R8).value, 850000);
  const a = J.calc({ income: 1150000 }, R9), b = J.calc({ income: 1150000 }, R8);
  assert.equal(a.total, 0);
  assert.ok(b.total > 0);
});

test('値の表: 出典と確認日', () => {
  assert.match(JV.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(JV.SOURCES.length >= 8);
  for (const s of JV.SOURCES) assert.match(s.url, /^https:\/\//);
  assert.equal(JV.nendo[R9].fuyoLimit, 620000);
  assert.equal(JV.nendo[R8].fuyoLimit, 580000);
  assert.equal(JV.nendo[R9].hitorioya, 300000);
});

// --- 入力の正規化・ファイル ---

test('入力の正規化: おかしな値を直す', () => {
  const d = J.normalizeInput({ income: '-5', shakai: '1,000', city: { kyuchi: 9, prefRate: 'abc', shitei: true }, relatives: [{ age: 'x' }], self: { parent: 'x' } });
  assert.equal(d.income, 0);
  assert.equal(d.shakai, 1000);
  assert.equal(d.city.kyuchi, 1);
  assert.equal(d.city.prefRate, 2);   // 指定都市の標準
  assert.equal(J.normalizeInput({}).city.prefRate, 4);
  assert.equal(J.normalizeInput({}).city.cityRate, 6);
  assert.equal(d.relatives[0].age, '23-69');
  assert.equal(d.self.parent, 'mother');
});

test('ファイルへの書き出し・読み込み（D31）', () => {
  const data = { income: 5000000, spouse: { has: true, amount: 1000000 }, relatives: [{ age: 'u16' }], city: { shitei: true, kyuchi: 2 } };
  const file = J.toExportFile(data, new Date('2026-09-24T00:00:00Z'));
  assert.equal(file.tool, 'seido-keisan-juminzei');
  assert.equal(file.version, 1);
  assert.equal(file.exportedAt, '2026-09-24T00:00:00.000Z');
  const back = J.fromExportFile(JSON.parse(JSON.stringify(file)));
  assert.ok(back.ok);
  assert.deepEqual(back.data, J.normalizeInput(data));
  assert.equal(J.fromExportFile({ tool: 'seido-keisan-nenmatsu', version: 1, data: {} }).ok, false);
  assert.equal(J.fromExportFile({ tool: 'seido-keisan-juminzei', version: 99, data: {} }).ok, false);
  assert.equal(J.fromExportFile(null).ok, false);
});

test('年末調整の計算の入力を写す', () => {
  const nen = { income: 4000000, withheld: 80000, shakai: 600000, spouse: { has: true, amount: 500000 }, relatives: [{ age: '19-22' }], self: { kinro: false, kafu: 'none', shogai: 'none' }, jutaku: 120000 };
  const d = J.fromNenmatsu(nen, { city: { shitei: true, kyuchi: 2 } });
  assert.equal(d.income, 4000000);
  assert.equal(d.shakai, 600000);
  assert.equal(d.relatives[0].age, '19-22');
  assert.equal(d.jutaku.amount, 120000);
  assert.equal(d.city.shitei, true);
  assert.equal(d.city.kyuchi, 2);
});

test('使い方ページの「給与だけの人の目安」の表と一致する（令和9年度）', () => {
  const rows = [
    [0, [1190000, 1155000, 1120000], 1190000],
    [1, [1750000, 1659000, 1568000], 1860000],
    [2, [2100000, 1974000, 1848000], 2215999],
    [3, [2559999, 2327999, 2128000], 2715999],
  ];
  for (const [n, kin, sho] of rows) {
    assert.deepEqual([1, 2, 3].map((k) => J.incomeLine(J.kintowariLimit(n, k, R9), R9)), kin, `${n} 人・均等割`);
    assert.equal(J.incomeLine(J.shotokuwariLimit(n, R9), R9), sho, `${n} 人・所得割`);
  }
});
