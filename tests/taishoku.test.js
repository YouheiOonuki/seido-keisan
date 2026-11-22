// 退職金の税金（所得税の側）と、所得税の速算表の正本のテスト: node --test tests/*.test.js
// 期待値は国税庁 タックスアンサー No.1420・No.2732・No.2260（令和8年4月1日現在法令等。2026-11-22 に原文で確かめた）の式と例から。
// 企画書 114 の 8 章の 9 行は、原文の式で出した値と同じだった（違う行は無い）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../lib/sokusan.js');
const V = require('../lib/taishoku-values.js');
const T = require('../lib/taishoku.js');

// --- 速算表の正本（No.2260）---
test('速算表は No.2260 の 7 段のまま', () => {
  assert.deepEqual(S.TABLE, [
    [1949000, 5, 0], [3299000, 10, 97500], [6949000, 20, 427500], [8999000, 23, 636000],
    [17999000, 33, 1536000], [39999000, 40, 2796000], [Infinity, 45, 4796000],
  ]);
  assert.equal(S.SOURCE.url, 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm');
  assert.match(S.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
});

test('No.2260 の例: 7,000,000円 → 974,000円', () => {
  assert.equal(S.tax(7000000), 974000);
});

test('段の境目の前後と、1,000円未満の切り捨て', () => {
  assert.equal(S.tax(0), 0);
  assert.equal(S.tax(999), 0);
  assert.equal(S.tax(1000), 50);
  assert.equal(S.tax(1949000), 97450);
  assert.equal(S.tax(1949999), 97450);           // 1,000円未満を切り捨ててから段を選ぶ
  assert.equal(S.tax(1950000), 97500);
  assert.equal(S.tax(3299000), 232400);
  assert.equal(S.tax(3300000), 232500);
  assert.equal(S.tax(39999000), 13203600);
  assert.equal(S.tax(40000000), 13204000);
  assert.deepEqual(S.row(1950000), [3299000, 10, 97500]);
});

test('隣り合う段の式は、境目で同じ額になる（表の写し間違いが無い）', () => {
  for (let i = 0; i < S.TABLE.length - 1; i++) {
    const x = S.TABLE[i][0] + 1000;   // 次の段の最初
    const a = x * S.TABLE[i][1] / 100 - S.TABLE[i][2];
    const b = x * S.TABLE[i + 1][1] / 100 - S.TABLE[i + 1][2];
    assert.equal(a, b, `段 ${i + 1} と ${i + 2}`);
  }
});

// --- 勤続年数と退職所得控除（No.1420・No.2732）---
test('勤続年数は 1 年未満の端数を切り上げる', () => {
  assert.equal(T.years(10, 2), 11);              // No.1420 の例1
  assert.equal(T.years(30, 0), 30);
  assert.equal(T.years(1, 3), 2);
  assert.equal(T.years(0, 1), 1);
  assert.equal(T.years(5, 0), 5);
  assert.equal(T.years(5, 1), 6);
  assert.equal(T.years(3, 12), null);
  assert.equal(T.years(-1, 0), null);
  assert.equal(T.years(2.5, 0), null);
});

test('退職所得控除: No.1420 の例と、80万円・20 年の境目', () => {
  assert.equal(T.kojo(11), 4400000);             // 例1
  assert.equal(T.kojo(30), 15000000);            // 例2
  assert.equal(T.kojo(1), 800000);
  assert.equal(T.kojo(2), 800000);
  assert.equal(T.kojo(3), 1200000);
  assert.equal(T.kojo(19), 7600000);
  assert.equal(T.kojo(20), 8000000);
  assert.equal(T.kojo(21), 8700000);
  assert.equal(T.kojo(1, true), 1800000);        // 80万円にしてから 100万円を加える
  assert.equal(T.kojo(10, true), 5000000);
});

test('区分: 勤続 5 年以下だけ、役員等かで分かれる', () => {
  assert.equal(T.kubun(5, false), 'tanki');
  assert.equal(T.kubun(5, true), 'tokutei');
  assert.equal(T.kubun(6, false), 'ippan');
  assert.equal(T.kubun(6, true), 'ippan');
});

// --- 原文の例（No.2732）---
test('No.2732 の例1: 800万円・勤続 10 年 2 か月 → 91,890円', () => {
  const r = T.calc({ amount: 8000000, years: 10, months: 2 });
  assert.equal(r.now.years, 11);
  assert.equal(r.now.kojo, 4400000);
  assert.equal(r.now.kazei, 1800000);
  assert.equal(r.now.gensen, 91890);
});

test('No.2732 の例2: 2,300万円・勤続 29 年 2 か月 → 380,322円', () => {
  const r = T.calc({ amount: 23000000, years: 29, months: 2 });
  assert.equal(r.now.years, 30);
  assert.equal(r.now.kojo, 15000000);
  assert.equal(r.now.kazei, 4000000);
  assert.equal(r.now.shotokuzei, 372500);
  assert.equal(r.now.gensen, 380322);             // 380,322.5円の 1円未満を切り捨て
});

test('No.2732・No.1420: 申告書を出していない時は 800万円 × 20.42% = 1,633,600円', () => {
  assert.equal(T.noShinkoku(8000000), 1633600);
  assert.equal(T.calc({ amount: 8000000, years: 10, months: 2 }).now.noShinkoku, 1633600);
  assert.equal(T.noShinkoku(291478), 59519);      // 1円未満の切り捨て（dattai-values.js の記載例②と同じ向き）
});

// --- 企画書 114 の 8 章の 9 行 ---
const ROWS = [
  { name: '勤続 30 年・2,500 万円', in: { amount: 25000000, years: 30 }, kojo: 15000000, kazei: 5000000, tax: 572500, gensen: 584522 },
  { name: '勤続 10 年・300 万円', in: { amount: 3000000, years: 10 }, kojo: 4000000, kazei: 0, tax: 0, gensen: 0 },
  { name: '勤続 1 年 3 か月・50 万円', in: { amount: 500000, years: 1, months: 3 }, kojo: 800000, kazei: 0, tax: 0, gensen: 0 },
  { name: '勤続 20 年・800 万円', in: { amount: 8000000, years: 20 }, kojo: 8000000, kazei: 0, tax: 0, gensen: 0 },
  { name: '勤続 21 年・1,000 万円', in: { amount: 10000000, years: 21 }, kojo: 8700000, kazei: 650000, tax: 32500, gensen: 33182 },
  { name: '勤続 4 年・役員等でない・1,000 万円', in: { amount: 10000000, years: 4 }, kojo: 1600000, kazei: 6900000, tax: 952500, gensen: 972502 },
  { name: '勤続 3 年・役員等・1,000 万円', in: { amount: 10000000, years: 3, yakuin: true }, kojo: 1200000, kazei: 8800000, tax: 1388000, gensen: 1417148 },
  { name: '勤続 10 年・障害が元・600 万円', in: { amount: 6000000, years: 10, shogai: true }, kojo: 5000000, kazei: 500000, tax: 25000, gensen: 25525 },
];
for (const row of ROWS) {
  test(`企画書 114 の 8 章: ${row.name}`, () => {
    const r = T.calc(row.in);
    assert.equal(r.ready, true);
    assert.equal(r.now.kojo, row.kojo);
    assert.equal(r.now.kazei, row.kazei);
    assert.equal(r.now.shotokuzei, row.tax);
    assert.equal(r.now.gensen, row.gensen);
    // 住民税が出ない行（短期で 300万円を超える）は手取りも出さない
    assert.equal(r.now.tedori, r.now.jumin ? row.in.amount - row.gensen - r.now.jumin.total : null);
  });
}
test('企画書 114 の 8 章: 申告書なし・800 万円 → 1,633,600円', () => {
  assert.equal(T.calc({ amount: 8000000, years: 20 }).now.noShinkoku, 1633600);
});

// --- 境目の前後 ---
test('20 年の境目: 19・20・21 年で控除が 760万・800万・870万円', () => {
  const k = [19, 20, 21].map((y) => T.calc({ amount: 10000000, years: y }).now.kojo);
  assert.deepEqual(k, [7600000, 8000000, 8700000]);
  const r = T.calc({ amount: 10000000, years: 20 });
  assert.equal(r.shorter.kojo, 7600000);
  assert.equal(r.longer.kojo, 8700000);
});

test('5 年の境目: 5 年は短期、6 年は一般（収入 − 控除 が 300万円を越える額で差が出る）', () => {
  const five = T.calc({ amount: 10000000, years: 5 });      // 控除 200万円・差 800万円
  assert.equal(five.now.kubun, 'tanki');
  assert.equal(five.now.kazei, 1500000 + (10000000 - (3000000 + 2000000)));   // 6,500,000
  const six = T.calc({ amount: 10000000, years: 6 });       // 控除 240万円・差 760万円
  assert.equal(six.now.kubun, 'ippan');
  assert.equal(six.now.kazei, 3800000);
  assert.equal(five.longer.kubun, 'ippan');
  assert.equal(five.longer.kazei, six.now.kazei);
  assert.equal(six.shorter.kubun, 'tanki');
  assert.equal(six.shorter.kazei, five.now.kazei);
});

test('役員等の印は、勤続が 5 年を越えると効かない', () => {
  const a = T.calc({ amount: 10000000, years: 6, yakuin: true });
  const b = T.calc({ amount: 10000000, years: 6, yakuin: false });
  assert.deepEqual(a.now, b.now);
  assert.equal(a.shorter.kubun, 'tokutei');       // 1 年短い時は 5 年で、役員等の印が効く
});

test('300万円の境目（短期）: 差がちょうど 300万円と、1,000円越えた時', () => {
  // 勤続 5 年: 控除 200万円
  assert.equal(T.calc({ amount: 5000000, years: 5 }).now.shotoku, 1500000);       // 差 300万円 × 1/2
  assert.equal(T.calc({ amount: 5001000, years: 5 }).now.shotoku, 1501000);       // 150万円 ＋ 1,000円（1/2 にしない）
  assert.equal(T.calc({ amount: 5001000, years: 6 }).now.shotoku, 1300500);       // 一般なら（501万円 − 240万円）× 1/2
  assert.equal(T.calc({ amount: 4999000, years: 5 }).now.shotoku, 1499500);
  assert.equal(T.calc({ amount: 4999000, years: 5 }).now.kazei, 1499000);
});

test('1 年短い時: 勤続 1 年は null、2 年 → 1 年', () => {
  assert.equal(T.calc({ amount: 1000000, years: 1 }).shorter, null);
  assert.equal(T.calc({ amount: 1000000, years: 0, months: 6 }).shorter, null);
  assert.equal(T.calc({ amount: 1000000, years: 1, months: 3 }).shorter.years, 1);
});

test('帯の内訳は、足すと退職金の額', () => {
  for (const row of ROWS) {
    const r = T.calc(row.in);
    const b = r.now.band;
    assert.equal(b.kojo + b.half + b.tax + b.rest, row.in.amount, row.name);
    assert.ok(b.rest >= 0, row.name);
  }
  const b = T.calc({ amount: 25000000, years: 30 }).now.band;
  assert.deepEqual(b, { kojo: 15000000, half: 5000000, tax: 584522 + 500000, rest: 3915478, jumin: true });
  const t = T.calc({ amount: 10000000, years: 4 }).now.band;           // 短期: 1/2 で消えるのは 150万円だけ
  assert.equal(t.half, 1500000);
  const k = T.calc({ amount: 10000000, years: 3, yakuin: true }).now.band;   // 特定役員: 1/2 で消える分は 0
  assert.equal(k.half, 0);
});

// --- 住民税（総務省 65871.html: 退職所得の金額 × 6%・4%、退職所得の金額は 1,000円未満・税額は各 100円未満を切り捨て） ---
test('住民税: 勤続 30 年・2,500 万円 → 退職所得の金額 500万円、市町村民税 300,000円・道府県民税 200,000円', () => {
  const r = T.calc({ amount: 25000000, years: 30 }).now;
  assert.deepEqual(r.jumin, { kazei: 5000000, shi: 300000, ken: 200000, total: 500000 });
  assert.equal(r.tedori, 25000000 - 584522 - 500000);
});

test('住民税: 1,000円未満と 100円未満の切り捨て（651,750 → 651,000、39,060 → 39,000、26,040 → 26,000）', () => {
  const r = T.calc({ amount: 10003500, years: 21 }).now;   // 控除 870万円、差 1,303,500 × 1/2 = 651,750
  assert.deepEqual(r.jumin, { kazei: 651000, shi: 39000, ken: 26000, total: 65000 });
});

test('住民税: 勤続 5 年以内の役員等は 1/2 にしない（勤続 3 年・1,000 万円 → 880万円 × 6%・4%）', () => {
  const r = T.calc({ amount: 10000000, years: 3, yakuin: true }).now;
  assert.deepEqual(r.jumin, { kazei: 8800000, shi: 528000, ken: 352000, total: 880000 });
});

test('住民税: 短期で 収入 − 控除 が 300万円以下は 1/2、300万円を超えると出さない（総務省のページに式が無い）', () => {
  const a = T.calc({ amount: 5000000, years: 5 }).now;     // 差 300万円
  assert.deepEqual(a.jumin, { kazei: 1500000, shi: 90000, ken: 60000, total: 150000 });
  const b = T.calc({ amount: 5001000, years: 5 }).now;     // 差 300万1,000円
  assert.equal(b.jumin, null);
  assert.equal(b.tedori, null);
  assert.equal(b.band.jumin, false);
  assert.equal(b.band.tax, b.gensen);
  assert.equal(b.band.kojo + b.band.half + b.band.tax + b.band.rest, 5001000);
  assert.ok(T.calc({ amount: 5001000, years: 6 }).now.jumin);   // 6 年なら一般で出る
});

test('住民税: 控除の内なら 0円', () => {
  assert.deepEqual(T.calc({ amount: 3000000, years: 10 }).now.jumin, { kazei: 0, shi: 0, ken: 0, total: 0 });
});

test('読めない入力は ready: false', () => {
  assert.equal(T.calc({}).ready, false);
  assert.equal(T.calc({ amount: -1, years: 10 }).ready, false);
  assert.equal(T.calc({ amount: 1000000, years: 0, months: 0 }).ready, false);
  assert.equal(T.calc({ amount: 1000000.5, years: 10 }).ready, false);
  assert.equal(T.calc({ amount: 1000000, years: 10, months: 12 }).ready, false);
});

test('値のファイルに出典と確認日がある', () => {
  assert.match(V.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  const urls = V.SOURCES.map((s) => s.url);
  assert.ok(urls.includes('https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1420.htm'));
  assert.ok(urls.includes('https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2732.htm'));
  assert.ok(urls.includes('https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/65871.html'));
  assert.deepEqual(V.jumin, { shi: 6, ken: 4, unit: 1000, taxUnit: 100 });
});

test('新しい 3 つのファイルは外へ送らない（fetch・XMLHttpRequest・sendBeacon が 0）', () => {
  for (const f of ['sokusan.js', 'taishoku-values.js', 'taishoku.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', f), 'utf8');
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|localStorage/, f);
  }
});
