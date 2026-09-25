// 子ども・子育て支援金（いくら引かれる）のテスト: node --test tests/*.test.js
// 期待値は協会けんぽ「令和8年3月分（4月納付分）からの保険料額表」（東京支部）の「子ども・子育て支援金」の欄、
// こども家庭庁の年収別試算・リーフレット、健康保険法 156条・161条から手で計算した（出典は lib/shienkin-values.js の SOURCES）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../lib/shienkin.js');
const V = require('../lib/shienkin-values.js');
const IV = require('../lib/ikukyu-values.js');

// 協会けんぽの保険料額表の「子ども・子育て支援金 0.23%」の欄（等級 1〜50 の全額。円、0.1円単位）を写したもの
const KK_FULL = [133.4, 156.4, 179.4, 202.4, 225.4, 239.2, 253.0, 271.4, 289.8, 308.2, 326.6, 345.0, 368.0, 391.0, 414.0,
  437.0, 460.0, 506.0, 552.0, 598.0, 644.0, 690.0, 736.0, 782.0, 828.0, 874.0, 943.0, 1012.0, 1081.0, 1150.0, 1219.0,
  1288.0, 1357.0, 1426.0, 1495.0, 1564.0, 1633.0, 1725.0, 1817.0, 1909.0, 2024.0, 2139.0, 2254.0, 2369.0, 2507.0,
  2645.0, 2783.0, 2921.0, 3059.0, 3197.0];

test('協会けんぽの保険料額表の支援金の欄（全額・折半額）を 50 等級すべて 0.1円まで再現する', () => {
  const grades = IV.hoken.hyojunKenpo.map(r => r[1]);
  assert.equal(grades.length, 50);
  grades.forEach((g, i) => {
    const r = C.calc({ mode: 'hyojun', amount: g });
    assert.equal(r.hyojun, g);
    assert.equal(r.fullSen / 100, KK_FULL[i], '等級 ' + (i + 1) + ' 全額');
    assert.equal(r.selfSen * 2, r.fullSen, '等級 ' + (i + 1) + ' 折半');
  });
  // 額表の折半額の例: 58,000円 66.7円、300,000円 345.0円、1,390,000円 1,598.5円
  assert.equal(C.calc({ mode: 'hyojun', amount: 58000 }).selfSen, 6670);
  assert.equal(C.calc({ mode: 'hyojun', amount: 1390000 }).selfSen, 159850);
});

test('月給 → 標準報酬月額の境目（報酬月額の「以上・未満」）', () => {
  assert.equal(C.hyojunFromSalary(0), 58000);
  assert.equal(C.hyojunFromSalary(62999), 58000);
  assert.equal(C.hyojunFromSalary(63000), 68000);
  assert.equal(C.hyojunFromSalary(289999), 280000);
  assert.equal(C.hyojunFromSalary(290000), 300000);
  assert.equal(C.hyojunFromSalary(309999), 300000);
  assert.equal(C.hyojunFromSalary(310000), 320000);
  assert.equal(C.hyojunFromSalary(1354999), 1330000);
  assert.equal(C.hyojunFromSalary(1355000), 1390000);
  assert.equal(C.hyojunFromSalary(5000000), 1390000);
});

test('手で確かめた例 1: 月給30万円・賞与なし（会社員）', () => {
  const r = C.calc({ kind: 'kaisha', mode: 'salary', amount: 300000 });
  assert.equal(r.hyojun, 300000);
  assert.equal(r.fullSen, 69000);        // 300,000 × 0.23% ＝ 690円
  assert.equal(r.selfSen, 34500);        // 半分 345円
  assert.equal(r.employerSen, 34500);
  assert.equal(r.deductYen, 345);
  assert.equal(r.yearSen, 414000);       // 345 × 12 ＝ 4,140円
  assert.equal(r.months2026, 8);
  assert.equal(r.y2026Sen, 276000);      // 5〜12月の給与 8 か月 ＝ 2,760円
  assert.equal(r.ref2028Sen, 60000);     // 参考: 本人 0.2% なら 600円
});

test('手で確かめた例 2: 月給31万円は等級 32万円になる（月給 × 率ではない）', () => {
  const r = C.calc({ amount: 310000 });
  assert.equal(r.hyojun, 320000);
  assert.equal(r.selfSen, 36800);        // 736.0 の半分 368.0円（310,000 × 0.115% ＝ 356.5円ではない）
});

test('手で確かめた例 3: 月給24.5万円・賞与の合計 812,345円', () => {
  const r = C.calc({ amount: 245000, bonus: 812345 });
  assert.equal(r.hyojun, 240000);
  assert.equal(r.selfSen, 27600);        // 552.0 の半分 276.0円
  assert.equal(r.bonusStd, 812000);      // 1,000円未満切り捨て
  assert.equal(r.bonusSelfSen, 93380);   // 812,000 × 0.23% ＝ 1,867.6 の半分 933.8円
  assert.equal(r.yearSen, 27600 * 12 + 93380);   // 4,245.8円
  assert.equal(r.y2026Sen, 27600 * 8 + 93380);   // 3,141.8円
});

test('手で確かめた例 4: 50銭の端数（給与から引くときは 50銭以下切り捨て・50銭超切り上げ）', () => {
  const a = C.calc({ mode: 'hyojun', amount: 150000 });   // 345.0 の半分 172.5円 → 172円
  assert.equal(a.selfSen, 17250);
  assert.equal(a.deductYen, 172);
  const b = C.calc({ mode: 'hyojun', amount: 58000 });    // 66.7円 → 67円
  assert.equal(b.deductYen, 67);
  assert.equal(C.deductYen(17251), 173);
  assert.equal(C.deductYen(17250), 172);
});

