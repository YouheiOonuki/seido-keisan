// ACCEPTANCE 2 章の検算表（REVIEW C7 R6）を、そのまま自動テストにしたもの: node --test tests/*.test.js
// 期待値は yorozu-plans の docs/ACCEPTANCE.md（Fable が一次資料から独立に起こした表、2026-10-01）から写した。
// コードに合わせて期待値を変えない。合わないときは一次資料で確かめ、コードの誤りならコードを直す。
// 表のほうが違うと考えるときは todo にして理由と出典を書く（決めるのは Fable）。
// テスト名の「ACCEPTANCE 2.x 行 N」は、その節の表の上から N 行目（表が複数ある節は表の名前を添える）。
// 2.3 の行 6〜10 は、表の下の本文の値（標準報酬月額・賞与・国保と後期・見込み）を表の続きとして数えた。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ===========================
// 2.1 高額療養費（kogaku-ryoyohi）
// ===========================
const K = require('../lib/kogaku.js');

// コードの区分の「健保（標準報酬月額）」の文 → [下限, 上限]（万円。上限なしは Infinity）
function kenpoRange(s) {
  let m;
  if ((m = /^(\d+)万円以上$/.exec(s))) return [Number(m[1]), Infinity];
  if ((m = /^(\d+)万〜(\d+)万円$/.exec(s))) return [Number(m[1]), Number(m[2])];
  if ((m = /^(\d+)万円以下$/.exec(s))) return [0, Number(m[1])];
  return null;
}
// ACCEPTANCE の区分（標準報酬月額の範囲）に当たるコードの区分を 1 つだけ探す
function catByRange(periodId, lo, hi) {
  const p = K.periodById(periodId);
  const hits = p.cats.filter((c) => { const r = kenpoRange(c.kenpo); return r && r[0] === lo && r[1] === hi; });
  assert.equal(hits.length, 1, periodId + ' に標準報酬月額 ' + lo + '〜' + hi + '万円の区分が 1 つだけある');
  return hits[0];
}
// 標準報酬月額（万円）→ コードの区分（70歳未満・課税）
function catByHyojun(periodId, man) {
  const p = K.periodById(periodId);
  const hits = p.cats.filter((c) => { const r = kenpoRange(c.kenpo); return r && man >= r[0] && man <= r[1]; });
  assert.equal(hits.length, 1, periodId + ' で標準報酬月額 ' + man + '万円の区分が 1 つに決まる');
  return hits[0];
}
const hikazei = (periodId) => K.catById(K.periodById(periodId), 'o');

// --- 令和8年8月〜令和9年7月（70歳未満）の表 ---
// [標準報酬月額の範囲（万円）, 定額, 基準額（定額だけは 0）, 多数回, 年間上限, 〜約200万円の年間上限]
const R8_TABLE = [
  ['83万円以上', [83, Infinity], 270300, 901000, 140100, 1680000],
  ['53〜79万円', [53, 79], 179100, 597000, 93000, 1110000],
  ['28〜50万円', [28, 50], 85800, 286000, 44400, 530000],
  ['26万円以下', [0, 26], 61500, 0, 44400, 530000, 410000],
  ['住民税非課税', null, 36900, 0, 24600, 290000],
];
R8_TABLE.forEach(([label, range, base, thr, many, year, year200], i) => {
  test(`ACCEPTANCE 2.1 行 ${i + 1}（令和8年8月〜の表）: ${label} → ${base.toLocaleString()}${thr ? '＋(医療費−' + thr.toLocaleString() + ')×1%' : ''}〈${many.toLocaleString()}〉年 ${year.toLocaleString()}`, () => {
    const c = range ? catByRange('r8', range[0], range[1]) : hikazei('r8');
    assert.equal(c.u70.base, base);
    assert.equal(c.u70.thr, thr);
    assert.equal(c.u70.many, many);
    assert.equal(c.year, year);
    if (year200) assert.equal(c.year200, year200);
  });
});

