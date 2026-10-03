// 育休・産休の給付の計算（Japan childcare leave benefit calculator、英語ページ。K63）のテスト: node --test tests/*.test.js
// 1. 同じ入力で、日本語の育休・産休の計算（lib/ikukyu.js）と 1 円まで一致する（企画書 70・ACCEPTANCE 3 章の束 G）
// 2. 手で確かめた例（厚労省リーフレットの計算例・2026-08-01 の上限額）
// 3. 値を写していない。使い方ページの控えの数字が値ファイルからの計算と同じ
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../lib/childcare-leave.js');
const I = require('../lib/ikukyu.js');
const IV = require('../lib/ikukyu-values.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const KEYS = ['total', 'totalWithIchiji', 'exemptTotal', 'hyojun', 'wage6'];

test('日本語の育休・産休の計算と同じ入力で同じ額（給付ごと・支給単位期間・免除・合計）', () => {
  // [英語ページの入力, 日本語ページ（lib/ikukyu.js）に入れる入力]
  const cases = [
    // 1. 出産する本人・月給 30 万円・予定日 2027-01-10（既定: 1 歳の前日まで・配偶者は 14 日以上の育休）
    [{ role: 'mother', salary: 300000, dueDate: '2027-01-10' },
      { role: 'mother', salary: 300000, dueDate: '2027-01-10', spouse: 'leave14', pref: 'tokyo' }],
    // 2. 配偶者が出産・月給 45 万円・産後パパ育休 14 日のあと 6 か月の育休
    [{ role: 'partner', salary: 450000, dueDate: '2027-03-01', papa: { use: true, start: '2027-03-01', end: '2027-03-14' }, leaveStart: '2027-04-01', leaveEnd: '2027-09-30' },
      { role: 'father', salary: 450000, dueDate: '2027-03-01', papa: { use: true, start: '2027-03-01', end: '2027-03-14' }, leaveStart: '2027-04-01', leaveEnd: '2027-09-30', pref: 'tokyo' }],
    // 3. 本人・月給 70 万円（上限を超える）・双子・予定日より 5 日遅れて生まれた・40 歳以上・配偶者は育休なし
    [{ role: 'mother', salary: 700000, dueDate: '2026-12-01', birthDate: '2026-12-06', babies: 2, over40: true, spouse: 'noLeave' },
      { role: 'mother', salary: 700000, dueDate: '2026-12-01', birthDate: '2026-12-06', babies: 2, over40: true, spouse: 'noLeave', pref: 'tokyo' }],
    // 4. 本人・月給 20 万円・6 か月の賃金と標準報酬月額を入力・加入 12 か月未満・ひとり親・育休は 8 月末まで
    [{ role: 'mother', salary: 200000, wage6: 1260000, hyojun: 220000, under12: true, dueDate: '2027-02-15', spouse: 'none', leaveEnd: '2027-08-31' },
      { role: 'mother', salary: 200000, wage6: 1260000, hyojun: 220000, under12: true, dueDate: '2027-02-15', spouse: 'none', leaveEnd: '2027-08-31', pref: 'tokyo' }],
  ];
  for (const [en, ja] of cases) {
    const a = C.calc(en);
    const b = I.calc(ja);
    const msg = JSON.stringify(en);
    assert.equal(a.ready, true, msg);
    for (const k of KEYS) assert.deepEqual(a.r[k], b[k], msg + ' ' + k);
    for (const k of ['teate', 'papa', 'leave', 'shien', 'ichiji', 'wage', 'exempt']) assert.deepEqual(a.r[k], b[k], msg + ' ' + k);
  }
});

test('手で確かめた例: 厚労省リーフレット p.16〜17（賃金日額 10,000円 → 1 か月 201,000円、13% は 28 日で 36,400円）', () => {
  const r = C.calc({ role: 'partner', salary: 300000, dueDate: '2027-01-10', leaveStart: '2027-01-10', leaveEnd: '2027-06-30' }).r;
  assert.equal(r.wage.daily, 10000);           // 300,000 × 6 ÷ 180
  assert.equal(r.leave.monthlyHigh, 201000);   // 10,000 × 30 × 67%
  assert.equal(r.leave.monthlyLow, 150000);    // 10,000 × 30 × 50%
  assert.equal(r.shien.ok, true);
  assert.equal(r.shien.amount, 36400);         // 10,000 × 28 × 13%
});

test('手で確かめた例: 2026-08-01 からの上限（賃金日額 16,540円 → 月 332,454円・248,100円）', () => {
  const res = C.calc({ role: 'mother', salary: 600000, dueDate: '2027-01-10' });
  assert.equal(res.r.wage.daily, 16540);
  assert.equal(res.r.leave.monthlyHigh, 332454);
  assert.equal(res.r.leave.monthlyLow, 248100);
  assert.ok(res.notices.includes('wageMax'));
  // 出産手当金: 標準報酬月額 590,000（等級表の 575,000〜605,000 円未満）÷ 30 ＝ 19,666.6… → 19,670（10円未満四捨五入）× 2/3 ＝ 13,113.3… → 13,113
  assert.equal(res.r.hyojun, 590000);
  assert.equal(res.r.teate.daily.daily, 13113);
  assert.equal(res.r.teate.period.days, 98);   // 産前 42 日＋産後 56 日
});

test('入力が足りないとき・注意のキー', () => {
  assert.equal(C.calc({ salary: 300000 }).need, 'dueDate');
  assert.equal(C.calc({ dueDate: '2027-01-10' }).need, 'salary');
  const p = C.calc({ role: 'partner', salary: 300000, dueDate: '2027-01-10', papa: { use: true, start: '2027-01-10', end: '2027-02-20' } });
  assert.ok(p.notices.includes('papaOver28'));
  const w = C.calc({ role: 'partner', salary: 300000, dueDate: '2027-01-10', papa: { use: true, start: '2027-05-01', end: '2027-05-10' } });
  assert.ok(w.notices.includes('papaWindow'));
  const o = C.calc({ role: 'mother', salary: 300000, dueDate: '2027-01-10', leaveEnd: '2028-03-01' });
  assert.ok(o.notices.includes('afterOne'));
  assert.ok(o.notices.includes('capYear'));
  // 配偶者の役割は日本語の father に直す。本人のときは育休の開始日・産後パパ育休を渡さない
  assert.equal(C.toIkukyuInput(C.normalizeInput({ role: 'partner' })).role, 'father');
  assert.equal(C.toIkukyuInput(C.normalizeInput({ role: 'mother', leaveStart: '2027-01-01', papa: { use: true } })).leaveStart, '');
});

test('書き出し・読み込み', () => {
  const f = C.toExportFile({ salary: '300,000', dueDate: '2027-01-10' }, new Date('2026-10-03T00:00:00Z'));
  assert.equal(f.tool, 'seido-keisan-childcare-leave');
  assert.equal(f.data.salary, 300000);
  assert.deepEqual(C.fromExportFile(f), { ok: true, data: f.data });
  assert.equal(C.fromExportFile({ tool: 'x' }).code, 'otherTool');
});

test('値を写していない（英語のページと計算に上限額・率の数字が無い）。使い方ページの控えは値ファイルからの計算と同じ', () => {
  for (const f of ['lib/childcare-leave.js', 'en/childcare-leave/app.js', 'en/childcare-leave/guide.js']) {
    const s = read(f).replace(/\/\/[^\n]*/g, '');
    for (const v of ['16540', '3203', '332454', '248100', '500000']) assert.ok(!s.includes(v), f + ' に ' + v);
  }
  const html = read('en/childcare-leave/guide.html');
  const k = IV.koyo;
  const n = (x) => Number(x).toLocaleString('en-US');
  const want = {
    dailyMax: n(k.dailyMax), dailyMin: n(k.dailyMin), high: String(k.rateHigh), low: String(k.rateLow),
    maxHigh: n(Math.floor(k.dailyMax * 30 * k.rateHigh / 100)), maxLow: n(Math.floor(k.dailyMax * 30 * k.rateLow / 100)),
    shien: String(k.shien.rate), ichiji: n(IV.kenpo.ichiji.sanka), sanzen: String(IV.kenpo.sanzen), sango: String(IV.kenpo.sango),
  };
  for (const [key, val] of Object.entries(want)) {
    const re = new RegExp('data-v="' + key + '">([^<]*)<', 'g');
    let m, seen = 0;
    while ((m = re.exec(html))) { assert.equal(m[1], val, key); seen++; }
    assert.ok(seen > 0, key);
  }
  // JSON-LD の FAQ の額も同じ
  assert.ok(html.includes('¥' + want.maxHigh + ' a month at 67%'));
  assert.ok(html.includes('capped at ¥' + want.dailyMax));
});
