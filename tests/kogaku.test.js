// 高額療養費の計算のテスト: node --test tests/*.test.js
// 期待値は厚生労働省の計算例（参考資料 1ページ・平成30年8月からのリーフレット 3・6ページ）、協会けんぽの表、
// 健康保険法施行令 41・42 条（令和8年8月1日施行版・令和9年8月1日施行版・その前の版）から手で計算した
// （出典は lib/kogaku-values.js の SOURCES）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../lib/kogaku.js');
const V = require('../lib/kogaku-values.js');

const one = (period, cat, cost, extra) => C.calc(Object.assign({ period, cat, rows: [{ cost, age: 'u70', place: 'in', rate: 0.3 }] }, extra || {}));

test('厚生労働省の計算例（令和8年8月から: 70歳未満・年収約370万〜約510万円）', () => {
  // 85,800円＋（1,000,000円−286,000円）×1%＝92,940円、200万円 102,940円、300万円 112,940円
  assert.equal(one('r8', 'u', 1000000).limit, 92940);
  assert.equal(one('r8', 'u', 2000000).limit, 102940);
  assert.equal(one('r8', 'u', 3000000).limit, 112940);
  const r = one('r8', 'u', 1000000);
  assert.equal(r.paid, 300000);
  assert.equal(r.refund, 207060);
  assert.equal(r.self, 92940);
});

test('厚生労働省の計算例（令和8年7月まで: 80,100円＋（100万円−267,000円）×1%＝87,430円、高額療養費 212,570円）', () => {
  const r = one('r7', 'u', 1000000);
  assert.equal(r.limit, 87430);
  assert.equal(r.refund, 212570);
});

test('厚生労働省の世帯合算の例（75歳以上・一般、〜令和8年7月: 49,000＋8,000＋4,000＝61,000円 → 3,400円）', () => {
  const r = C.calc({ period: 'r7', cat: 'e', plan: 'kouki', rows: [
    { who: 'self', place: 'in', cost: 490000, rate: 0.1 },
    { who: 'f1', place: 'out', cost: 80000, rate: 0.1 },
    { who: 'f1', place: 'out', cost: 40000, rate: 0.1 },
  ] });
  assert.equal(r.paid, 61000);
  assert.equal(r.refund, 3400);
  assert.equal(r.self, 57600);
});

test('1%の額の端数: 50銭以上は切り上げ、50銭未満は切り捨て（施行令42条）', () => {
  assert.equal(C.onePercent(50), 1);
  assert.equal(C.onePercent(49), 0);
  assert.equal(one('r8', 'u', 286050).limit, 85801);
  assert.equal(one('r8', 'u', 286049).limit, 85800);
  // 医療費が境目より少なければ 1% の額は 0
  assert.equal(one('r8', 'a', 500000).limit, 270300);
});

test('施行令42条1項の額（70歳未満）: 3つの表の全区分', () => {
  const cases = [
    // [期間, 区分, 医療費, 上限, 多数回]
    ['r7', 'a', 1000000, 252600 + 1580, 140100], ['r7', 'i', 1000000, 167400 + 4420, 93000], ['r7', 'u', 1000000, 87430, 44400],
    ['r7', 'e', 1000000, 57600, 44400], ['r7', 'o', 1000000, 35400, 24600],
    ['r8', 'a', 1000000, 270300 + 990, 140100], ['r8', 'i', 1000000, 179100 + 4030, 93000], ['r8', 'u', 1000000, 92940, 44400],
    ['r8', 'e', 1000000, 61500, 44400], ['r8', 'o', 1000000, 36900, 24600],
    ['r9', 'a1', 2000000, 342000 + 8600, 140100], ['r9', 'a2', 2000000, 303000 + 9900, 140100], ['r9', 'a3', 2000000, 270300 + 10990, 140100],
    ['r9', 'i1', 1000000, 209400 + 3020, 93000], ['r9', 'i2', 1000000, 194400 + 3520, 93000], ['r9', 'i3', 1000000, 179100 + 4030, 93000],
    ['r9', 'u1', 1000000, 110400 + 6320, 44400], ['r9', 'u2', 1000000, 98100 + 6730, 44400], ['r9', 'u3', 1000000, 92940, 44400],
    ['r9', 'e1', 1000000, 69600, 44400], ['r9', 'e2', 1000000, 65400, 44400], ['r9', 'e3', 1000000, 61500, 34500], ['r9', 'o', 1000000, 36900, 24600],
  ];
  for (const [p, c, cost, lim, many] of cases) {
    assert.equal(one(p, c, cost).limit, lim, p + ' ' + c);
    assert.equal(one(p, c, cost, { many: true }).limit, many, p + ' ' + c + ' 多数回');
  }
});