// --- 令和9年8月〜（70歳未満。区分の細分化）の表 ---
const R9_TABLE = [
  ['127万円以上', [127, Infinity], 342000, 1140000, 140100, 1680000],
  ['103〜121万円', [103, 121], 303000, 1010000, 140100, 1680000],
  ['83〜98万円', [83, 98], 270300, 901000, 140100, 1680000],
  ['71〜79万円', [71, 79], 209400, 698000, 93000, 1110000],
  ['62〜68万円', [62, 68], 194400, 648000, 93000, 1110000],
  ['53〜59万円', [53, 59], 179100, 597000, 93000, 1110000],
  ['44〜50万円', [44, 50], 110400, 368000, 44400, 530000],
  ['36〜41万円', [36, 41], 98100, 327000, 44400, 530000],
  ['28〜34万円', [28, 34], 85800, 286000, 44400, 530000],
  ['20〜26万円', [20, 26], 69600, 0, 44400, 530000],
  ['16〜19万円', [16, 19], 65400, 0, 44400, 530000],
  ['15万円以下', [0, 15], 61500, 0, 34500, 410000],
  ['住民税非課税', null, 36900, 0, 24600, 290000],
];
// ACCEPTANCE は 71〜79・62〜68・44〜50・36〜41・20〜26・16〜19 万円の行の多数回と年間上限を、
// 同じ帯（〈 〉と「年」が書いてある行）にまとめて書いている。上の表はそれを各行に展開した
R9_TABLE.forEach(([label, range, base, thr, many, year], i) => {
  test(`ACCEPTANCE 2.1 行 ${i + 1}（令和9年8月〜の表）: ${label} → ${base.toLocaleString()}${thr ? '＋(医療費−' + thr.toLocaleString() + ')×1%' : ''}〈${many.toLocaleString()}〉年 ${year.toLocaleString()}`, () => {
    const c = range ? catByRange('r9', range[0], range[1]) : hikazei('r9');
    assert.equal(c.u70.base, base);
    assert.equal(c.u70.thr, thr);
    assert.equal(c.u70.many, many);
    assert.equal(c.year, year);
  });
});

// --- 70歳以上の外来（個人ごと） ---
const gairaiCats = (periodId, ids) => ids.map((id) => K.catById(K.periodById(periodId), id));
test('ACCEPTANCE 2.1 行 1（70歳以上の外来）: 一般 令和8年8月〜 22,000（年 216,000）', () => {
  const c = K.catById(K.periodById('r8'), 'e');
  assert.equal(c.gairai, 22000);
  assert.equal(c.gairaiYear, 216000);
});
test('ACCEPTANCE 2.1 行 2（70歳以上の外来）: 一般 令和9年8月〜 28,000（年 216,000）— 年収約200万〜約370万円（標準報酬月額16〜26万円）', () => {
  gairaiCats('r9', ['e1', 'e2']).forEach((c) => {
    assert.equal(c.gairai, 28000, c.name);
    assert.equal(c.gairaiYear, 216000, c.name);
  });
});
test('ACCEPTANCE 2.1 行 2（70歳以上の外来）: 一般 令和9年8月〜 28,000 — 年収〜約200万円（標準報酬月額15万円以下）', {
  todo: 'ACCEPTANCE の「一般（〜約370万円）は令和9年8月〜 28,000」は、年収〜約200万円の区分では一次資料と違う。'
    + '厚生労働省「高額療養費制度の見直しについて（令和８年８月診療分から）」https://www.mhlw.go.jp/content/001726232.pdf の'
    + ' 5ページ（70歳以上・令和9年8月〜）と 6ページの比較表で「～約200万円（標報：～15万円）」の外来特例は 22,000（年21.6万）、'
    + '28,000 は 約200〜約370万円（標報 16〜26万円）だけ（2026-10-01 に PDF 本文で確認）。コードは 22,000。Fable の判断待ち',
}, () => {
  const c = K.catById(K.periodById('r9'), 'e3');
  assert.equal(c.gairai, 28000);
  assert.equal(c.gairaiYear, 216000);
});
test('ACCEPTANCE 2.1 行 3（70歳以上の外来）: 住民税非課税 令和8年8月〜 11,000 → 令和9年8月〜 13,000（年 96,000）', () => {
  const r8 = K.catById(K.periodById('r8'), 'o'), r9 = K.catById(K.periodById('r9'), 'o');
  assert.equal(r8.gairai, 11000);
  assert.equal(r9.gairai, 13000);
  assert.equal(r8.gairaiYear, 96000);
  assert.equal(r9.gairaiYear, 96000);
});
test('ACCEPTANCE 2.1 行 4（70歳以上の外来）: 一定所得以下は 8,000（据え置き）', () => {
  ['r7', 'r8', 'r9'].forEach((pid) => assert.equal(K.catById(K.periodById(pid), 'o1').gairai, 8000, pid));
});
test('ACCEPTANCE 2.1 行 5（70歳以上の外来）: 世帯の上限は 70歳未満と同じ式（現役並み・一般の区分）', () => {
  ['r8', 'r9'].forEach((pid) => {
    K.periodById(pid).cats.filter((c) => c.id !== 'o' && c.id !== 'o1').forEach((c) => {
      assert.deepEqual(c.o70, c.u70, pid + ' ' + c.name);
    });
  });
});
test('ACCEPTANCE 2.1 行 5（70歳以上の外来）: 世帯の上限は 70歳未満と同じ式 — 住民税非課税の区分', {
  todo: '一次資料では 70歳以上の住民税非課税の世帯の上限は 70歳未満（36,900）と違う。'
    + '厚生労働省 https://www.mhlw.go.jp/content/001726232.pdf の 4・5ページ（70歳以上の表）と 6ページ「非課税【70歳以上】」で'
    + ' 令和8年8月〜・令和9年8月〜とも 25,700〈24,600〉、一定所得以下 15,700（2026-10-01 に PDF 本文で確認）。'
    + 'ACCEPTANCE の「世帯の上限は70歳未満と同じ式」は現役並み・一般の区分だけに当てはまると読むのが一次資料に合う。コードは 25,700・15,700。Fable の判断待ち',
}, () => {
  ['r8', 'r9'].forEach((pid) => {
    const c = K.catById(K.periodById(pid), 'o');
    assert.deepEqual(c.o70, c.u70, pid);
  });
});

