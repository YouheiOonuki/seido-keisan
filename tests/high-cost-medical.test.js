// 高額療養費の計算（英語ページ）のテスト: node --test tests/*.test.js
// 1. ACCEPTANCE 2.1 の検算表（医療費 100 万円・3 割・70 歳未満）を英語ページの入口で 1 円まで
// 2. 同じ入力で、日本語の高額療養費の計算（lib/kogaku.js）と同じ額
// 3. 区分の名前が値ファイルの日本語から機械で英語になる（直せない文字列が無い）。値を写していない
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../lib/high-cost-medical.js');
const K = require('../lib/kogaku.js');
const V = require('../lib/kogaku-values.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('ACCEPTANCE 2.1 の検算（70 歳未満・1〜3 回目・3 割・入院）', () => {
  // [表, 区分（標準報酬月額）, 医療費, 上限額, 払い戻し]
  const rows = [
    ['r8', 'u', 1000000, 92940, 207060],   // 30 万円
    ['r8', 'i', 1000000, 183130, 116870],  // 60 万円
    ['r8', 'a', 1000000, 271290, 28710],   // 100 万円
    ['r9', 'u2', 1000000, 104830, 195170], // 40 万円
    ['r9', 'i2', 1000000, 197920, 102080], // 65 万円
    ['r9', 'a2', 1000000, 303000, 0],      // 110 万円（窓口 300,000 が上限未満。負の値を出さない）
    ['r9', 'a2', 2000000, 312900, 287100], // 110 万円・医療費 200 万円
  ];
  for (const [period, cat, cost, limit, refund] of rows) {
    const r = H.calc({ ageplan: 'u70', period, cat, cost, place: 'in' }).k;
    assert.equal(r.limit, limit, period + cat);
    assert.equal(r.refund, refund, period + cat);
  }
});

test('ACCEPTANCE 2.1: 70 歳以上の外来（個人ごと）と世帯', () => {
  // 令和8年8月〜 一般: 外来 22,000、令和9年8月〜 一般（16〜26 万円）28,000、住民税非課税 13,000
  assert.equal(H.calc({ ageplan: 'o70', period: 'r8', cat: 'e', cost: 200000, place: 'out', rate: 0.2 }).k.self, 22000);
  assert.equal(H.calc({ ageplan: 'o70', period: 'r9', cat: 'e1', cost: 200000, place: 'out', rate: 0.2 }).k.self, 28000);
  assert.equal(H.calc({ ageplan: 'kouki', period: 'r9', cat: 'o', cost: 200000, place: 'out', rate: 0.1 }).k.self, 13000);
  // 住民税非課税の世帯（入院）25,700、所得が一定以下 15,700
  assert.equal(H.calc({ ageplan: 'kouki', period: 'r8', cat: 'o', cost: 500000, place: 'in', rate: 0.1 }).k.self, 25700);
  assert.equal(H.calc({ ageplan: 'kouki', period: 'r8', cat: 'o1', cost: 500000, place: 'in', rate: 0.1 }).k.self, 15700);
});

test('日本語の計算と同じ入力で同じ額', () => {
  const cases = [
    { ageplan: 'u70', period: 'r8', cat: 'e', cost: 400000, place: 'out', rate: 0.3, many: true },
    { ageplan: 'o70', period: 'r8', cat: 'u', cost: 1500000, place: 'in', rate: 0.3 },
    { ageplan: 'kouki', period: 'r7', cat: 'e', cost: 300000, place: 'in', rate: 0.1 },
    { ageplan: 'u70', period: 'r9', cat: 'e3', cost: 800000, place: 'in', rate: 0.3, many: true },
  ];
  for (const en of cases) {
    const a = H.calc(en).k;
    const ja = { plan: en.ageplan === 'kouki' ? 'kouki' : 'kenpo', period: en.period, cat: en.cat, many: !!en.many,
      rows: [{ who: 'self', age: en.ageplan === 'u70' ? 'u70' : 'o70', place: en.place, cost: en.cost, rate: en.rate }] };
    const b = K.calc(ja);
    for (const k of ['paid', 'refund', 'self', 'limit', 'year']) assert.deepEqual(a[k], b[k], JSON.stringify(en) + ' ' + k);
  }
});

test('区分の名前: 全部の表・全部の区分が英語になる', () => {
  for (const p of V.PERIODS) {
    assert.ok(H.periodEn(p).startsWith('Treatment'));
    for (const c of p.cats) {
      const e = H.catEn(c);
      for (const k of ['income', 'hyojun', 'nhi', 'o70', 'o70taxable']) assert.ok(e[k], p.id + c.id + ' ' + k + ' ' + JSON.stringify(c));
      assert.ok(!/[぀-ヿ一-鿿]/.test(JSON.stringify(e)), p.id + c.id);
    }
  }
  assert.equal(H.rangeEn('53万〜79万円'), '¥530,000 to ¥790,000');
  assert.equal(H.incomeEn('ウ（年収約370万〜約770万円）'), 'Income about ¥3.7 million to ¥7.7 million');
  assert.equal(H.o70En('現役並みⅢ'), 'Working-level income III');
  assert.equal(H.rangeEn('知らない形'), null);
});

test('値を写していない。使い方ページの控えの表が値ファイルからの計算と同じ', () => {
  for (const f of ['lib/high-cost-medical.js', 'en/high-cost-medical/app.js', 'en/high-cost-medical/guide.js']) {
    const s = read(f).replace(/\/\/[^\n]*/g, '');
    for (const v of ['85800', '286000', '61500', '44400', '530000']) assert.ok(!s.includes(v), f + ' に ' + v);
  }
  const html = read('en/high-cost-medical/guide.html');
  const p = K.periodById('r8');
  const f = (l) => l.thr ? '¥' + l.base.toLocaleString('en-US') + ' + (cost − ¥' + l.thr.toLocaleString('en-US') + ') × 1%' : '¥' + l.base.toLocaleString('en-US');
  for (const c of H.catsFor(p, 'u70')) {
    const cell = f(c.u70) + ' (¥' + c.u70.many.toLocaleString('en-US') + ')</td><td>¥' + c.year.toLocaleString('en-US') + '</td>';
    assert.ok(html.includes(cell), c.id + ' ' + cell);
  }
  assert.ok(html.includes('data-v="ex">' + K.limitFor('r8', 'u', 'u70', 1000000, false).toLocaleString('en-US') + '<'));
  assert.ok(html.includes('the limit from August 2026 is ¥' + K.limitFor('r8', 'u', 'u70', 1000000, false).toLocaleString('en-US')));
});

test('広告なしの扱いは日本語版と同じ（広告スクリプトなし・定型文あり）', () => {
  for (const f of ['en/high-cost-medical/index.html', 'en/high-cost-medical/guide.html']) {
    const s = read(f);
    assert.ok(!s.includes('adsbygoogle.js'), f);
    assert.ok(s.includes('name="google-adsense-account"'), f);
    assert.ok(s.includes('This page has no ads and no sign-up. Your inputs never leave this device.'), f);
  }
  assert.ok(!read('kogaku-ryoyohi/index.html').includes('adsbygoogle.js'));
});