test('70歳以上: 外来（個人ごと）→ 世帯の順（令和8年8月から）', () => {
  // 一般: 外来 22,000円。1人で外来 30,000円 → 8,000円戻る
  let r = C.calc({ period: 'r8', cat: 'e', rows: [{ age: 'o70', place: 'out', cost: 150000, rate: 0.2 }] });
  assert.equal(r.paid, 30000);
  assert.equal(r.refund, 8000);
  assert.equal(r.self, 22000);
  // 一般: 入院 100,000円（医療費50万・2割）＋ 外来 30,000円 → 外来 22,000 に、世帯 61,500 に
  r = C.calc({ period: 'r8', cat: 'e', rows: [
    { who: 'self', age: 'o70', place: 'in', cost: 500000, rate: 0.2 },
    { who: 'self', age: 'o70', place: 'out', cost: 150000, rate: 0.2 },
  ] });
  assert.equal(r.paid, 130000);
  assert.equal(r.self, 61500);
  assert.equal(r.refund, 68500);
  // 低所得Ⅱ: 外来 11,000円、世帯 25,700円（多数回 24,600円）。低所得Ⅰ: 世帯 15,700円
  r = C.calc({ period: 'r8', cat: 'o', rows: [{ age: 'o70', place: 'in', cost: 300000, rate: 0.2 }] });
  assert.equal(r.self, 25700);
  r = C.calc({ period: 'r8', cat: 'o', many: true, rows: [{ age: 'o70', place: 'in', cost: 300000, rate: 0.2 }] });
  assert.equal(r.self, 24600);
  r = C.calc({ period: 'r8', cat: 'o1', rows: [{ age: 'o70', place: 'in', cost: 300000, rate: 0.2 }] });
  assert.equal(r.self, 15700);
  r = C.calc({ period: 'r8', cat: 'o1', rows: [{ age: 'o70', place: 'out', cost: 60000, rate: 0.2 }] });
  assert.equal(r.self, 8000);
  // 現役並み（ウ）は外来の上限なし、世帯は 70歳未満と同じ式
  r = C.calc({ period: 'r8', cat: 'u', rows: [{ age: 'o70', place: 'out', cost: 1000000, rate: 0.3 }] });
  assert.equal(r.hasGairai, false);
  assert.equal(r.self, 92940);
  // 〜令和8年7月: 一般の外来 18,000円・世帯 57,600円、低所得Ⅱ 24,600円（多数回なし）、低所得Ⅰ 15,000円
  r = C.calc({ period: 'r7', cat: 'e', rows: [{ age: 'o70', place: 'out', cost: 150000, rate: 0.2 }] });
  assert.equal(r.self, 18000);
  r = C.calc({ period: 'r7', cat: 'o', many: true, rows: [{ age: 'o70', place: 'in', cost: 300000, rate: 0.2 }] });
  assert.equal(r.self, 24600);
  r = C.calc({ period: 'r7', cat: 'o1', rows: [{ age: 'o70', place: 'in', cost: 300000, rate: 0.2 }] });
  assert.equal(r.self, 15000);
  // 令和9年8月から: 一般（標準報酬月額16万〜26万円）の外来 28,000円、〜15万円 22,000円、非課税 13,000円
  r = C.calc({ period: 'r9', cat: 'e1', rows: [{ age: 'o70', place: 'out', cost: 200000, rate: 0.2 }] });
  assert.equal(r.self, 28000);
  r = C.calc({ period: 'r9', cat: 'e3', rows: [{ age: 'o70', place: 'out', cost: 200000, rate: 0.2 }] });
  assert.equal(r.self, 22000);
  r = C.calc({ period: 'r9', cat: 'o', rows: [{ age: 'o70', place: 'out', cost: 200000, rate: 0.2 }] });
  assert.equal(r.self, 13000);
});