test('手で確かめた例 5: 任意継続は全額本人・協会けんぽの上限 32万円・賞与なし・2026年は 9 か月', () => {
  const r = C.calc({ kind: 'ninkei', amount: 500000, bonus: 1000000 });
  assert.equal(r.hyojun, 320000);
  assert.equal(r.capped, true);
  assert.equal(r.selfSen, 73600);        // 736.0円を全額
  assert.equal(r.employerSen, 0);
  assert.equal(r.bonusStd, 0);
  assert.equal(r.months2026, 9);
  assert.equal(r.y2026Sen, 73600 * 9);   // 6,624円
});

test('手で確かめた例 6: 標準賞与額は年度の累計 573万円まで', () => {
  const r = C.calc({ amount: 1000000, bonus: 8000000 });
  assert.equal(r.bonusStd, 5730000);
  assert.equal(r.bonusCapped, true);
  assert.equal(r.bonusSelfSen, 658950);  // 5,730,000 × 0.23% ＝ 13,179円の半分 6,589.5円
});

test('標準報酬月額の欄に等級に無い額 → 月給として等級に直す', () => {
  const r = C.calc({ mode: 'hyojun', amount: 305000 });
  assert.equal(r.hyojun, 300000);
  assert.equal(r.regraded, true);
  assert.equal(C.calc({ mode: 'hyojun', amount: 300000 }).regraded, false);
});

test('国保・後期高齢者医療は個人の額を出さない（条例で決まる）', () => {
  for (const kind of ['kokuho', 'kouki']) {
    const r = C.calc({ kind, amount: 300000 });
    assert.equal(r.ready, false);
    assert.equal(r.municipal, true);
    assert.ok(r.model.rows.length >= 6);
  }
});

test('入力が無ければ結果を出さない・入力の正規化', () => {
  assert.equal(C.calc({}).ready, false);
  assert.deepEqual(C.normalizeInput({ kind: 'x', mode: 'y', amount: '-5', bonus: 'abc' }), { kind: 'kaisha', mode: 'salary', amount: 0, bonus: 0 });
});

test('値の表: 率・上限・国の年収別試算との整合', () => {
  assert.equal(V.rate, 0.23);
  assert.ok(V.rate <= V.rateCap);        // 健康保険法施行令 45条の5 の上限 0.25% の範囲内
  assert.equal(IV.hoken.shienRate, V.rate);   // 育休の計算（社会保険料の免除額）と同じ率
  // こども家庭庁の被用者保険の年収別試算: 年収 × 0.23% ÷ 12 × 1/2 を円未満切り上げにすると国の表と一致する
  for (const [man, yen] of V.MODEL8.hiyosha) {
    assert.equal(Math.ceil(man * 10000 * 0.0023 / 12 / 2 - 1e-9), yen, man + '万円');
  }
  // 見込みの表は 3 年度分
  for (const r of V.MIKOMI.rows) assert.equal(r.v.length, V.MIKOMI.years.length);
  for (const s of V.SOURCES) assert.match(s.url, /^https:\/\//, s.key);
});

test('書き出し・読み込み', () => {
  const f = C.toExportFile({ kind: 'ninkei', amount: '280000' });
  assert.equal(f.tool, 'seido-keisan-shienkin');
  const back = C.fromExportFile(JSON.parse(JSON.stringify(f)));
  assert.equal(back.ok, true);
  assert.deepEqual(back.data, { kind: 'ninkei', mode: 'salary', amount: 280000, bonus: 0 });
  assert.equal(C.fromExportFile({ tool: 'other' }).ok, false);
});

test('使い方ページの早見表が計算と同じ', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'shienkin', 'guide.html'), 'utf8');
  const rows = [...html.matchAll(/<tr data-salary="(\d+)"><th scope="row">[^<]+<\/th><td>([\d,]+)円<\/td><td>([\d,.]+)円<\/td><td>([\d,]+)円<\/td><\/tr>/g)];
  assert.ok(rows.length >= 8, '早見表の行 ' + rows.length);
  for (const m of rows) {
    const r = C.calc({ amount: Number(m[1]) });
    assert.equal(m[2], r.hyojun.toLocaleString('ja-JP'), m[1]);
    assert.equal(m[3], C.yenAuto(r.selfSen).replace('円', ''), m[1]);
    assert.equal(m[4], Math.round(r.yearSen / 100).toLocaleString('ja-JP'), m[1]);
  }
});

test('年末調整の社会保険料の欄から支援金のページへのリンク', () => {
  const nen = fs.readFileSync(path.join(__dirname, '..', 'nenmatsu', 'index.html'), 'utf8');
  assert.match(nen, /<a href="\.\.\/shienkin\/">子ども・子育て支援金<\/a>/);
});

test('使い方ページの国保・後期高齢者医療の表が値の表（国の試算）と同じ', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'shienkin', 'guide.html'), 'utf8');
  const rows = [...html.matchAll(/<tr><th scope="row">(\d+)万円<\/th><td>([\d,]+円|—)<\/td><td>([\d,]+円|—)<\/td><\/tr>/g)];
  const cell = (list, man) => { const r = list.find(x => x[0] === man); return r ? r[1].toLocaleString('ja-JP') + '円' : '—'; };
  const mans = new Set([...V.MODEL8.kokuho.rows, ...V.MODEL8.kouki.rows].map(r => r[0]));
  assert.equal(rows.length, mans.size);
  for (const m of rows) {
    assert.equal(m[2], cell(V.MODEL8.kokuho.rows, Number(m[1])), '国保 ' + m[1]);
    assert.equal(m[3], cell(V.MODEL8.kouki.rows, Number(m[1])), '後期 ' + m[1]);
  }
});
