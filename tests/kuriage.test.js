// 年金の繰上げ・繰下げのテスト: node --test tests/*.test.js
// 期待値は日本年金機構の早見表（繰上げ減額率 2 種・繰下げ増額率）、在職老齢年金の計算例、
// 国民年金法施行令 4条の5・12条から手で計算した（出典は lib/kuriage-values.js の SOURCES）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../lib/kuriage.js');
const V = require('../lib/kuriage-values.js');

// 機構の早見表（請求時の年齢 X歳0〜11か月の率、%）
const KURIAGE_NEW = {
  60: [24.0, 23.6, 23.2, 22.8, 22.4, 22.0, 21.6, 21.2, 20.8, 20.4, 20.0, 19.6],
  61: [19.2, 18.8, 18.4, 18.0, 17.6, 17.2, 16.8, 16.4, 16.0, 15.6, 15.2, 14.8],
  62: [14.4, 14.0, 13.6, 13.2, 12.8, 12.4, 12.0, 11.6, 11.2, 10.8, 10.4, 10.0],
  63: [9.6, 9.2, 8.8, 8.4, 8.0, 7.6, 7.2, 6.8, 6.4, 6.0, 5.6, 5.2],
  64: [4.8, 4.4, 4.0, 3.6, 3.2, 2.8, 2.4, 2.0, 1.6, 1.2, 0.8, 0.4],
};
const KURIAGE_OLD = {
  60: [30.0, 29.5, 29.0, 28.5, 28.0, 27.5, 27.0, 26.5, 26.0, 25.5, 25.0, 24.5],
  61: [24.0, 23.5, 23.0, 22.5, 22.0, 21.5, 21.0, 20.5, 20.0, 19.5, 19.0, 18.5],
  62: [18.0, 17.5, 17.0, 16.5, 16.0, 15.5, 15.0, 14.5, 14.0, 13.5, 13.0, 12.5],
  63: [12.0, 11.5, 11.0, 10.5, 10.0, 9.5, 9.0, 8.5, 8.0, 7.5, 7.0, 6.5],
  64: [6.0, 5.5, 5.0, 4.5, 4.0, 3.5, 3.0, 2.5, 2.0, 1.5, 1.0, 0.5],
};
const KURISAGE = {
  66: [8.4, 9.1, 9.8, 10.5, 11.2, 11.9, 12.6, 13.3, 14.0, 14.7, 15.4, 16.1],
  67: [16.8, 17.5, 18.2, 18.9, 19.6, 20.3, 21.0, 21.7, 22.4, 23.1, 23.8, 24.5],
  68: [25.2, 25.9, 26.6, 27.3, 28.0, 28.7, 29.4, 30.1, 30.8, 31.5, 32.2, 32.9],
  69: [33.6, 34.3, 35.0, 35.7, 36.4, 37.1, 37.8, 38.5, 39.2, 39.9, 40.6, 41.3],
  70: [42.0, 42.7, 43.4, 44.1, 44.8, 45.5, 46.2, 46.9, 47.6, 48.3, 49.0, 49.7],
  71: [50.4, 51.1, 51.8, 52.5, 53.2, 53.9, 54.6, 55.3, 56.0, 56.7, 57.4, 58.1],
  72: [58.8, 59.5, 60.2, 60.9, 61.6, 62.3, 63.0, 63.7, 64.4, 65.1, 65.8, 66.5],
  73: [67.2, 67.9, 68.6, 69.3, 70.0, 70.7, 71.4, 72.1, 72.8, 73.5, 74.2, 74.9],
  74: [75.6, 76.3, 77.0, 77.7, 78.4, 79.1, 79.8, 80.5, 81.2, 81.9, 82.6, 83.3],
  75: [84.0],
};
const pct = (birth, age, mon) => C.calc({ birth, kiso: 1000000, age, mon }).pct1;