test('70歳未満の世帯合算は1つの病院等で21,000円以上の分だけ（施行令41条1項）', () => {
  // 本人 入院 60,000円（医療費20万）＋ 家族 外来 21,000円（7万）＋ 家族 別の外来 20,999円は合算しない
  const r = C.calc({ period: 'r8', cat: 'e', rows: [
    { who: 'self', cost: 200000, rate: 0.3, place: 'in' },
    { who: 'f1', cost: 70000, rate: 0.3, place: 'out' },
    { who: 'f1', cost: 69997, rate: 0.3, place: 'out' },
  ] });
  assert.equal(r.rows[2].pay, 20999);
  assert.equal(r.smallU70, 1);
  // 合算は 60,000 ＋ 21,000 ＝ 81,000 → 61,500 を超えた 19,500 が戻る
  assert.equal(r.refund, 19500);
  assert.equal(r.self, 61500 + 20999);
});

test('70歳以上と70歳未満がいる世帯（健保・国保）: 70歳以上の残りと70歳未満の21,000円以上を合算', () => {
  // 令和8年8月・区分エ（一般）: 70歳以上の親 入院 70,000円（医療費35万・2割）→ 61,500、子 入院 30,000円（10万・3割）
  const r = C.calc({ period: 'r8', cat: 'e', rows: [
    { who: 'f1', age: 'o70', place: 'in', cost: 350000, rate: 0.2 },
    { who: 'self', age: 'u70', place: 'in', cost: 100000, rate: 0.3 },
  ] });
  // 70歳以上の世帯: 70,000 → 61,500（8,500 戻る）。全体: 61,500 ＋ 30,000 ＝ 91,500 → 61,500（30,000 戻る）
  assert.equal(r.refund, 8500 + 30000);
  assert.equal(r.self, 61500);
});

test('診療月で表を選ぶ（2026-07 まで・2026-08〜2027-07・2027-08 から）', () => {
  assert.equal(C.periodFor('2026-07').id, 'r7');
  assert.equal(C.periodFor('2026-08').id, 'r8');
  assert.equal(C.periodFor('2027-07').id, 'r8');
  assert.equal(C.periodFor('2027-08').id, 'r9');
  assert.equal(C.periodFor('2030-01').id, 'r9');
  // 期間を選ばなければ今月の表
  assert.equal(C.calc({ cat: 'u', rows: [{ cost: 1000000 }] }, '2026-09').period.id, 'r8');
});

test('年間上限（令和8年8月から。8月〜翌7月）', () => {
  const r = C.calc({ period: 'r8', cat: 'u', yearPaid: 600000, rows: [{ cost: 1000000 }] });
  assert.equal(r.year.cap, 530000);
  assert.equal(r.year.over, 70000);
  assert.equal(C.calc({ period: 'r8', cat: 'a', rows: [{ cost: 1 }] }).year.cap, 1680000);
  assert.equal(C.calc({ period: 'r8', cat: 'i', rows: [{ cost: 1 }] }).year.cap, 1110000);
  assert.equal(C.calc({ period: 'r8', cat: 'o', rows: [{ cost: 1 }] }).year.cap, 290000);
  assert.equal(C.calc({ period: 'r8', cat: 'o1', rows: [{ cost: 1 }] }).year.cap, 180000);
  assert.equal(C.calc({ period: 'r8', cat: 'e', rows: [{ cost: 1 }] }).year.cap200, 410000);
  assert.equal(C.calc({ period: 'r9', cat: 'e3', rows: [{ cost: 1 }] }).year.cap, 410000);
  // 令和8年7月までは年間上限がない
  assert.equal(C.calc({ period: 'r7', cat: 'u', rows: [{ cost: 1 }] }).year, undefined);
});