// --- 検算（医療費 1,000,000 円・窓口 3 割 300,000 円・70 歳未満・1〜3 回目） ---
const KENSAN = [
  // [時期, 標準報酬月額（万円）, 医療費, 上限額, 払い戻し]
  ['r8', 30, 1000000, 92940, 207060],
  ['r8', 60, 1000000, 183130, 116870],
  ['r8', 100, 1000000, 271290, 28710],
  ['r9', 40, 1000000, 104830, 195170],
  ['r9', 65, 1000000, 197920, 102080],
  ['r9', 110, 1000000, 303000, 0],
  ['r9', 110, 2000000, 312900, 287100],
];
KENSAN.forEach(([pid, man, cost, limit, refund], i) => {
  const when = pid === 'r8' ? '令和8年8月〜' : '令和9年8月〜';
  test(`ACCEPTANCE 2.1 行 ${i + 1}（検算）: ${when}・標準報酬月額 ${man}万円・医療費 ${cost.toLocaleString()} → 上限 ${limit.toLocaleString()}・払い戻し ${refund.toLocaleString()}`, () => {
    const c = catByHyojun(pid, man);
    const r = K.calc({ period: pid, cat: c.id, rows: [{ cost, age: 'u70', place: 'in', rate: 0.3 }] });
    assert.equal(r.ready, true);
    assert.equal(r.paid, cost * 3 / 10);   // 窓口 3 割
    assert.equal(r.limit, limit);
    assert.equal(r.refund, refund);
    assert.ok(r.refund >= 0, '負の値を出さない');
    assert.equal(r.self, Math.min(r.paid, limit));
    assert.equal(K.limitFor(pid, c.id, 'u70', cost, false), limit);
  });
});

// ===========================
// 2.2 年金の繰上げ・繰下げ（nenkin-kuriage）
// ===========================
const N = require('../lib/kuriage.js');