test('日本年金機構の繰上げ減額率早見表（昭和37年4月2日以降生まれ 0.4%）を全60か月で再現する', () => {
  for (const [age, row] of Object.entries(KURIAGE_NEW)) row.forEach((v, m) => assert.equal(pct('1966-05-10', +age, m), -v, age + '歳' + m + 'か月'));
});

test('日本年金機構の繰上げ減額率早見表（昭和37年4月1日以前生まれ 0.5%）を全60か月で再現する', () => {
  for (const [age, row] of Object.entries(KURIAGE_OLD)) row.forEach((v, m) => assert.equal(pct('1962-04-01', +age, m), -v, age + '歳' + m + 'か月'));
  // 境目: 1962-04-02 生まれは 0.4%
  assert.equal(C.kuriageRate('1962-04-02'), 0.004);
  assert.equal(C.kuriageRate('1962-04-01'), 0.005);
});

test('日本年金機構の繰下げ増額率早見表（66歳0か月 8.4% 〜 75歳 84.0%）を再現する', () => {
  for (const [age, row] of Object.entries(KURISAGE)) row.forEach((v, m) => assert.equal(pct('1960-06-15', +age, m), v, age + '歳' + m + 'か月'));
  // 昭和27年4月1日以前生まれは70歳（42%）まで
  assert.equal(C.kurisageMax('1952-04-01'), 60);
  assert.equal(C.kurisageMax('1952-04-02'), 120);
  const r = C.calc({ birth: '1952-04-01', kiso: 1000000, age: 72 });
  assert.equal(r.pct1, 42);
  assert.ok(r.msgs.includes('max'));
});

test('65歳1か月〜65歳11か月は繰下げの申出ができない（66歳から）', () => {
  const r = C.calc({ birth: '1966-05-10', kiso: 800000, age: 65, mon: 6 });
  assert.equal(r.k1, 0);
  assert.ok(r.msgs.includes('gap'));
});

test('年金額と端数（1円未満は四捨五入。国民年金法17条）', () => {
  // 老齢基礎年金 847,300円（例）を70歳まで繰下げ → 847,300 × 1.42 ＝ 1,203,166円
  const r = C.calc({ birth: '1966-05-10', kiso: 847300, kosei: 1200000, age: 70 });
  assert.equal(r.kiso, 1203166);
  assert.equal(r.kosei, 1704000);
  assert.equal(r.total, 2907166);
  // 60歳で繰上げ: × 0.76
  assert.equal(C.calc({ birth: '1970-01-20', kiso: 847301, age: 60 }).kiso, Math.round(847301 * 0.76));
});

test('損益分岐の年齢（額によらない。0.4%・0.7%）', () => {
  const be = (age, birth) => { const r = C.calc({ birth: birth || '1970-01-20', kiso: 800000, kosei: 1000000, age }); return r.breakEven.age.y + '歳' + r.breakEven.age.m + 'か月'; };
  // 繰上げ 60歳: 0.76 ×（t＋60）＝ t → t ＝ 190（80歳10か月）
  assert.equal(be(60), '80歳10か月');
  assert.equal(be(62), '82歳10か月');   // 0.856 ×（t＋36）＝ t → t ＝ 214 ちょうど
  assert.equal(be(64), '84歳10か月');
  // 繰下げ 70歳: 1.42 ×（t−60）＝ t → t ＝ 202.9 → 203（81歳11か月）
  assert.equal(be(66), '77歳11か月');
  assert.equal(be(68), '79歳11か月');
  assert.equal(be(70), '81歳11か月');
  assert.equal(be(75), '86歳11か月');
  // 0.5%の人の60歳（1.7 ではなく 0.7 倍）: 0.7 ×（t＋60）＝ t → t ＝ 140（76歳8か月）
  assert.equal(C.calc({ birth: '1962-04-01', kiso: 800000, age: 60 }).breakEven.t, 140);
  // 65歳から受け取るときは損益分岐がない
  assert.equal(C.calc({ birth: '1970-01-20', kiso: 800000, age: 65 }).breakEven, undefined);
});