test('入力の正規化とファイル', () => {
  const d = C.normalizeInput({ plan: 'kouki', rows: [{ age: 'u70', rate: 0.3, cost: '1000' }, { rate: 5 }] });
  assert.equal(d.rows[0].age, 'o70');          // 後期は全員 70歳以上
  assert.equal(d.rows[1].rate, 0.1);           // 知らない割合は既定（後期 1割）
  assert.equal(d.rows[0].who, 'self');
  assert.equal(C.normalizeInput({}).rows.length, 1);
  assert.equal(C.normalizeInput({ rows: new Array(30).fill({}) }).rows.length, C.MAX_ROWS);
  const f = C.toExportFile({ cat: 'u', rows: [{ cost: 5 }] });
  assert.equal(f.tool, 'seido-keisan-kogaku');
  assert.deepEqual(C.fromExportFile(JSON.parse(JSON.stringify(f))).data, C.normalizeInput({ cat: 'u', rows: [{ cost: 5 }] }));
  assert.equal(C.fromExportFile({ tool: 'x' }).ok, false);
  // 区分が無い・医療費が無いときは結果を出さない
  assert.equal(C.calc({ cat: 'zz', rows: [{ cost: 100 }] }).ready, false);
  assert.equal(C.calc({ cat: 'u' }).ready, false);
});

test('値の表の形と出典', () => {
  assert.match(V.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  const keys = new Set(V.SOURCES.map(s => s.key));
  for (const p of V.PERIODS) {
    for (const k of p.src) assert.ok(keys.has(k), p.id + ' ' + k);
    const ids = new Set();
    for (const c of p.cats) {
      assert.ok(!ids.has(c.id)); ids.add(c.id);
      for (const l of [c.u70, c.o70]) assert.ok(l.base > 0 && (l.many === null || l.many < l.base), p.id + ' ' + c.id);
      // 1%の境目 ＝ 定額 ÷ 0.3（例 85,800 ÷ 0.3 ＝ 286,000）
      for (const l of [c.u70, c.o70]) if (l.thr) assert.equal(l.thr, Math.round(l.base / 0.3), p.id + ' ' + c.id);
    }
  }
  // 画面の区分の選択肢は index.html に書かず app.js が作る（表と画面がずれない）
  const html = fs.readFileSync(path.join(__dirname, '..', 'kogaku-ryoyohi', 'index.html'), 'utf8');
  assert.ok(!/<option value="u">/.test(html));
  // 広告なし（D118）: 広告のスクリプトを読まない
  for (const f of ['index.html', 'guide.html']) {
    const h = fs.readFileSync(path.join(__dirname, '..', 'kogaku-ryoyohi', f), 'utf8');
    assert.ok(!/adsbygoogle\.js/.test(h), f + ' に広告のスクリプトがない');
    assert.ok(/google-adsense-account/.test(h), f + ' に所有確認の meta');
    assert.ok(h.includes('このページは広告なし・登録なし・入力は端末の外に出ません。'), f + ' の先頭の定型文');
  }
});

test('使い方ページの上限額の表が値の表（2026年8月から）と同じ', () => {
  const h = fs.readFileSync(path.join(__dirname, '..', 'kogaku-ryoyohi', 'guide.html'), 'utf8');
  const p = C.periodById('r8');
  const fmt = n => n.toLocaleString('ja-JP') + '円';
  for (const c of p.cats.filter(c => !c.o70only)) {
    const s = c.u70.thr ? fmt(c.u70.base) + '＋（医療費−' + fmt(c.u70.thr) + '）×1%〈' + fmt(c.u70.many) + '〉' : fmt(c.u70.base) + '〈' + fmt(c.u70.many) + '〉';
    assert.ok(h.includes(s), c.id + ' ' + s);
    assert.ok(h.includes(c.year / 10000 + '万円'), c.id + ' 年間');
  }
  const e = C.catById(p, 'e'), o = C.catById(p, 'o'), o1 = C.catById(p, 'o1');
  assert.ok(h.includes('<td>' + fmt(e.gairai) + '（年' + fmt(e.gairaiYear) + '）</td><td>' + fmt(e.o70.base) + '〈' + fmt(e.o70.many) + '〉</td>'));
  assert.ok(h.includes('<td>' + fmt(o.gairai) + '（年' + fmt(o.gairaiYear) + '）</td><td>' + fmt(o.o70.base) + '〈' + fmt(o.o70.many) + '〉</td>'));
  assert.ok(h.includes('<td>' + fmt(o1.gairai) + '</td><td>' + fmt(o1.o70.base) + '</td>'));
});