const KURIAGE_PCT = [
  // [年齢, 0.4%, 0.5%]
  [60, 24.0, 30.0], [61, 19.2, 24.0], [62, 14.4, 18.0], [63, 9.6, 12.0], [64, 4.8, 6.0],
];
test('ACCEPTANCE 2.2 行 1（率）: 繰上げは 60歳〜65歳になるまで。1か月 0.4%（1962-04-02 以降生まれ）・0.5%（1962-04-01 以前生まれ）、早見の率', () => {
  assert.equal(N.kuriageRate('1962-04-02'), 0.004);
  assert.equal(N.kuriageRate('1962-04-01'), 0.005);
  KURIAGE_PCT.forEach(([age, p4, p5]) => {
    assert.equal(N.calc({ birth: '1962-04-02', kiso: 1200000, age, mon: 0 }).pct1, -p4, age + '歳 0.4%');
    assert.equal(N.calc({ birth: '1962-04-01', kiso: 1200000, age, mon: 0 }).pct1, -p5, age + '歳 0.5%');
  });
  // 60歳より前は選べない（60歳 0か月に止まる）
  const r = N.calc({ birth: '1962-04-02', kiso: 1200000, age: 59, mon: 0 });
  assert.equal(r.pct1, -24.0);
});
const KURISAGE_PCT = [[66, 8.4], [67, 16.8], [68, 25.2], [69, 33.6], [70, 42.0], [71, 50.4], [72, 58.8], [73, 67.2], [74, 75.6], [75, 84.0]];
test('ACCEPTANCE 2.2 行 2（率）: 繰下げは 66歳以後 75歳まで（1952-04-01 以前生まれは 70歳まで）。1か月 0.7%、早見の率', () => {
  KURISAGE_PCT.forEach(([age, pct]) => {
    assert.equal(N.calc({ birth: '1962-04-02', kiso: 1200000, age, mon: 0 }).pct1, pct, age + '歳');
  });
  assert.equal(N.kurisageMax('1952-04-02'), 120);
  assert.equal(N.kurisageMax('1952-04-01'), 60);
});

// 検算（65歳時の月額 100,000 円を基準）
const KURI_KENSAN = [
  // [受給開始の年齢, 生年月日, 月額]
  [60, '1962-04-02', 76000, '1962-04-02 以降'],
  [60, '1962-04-01', 70000, '1962-04-01 以前'],
  [62, '1962-04-02', 85600, '1962-04-02 以降'],
  [64, '1962-04-02', 95200, '1962-04-02 以降'],
  [66, '1962-04-02', 108400, '—'],
  [70, '1962-04-02', 142000, '—'],
  [75, '1952-04-02', 184000, '1952-04-02 以降'],
  [75, '1952-04-01', 142000, '1952-04-01 以前（70歳で頭打ち）'],
];
KURI_KENSAN.forEach(([age, birth, monthly, note], i) => {
  test(`ACCEPTANCE 2.2 行 ${i + 1}（検算）: ${age}歳 0か月・${note} → 月額 ${monthly.toLocaleString()}`, () => {
    // 65歳時の月額 100,000 円＝年額 1,200,000 円（基礎年金だけ／基礎と厚生に分けたときの両方で）
    const a = N.calc({ birth, kiso: 1200000, age, mon: 0 });
    assert.equal(a.ready, true);
    assert.equal(a.baseTotal / 12, 100000);
    assert.equal(a.total / 12, monthly);
    const b = N.calc({ birth, kiso: 780000, kosei: 420000, age, mon: 0 });
    assert.equal(b.total / 12, monthly);
  });
});

// ===========================
// 2.3 子ども・子育て支援金（shienkin）
// ===========================
const S = require('../lib/shienkin.js');
const SV = require('../lib/shienkin-values.js');