test('累計の表: 70歳に達した月までは繰下げの累計は 0、65歳からは60か月分', () => {
  const r = C.calc({ birth: '1970-01-20', kiso: 1200000, age: 70 });
  const at70 = r.totals.find(x => x.age === 70);
  assert.equal(at70.opt, 0);
  assert.equal(at70.base, 1200000 / 12 * 60);   // 65歳に達した月の翌月分から、70歳に達した月の分まで 60 か月
  assert.equal(r.totals.find(x => x.age === 100).opt, Math.round(1200000 * 1.42 / 12 * 360));
});

test('在職老齢年金（令和8年度 65万円）: 機構の例と、繰下げの増額が平均支給率で減ること', () => {
  // 機構の例: 基本月額10万円・総報酬月額相当額46万円 → 改正後は全額支給（改正前の51万円なら 2.5万円停止）
  assert.equal(C.zairoStop(1200000, 460000), 0);
  assert.equal((100000 + 460000 - V.zairo.prevBase) / 2, 25000);
  // 基本月額10万円・賃金60万円 → (10 + 60 − 65) ÷ 2 ＝ 2.5万円停止 → 支給率 0.75
  assert.equal(C.zairoStop(1200000, 600000), 25000);
  const r = C.calc({ birth: '1966-05-10', kiso: 847300, kosei: 1200000, age: 70, wage: 600000, workTo: 70 });
  assert.equal(r.avg, 0.75);
  // 厚生年金の加算 ＝ 1,200,000 × 42% × 0.75 ＝ 378,000
  assert.equal(r.kosei, 1578000);
  // 70歳まで働いて68歳で申出（36か月すべて在職）も 0.75、66歳まで働いて70歳で申出なら（12 × 0.75 ＋ 48）÷ 60 ＝ 0.95
  assert.equal(C.calc({ birth: '1966-05-10', kosei: 1200000, age: 70, wage: 600000, workTo: 66 }).avg, 0.95);
  // 全額停止なら増額は 0
  assert.equal(C.calc({ birth: '1966-05-10', kosei: 1200000, age: 70, wage: 900000, workTo: 75 }).kosei, 1200000);
  // 繰上げと在職は一緒に計算しない
  assert.ok(C.calc({ birth: '1970-01-20', kosei: 1200000, age: 62, wage: 600000 }).msgs.includes('workEarly'));
});

test('在職老齢年金の基準額は制度の改定カレンダーと同じ（65万円・2026年4月）', () => {
  const K = require('../lib/kaitei-values.js');
  const it = K.ITEMS.find(i => i.id === '2026-04-zairo');
  assert.equal(it.date.slice(0, 7), V.zairo.from);
  assert.match(it.title, /65万円/);
  assert.match(it.what, /51万円から65万円/);
  assert.ok(it.tools.some(t => t.key === 'kuriage'));
});

test('基礎と厚生を別の年齢で繰下げる／繰上げは同時', () => {
  let r = C.calc({ birth: '1966-05-10', kiso: 800000, kosei: 1000000, age: 70, sep: true, kAge: 65 });
  assert.equal(r.pct1, 42);
  assert.equal(r.pct2, 0);
  assert.equal(r.kosei, 1000000);
  r = C.calc({ birth: '1966-05-10', kiso: 800000, kosei: 1000000, age: 65, sep: true, kAge: 68 });
  assert.equal(r.kiso, 800000);
  assert.equal(r.kosei, 1252000);
  r = C.calc({ birth: '1970-01-20', kiso: 800000, kosei: 1000000, age: 62, sep: true, kAge: 70 });
  assert.equal(r.pct2, -14.4);
  assert.ok(r.msgs.includes('together'));
});