const SHIENKIN_NENSHU = [[200, 192], [400, 384], [600, 575], [800, 767], [1000, 959]];
SHIENKIN_NENSHU.forEach(([man, yen], i) => {
  test(`ACCEPTANCE 2.3 行 ${i + 1}: 被用者保険 年収 ${man.toLocaleString()}万円 → 月額 ${yen.toLocaleString()} 円（公式）`, () => {
    // 画面に出す国の表の値
    const row = SV.MODEL8.hiyosha.find((x) => x[0] === man);
    assert.ok(row, '年収 ' + man + '万円の行がある');
    assert.equal(row[1], yen);
    // 年収 × 0.23% ÷ 12 × 1/2。公式の表は 1 円未満を切り上げた値（400万円 383.33… → 384、1,000万円 958.33… → 959）
    const ratePermyriad = Math.round(SV.rate * 100);   // 0.23% → 23（万分率。浮動小数の誤差を避ける）
    assert.equal(ratePermyriad, 23);
    assert.equal(Math.ceil(man * 10000 * ratePermyriad / (10000 * 12 * 2)), yen);
  });
});
[[300000, 345], [500000, 575]].forEach(([hyojun, yen], i) => {
  test(`ACCEPTANCE 2.3 行 ${6 + i}（標準報酬月額）: 標報 ${hyojun.toLocaleString()} 円 × 0.23% × 1/2 → 月額 ${yen} 円`, () => {
    const r = S.calc({ kind: 'kaisha', mode: 'hyojun', amount: hyojun });
    assert.equal(r.ready, true);
    assert.equal(r.hyojun, hyojun);
    assert.equal(r.selfSen, yen * 100);
    assert.equal(r.deductYen, yen);
    assert.equal(r.employerSen, yen * 100);   // 事業主が同額
  });
});
test('ACCEPTANCE 2.3 行 8（賞与）: 標準賞与額に同じ率（50万円 → 575 円）', () => {
  const r = S.calc({ kind: 'kaisha', mode: 'hyojun', amount: 300000, bonus: 500000 });
  assert.equal(r.bonusSelfSen, 57500);
});
test('ACCEPTANCE 2.3 行 9（国保・後期は目安）: 国保 年収200万円 400 円・300万円 650 円、後期 単身・年金200万円 200 円。「目安」と明記', () => {
  const kokuho = new Map(SV.MODEL8.kokuho.rows), kouki = new Map(SV.MODEL8.kouki.rows);
  assert.equal(kokuho.get(200), 400);
  assert.equal(kokuho.get(300), 650);
  assert.equal(kouki.get(200), 200);
  const r = S.calc({ kind: 'kokuho' });
  assert.equal(r.municipal, true);   // 1 円単位の計算はしない（モデル試算を出すだけ）
  const html = fs.readFileSync(path.join(__dirname, '..', 'shienkin', 'index.html'), 'utf8');
  assert.match(html, /目安/);
  const app = fs.readFileSync(path.join(__dirname, '..', 'shienkin', 'app.js'), 'utf8');
  assert.match(app, /モデル試算.*条例で決まります/);
});
test('ACCEPTANCE 2.3 行 10（参考）: 令和9・10年度の見込み 全制度平均 350 円・450 円', () => {
  const avg = SV.MIKOMI.rows.find((x) => /全制度平均/.test(x.label));
  assert.deepEqual(avg.v.slice(1), [350, 450]);
});

// ===========================
// 2.4 2割特例の終了後の消費税（invoice）
// ===========================
const I = require('../lib/invoice.js');