test('65歳に達する月・受け取り始める月（誕生日の前日で数える）', () => {
  // 4月1日生まれは3月31日に65歳に達する
  assert.equal(C.indexYm(C.reachIndex('1966-04-01', 65)), '2031-03');
  assert.equal(C.indexYm(C.reachIndex('1966-04-02', 65)), '2031-04');
  // 2月29日生まれ: 平年は2月28日
  assert.equal(C.indexYm(C.reachIndex('1964-02-29', 65)), '2029-02');
  const r = C.calc({ birth: '1966-05-10', kiso: 800000, age: 70 });
  assert.equal(r.requestYm, '2036-05');
  assert.equal(r.startYm, '2036-06');
  // 過ぎた月を選ぶと注意
  assert.ok(C.calc({ birth: '1966-05-10', kiso: 800000, age: 60 }, '2026-09').msgs.includes('past'));
  assert.ok(!C.calc({ birth: '1966-05-10', kiso: 800000, age: 61 }, '2026-09').msgs.includes('past'));
});

test('特別支給の老齢厚生年金（厚生年金保険法 附則8条の2）', () => {
  assert.equal(C.tokubetsuAge('1966-04-01', 'female'), 64);
  assert.equal(C.tokubetsuAge('1966-04-02', 'female'), null);
  assert.equal(C.tokubetsuAge('1964-04-01', 'female'), 63);
  assert.equal(C.tokubetsuAge('1961-04-01', 'male'), 64);
  assert.equal(C.tokubetsuAge('1961-04-02', 'male'), null);
  assert.ok(C.calc({ birth: '1965-01-10', kosei: 500000, age: 62 }).msgs.includes('tokubetsu'));
});

test('入力の正規化とファイル', () => {
  const d = C.normalizeInput({ birth: '1966-02-30', kiso: '-5', age: 99, mon: 20 });
  assert.equal(d.birth, '');
  assert.equal(d.kiso, 0);
  assert.equal(d.age, 75);
  assert.equal(d.mon, 11);
  assert.equal(C.normalizeInput({}).age, 65);
  assert.equal(C.calc({ kiso: 1 }).ready, false);
  const f = C.toExportFile({ birth: '1966-05-10', kiso: 800000 });
  assert.equal(f.tool, 'seido-keisan-kuriage');
  assert.deepEqual(C.fromExportFile(JSON.parse(JSON.stringify(f))).data, C.normalizeInput({ birth: '1966-05-10', kiso: 800000 }));
  assert.equal(C.fromExportFile({ tool: 'seido-keisan-kuriage', version: 2 }).ok, false);
});

test('値の表と画面（広告なし D118）', () => {
  assert.match(V.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  for (const s of V.SOURCES) assert.match(s.url, /^https:\/\//);
  for (const f of ['index.html', 'guide.html']) {
    const h = fs.readFileSync(path.join(__dirname, '..', 'nenkin-kuriage', f), 'utf8');
    assert.ok(!/adsbygoogle\.js/.test(h), f + ' に広告のスクリプトがない');
    assert.ok(/google-adsense-account/.test(h), f + ' に所有確認の meta');
    assert.ok(h.includes('このページは広告なし・登録なし・入力は端末の外に出ません。'), f + ' の先頭の定型文');
  }
});

test('使い方ページの表（増減と損益分岐）が計算と同じ', () => {
  const h = fs.readFileSync(path.join(__dirname, '..', 'nenkin-kuriage', 'guide.html'), 'utf8');
  const rows = [...h.matchAll(/<tr><th scope="row">(\d+)歳<\/th><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)];
  assert.equal(rows.length, 8);
  for (const [, age, pctText, beText] of rows) {
    const r = C.calc({ birth: '1970-01-20', kiso: 800000, kosei: 1000000, age: +age });
    assert.equal(pctText.replace('−', '-').replace('＋', ''), String(r.pct1) + '%', age);
    assert.equal(beText, r.breakEven.age.y + '歳' + r.breakEven.age.m + 'か月', age);
  }
});