// 課税売上 7,000,000 円（税抜）・税率 10% → 入力は税込 7,700,000 円
const UR = 7700000;
const inv = (year, extra) => I.calc(Object.assign({ year, uriage: UR }, extra || {}));
test('ACCEPTANCE 2.4 前提: 課税売上 7,000,000 円（税抜）・税率 10%・売上税額 700,000 円（国 546,000 ＋ 地方 154,000）', () => {
  const r = inv(2027);
  assert.equal(r.base.zeinuki, 7000000);
  assert.equal(r.base.uriageTax, 546000);
  assert.equal(r.base.uriageTax + r.base.uriageTax * 22 / 78, 700000);
});
test('ACCEPTANCE 2.4 行 1: 2割特例（令和8年分まで） → 140,000', () => {
  assert.equal(inv(2027).methods.niwari.r.total, 140000);
});
test('ACCEPTANCE 2.4 行 2: 3割特例（令和9・10年分、個人） → 210,000', () => {
  [2027, 2028].forEach((y) => {
    const m = inv(y).methods.sanwari;
    assert.equal(m.available, true, y + '年分は使える');
    assert.equal(m.r.total, 210000, String(y));
  });
  assert.equal(inv(2029).methods.sanwari.available, false);
});
test('ACCEPTANCE 2.4 行 3: 簡易課税 第5種（みなし仕入率 50%） → 350,000', () => {
  assert.equal(inv(2027, { kubun: 5 }).methods.kani.r.total, 350000);
});
test('ACCEPTANCE 2.4 行 4: 簡易課税 第1種（90%） → 70,000', () => {
  assert.equal(inv(2027, { kubun: 1 }).methods.kani.r.total, 70000);
});
test('ACCEPTANCE 2.4 行 5: 本則（課税仕入 3,000,000 円・税額 300,000 円、すべてインボイスあり） → 400,000', () => {
  assert.equal(inv(2027, { shiire: 3300000, noinv: 0 }).methods.honsoku.r.total, 400000);
});
// 行 6: 課税仕入 3,000,000 円（税抜）のうち 300,000 円（税額 30,000 円）がインボイスなし
//   → インボイスあり 2,700,000 円（税込 2,970,000 円）、なし 300,000 円（税込 330,000 円）
test('ACCEPTANCE 2.4 行 6: 本則（うち 300,000 円・税額 30,000 円がインボイスなし、2026-10〜2028-09 の 70%） → 409,000', {
  todo: 'ACCEPTANCE の 409,000 は 700,000 −（270,000 ＋ 30,000 × 70%）を 10% のまま一度に引いた値。'
    + '申告の計算は国（7.8%）と地方（国の差引税額 × 22/78）を分け、それぞれ 100円未満を切り捨てる'
    + '（国税通則法 119条1項、地方税法 20条の4の2 第3項・72条の83。国税庁「２割特例用 確定申告の手引き」'
    + ' https://www.nta.go.jp/publication/pamph/pdf/0023008-043.pdf の申告書の書き方「「⑪欄」ー「付表６の⑥欄」ー「⑰欄」にて計算します（百円未満切捨て）」と、地方消費税は差引税額の欄 × 22/78）。'
    + 'このとき 国 546,000 − (210,600 ＋ 16,380) ＝ 319,020 → 319,000、地方 319,000 × 22/78 ＝ 89,974.3 → 89,900、計 408,900。'
    + '行 1〜5・7 は国の差引税額が 100円単位で割り切れるので一致する。期待値を 408,900 にするか、設例の仕入れ額を変えるかは Fable の判断待ち',
}, () => {
  assert.equal(inv(2027, { shiire: 2970000, noinv: 330000 }).methods.honsoku.r.total, 409000);
});
test('ACCEPTANCE 2.4 行 6（参考・法令どおりの端数処理の値）: 国 319,000 ＋ 地方 89,900 ＝ 408,900', () => {
  const r = inv(2027, { shiire: 2970000, noinv: 330000 }).methods.honsoku;
  assert.deepEqual(r.noinvPct, [70]);
  assert.equal(r.kojo, 210600 + 16380);
  assert.deepEqual([r.r.koku, r.r.chiho, r.r.total], [319000, 89900, 408900]);
});
test('ACCEPTANCE 2.4 行 7: 同、2028-10〜2030-09 の 50% → 415,000', () => {
  // 令和11年分（2029年 1〜12月）は全部が 50% の期間
  const r = inv(2029, { shiire: 2970000, noinv: 330000 }).methods.honsoku;
  assert.deepEqual(r.noinvPct, [50]);
  assert.equal(r.r.total, 415000);
});
test('ACCEPTANCE 2.4 届出の期限: 「2割特例か3割特例で申告した課税期間の翌課税期間は、その翌課税期間の確定申告期限まで」が画面の文にある', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'invoice', 'guide.html'), 'utf8');
  assert.match(html, /2割特例か3割特例で申告した年の翌年分[^。]*その(翌)?年分の確定申告期限まで/);
  assert.equal(I.kaniDeadline(2027).tokurei, '2028-03-31');
});
