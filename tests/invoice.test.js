// 2割特例の後の消費税の比較のテスト: node --test tests/*.test.js
// 期待値は国税庁「２割特例用 確定申告の手引き」の設例、インボイスQ&A 問117-3・問130、令和8年度税制改正特集、
// 消費税法・国税通則法・地方税法の端数処理から手で計算した（出典は lib/invoice-values.js の SOURCES）
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../lib/invoice.js');
const V = require('../lib/invoice-values.js');

// --- 国税庁「２割特例用 確定申告の手引き」の設例（国税太郎。システムサービス業、4〜12月の課税売上 6,609,330円（税込）、
//     売上の値引き 192,900円）: 税抜 6,008,481円 → 課税標準額 6,008,000円 → 消費税額 468,624円、返還等の税額 13,678円、
//     基礎 454,946円 × 80% ＝ 特別控除税額 363,956円、差引税額 90,900円
test('国税庁の2割特例の設例（国税太郎）を 1 円まで再現する', () => {
  const r = I.calc({ uriage: 6609330, henkan: 192900 });
  assert.equal(r.base.zeinuki, 6008481);
  assert.equal(r.base.hyojun, 6008000);
  assert.equal(r.base.uriageTax, 468624);
  assert.equal(r.base.henkanTax, 13678);
  assert.equal(r.base.base, 454946);
  const n = r.methods.niwari;
  assert.equal(n.kojo, 363956);
  assert.equal(n.r.diff, 90990);
  assert.equal(n.r.koku, 90900);
  // 地方消費税 90,900 × 22/78 ＝ 25,638.4… → 100円未満切り捨て 25,600
  assert.equal(n.r.chiho, 25600);
  assert.equal(n.r.total, 116500);
});

// --- 税込 880万円（税抜 800万円）・第5種・インボイスあり仕入 110万円・なし 55万円（令和9年分）
test('令和9年分: 3割特例・簡易課税・本則課税・2割特例の比較（サービス業）', () => {
  const r = I.calc({ year: 2027, uriage: 8800000, kubun: 5, shiire: 1100000, noinv: 550000 });
  assert.equal(r.ready, true);
  assert.equal(r.base.uriageTax, 624000);                 // 8,000,000 × 7.8%
  const m = r.methods;
  assert.deepEqual([m.sanwari.kojo, m.sanwari.r.koku, m.sanwari.r.chiho, m.sanwari.r.total], [436800, 187200, 52800, 240000]);
  assert.deepEqual([m.kani.kojo, m.kani.r.koku, m.kani.r.chiho, m.kani.r.total], [312000, 312000, 88000, 400000]);
  // 本則: 1,100,000 × 7.8/110 ＝ 78,000、550,000 × 7.8/110 × 70% ＝ 27,300（令和8年10月〜令和10年9月は 70%）
  assert.equal(m.honsoku.kojo, 105300);
  assert.deepEqual([m.honsoku.r.koku, m.honsoku.r.chiho, m.honsoku.r.total], [518700, 146300, 665000]);
  assert.deepEqual(m.honsoku.noinvPct, [70]);
  assert.deepEqual([m.niwari.kojo, m.niwari.r.total], [499200, 160000]);
  assert.equal(r.best, 'sanwari');
  assert.equal(m.sanwari.available, true);
  assert.equal(m.niwari.available, false);                // 2割特例は令和8年分まで（参考として出すだけ）
});

// --- 問117-3: 小売業（第2種 80%）は簡易課税のほうが 3割特例より少ない。第3種（70%）は同じ
test('小売業（第2種）は簡易課税が少なく、第3種は3割特例と同じ', () => {
  const r2 = I.calc({ uriage: 8800000, kubun: 2 });
  assert.equal(r2.methods.kani.r.total, 160000);
  assert.equal(r2.best, 'kani');
  const r3 = I.calc({ uriage: 8800000, kubun: 3 });
  assert.equal(r3.methods.kani.r.total, r3.methods.sanwari.r.total);
  assert.equal(r3.ties.length, 1);
  const r6 = I.calc({ uriage: 8800000, kubun: 6 });
  assert.equal(r6.methods.kani.r.total, 480000);          // 624,000 × 60% ＝ 374,400 ＋ 105,600
  assert.equal(r6.best, 'sanwari');
});

test('みなし仕入率は 90・80・70・60・50・40%', () => {
  assert.deepEqual(V.kubun.map((k) => k.rate), [90, 80, 70, 60, 50, 40]);
});

// --- 本則課税は仕入れを入れたときだけ「いちばん少ない」の候補にする
test('仕入れが空なら本則課税を比べない', () => {
  const r = I.calc({ uriage: 1100000, kubun: 1 });
  assert.equal(r.methods.honsoku.shiireEntered, false);
  assert.equal(r.best, 'kani');
});

// --- 令和10年分: インボイスのない仕入れは 1〜9 月が 70%、10〜12 月が 50%
test('令和10年分はインボイスのない仕入れの割合が 10 月で変わる', () => {
  assert.deepEqual(I.keikaSegments(2027), [{ from: '2027-01-01', to: '2027-12-31', pct: 70 }]);
  assert.deepEqual(I.keikaSegments(2028), [{ from: '2028-01-01', to: '2028-09-30', pct: 70 }, { from: '2028-10-01', to: '2028-12-31', pct: 50 }]);
  assert.deepEqual(I.keikaSegments(2029), [{ from: '2029-01-01', to: '2029-12-31', pct: 50 }]);
  assert.deepEqual(I.keikaSegments(2026), [{ from: '2026-01-01', to: '2026-09-30', pct: 80 }, { from: '2026-10-01', to: '2026-12-31', pct: 70 }]);
  assert.deepEqual(I.keikaSegments(2032), []);
  const r = I.calc({ year: 2028, uriage: 8800000, noinv: 1100000, noinvLate: 330000 });
  // 770,000 × 7.8/110 × 70% ＝ 38,220、330,000 × 7.8/110 × 50% ＝ 11,700
  assert.equal(r.methods.honsoku.kojo, 38220 + 11700);
  assert.deepEqual(r.methods.honsoku.noinvPct, [70, 50]);
  // 10〜12 月分が全体より多く入っても全体を超えない
  assert.equal(I.calc({ year: 2028, uriage: 8800000, noinv: 110000, noinvLate: 999999 }).methods.honsoku.kojo, 3900);
  // 令和11年分は 1 年を通して 50%
  assert.equal(I.calc({ year: 2029, uriage: 8800000, noinv: 1100000 }).methods.honsoku.kojo, 39000);
});

// --- 使えるかの判定
test('3割特例は令和10年分まで・2年前の課税売上高1,000万円以下、簡易課税は5,000万円以下', () => {
  assert.equal(I.calc({ year: 2028, uriage: 1100000 }).methods.sanwari.available, true);
  assert.equal(I.calc({ year: 2029, uriage: 1100000 }).methods.sanwari.available, false);
  assert.equal(I.calc({ year: 2027, uriage: 1100000, kijun: 'le50m' }).methods.sanwari.available, false);
  assert.equal(I.calc({ year: 2027, uriage: 1100000, kijun: 'le50m' }).methods.kani.available, true);
  const g = I.calc({ year: 2027, uriage: 1100000, kijun: 'gt50m', shiire: 0 });
  assert.equal(g.methods.kani.available, false);
  assert.equal(g.best, 'honsoku');
  assert.equal(I.calc({ year: 2029, uriage: 8800000, kubun: 5 }).best, 'kani');
});

// --- 本則課税で仕入れの税額が売上の税額より多い → 還付の目安
test('本則課税の還付（控除しきれない税額）', () => {
  const r = I.calc({ uriage: 1100000, shiire: 3300000 });
  const h = r.methods.honsoku.r;
  assert.equal(h.refund, true);
  assert.equal(h.koku, 78000 - 234000);
  assert.equal(h.chiho, -44000);
  assert.equal(h.total, -200000);
  assert.equal(r.best, 'honsoku');
});

// --- 端数: 課税標準額は 1,000 円未満、差引税額と地方消費税は 100 円未満を切り捨て
test('端数の切り捨て', () => {
  const r = I.calc({ uriage: 1234567, kubun: 5 });
  assert.equal(r.base.zeinuki, 1122333);                  // 1,234,567 × 100/110 ＝ 1,122,333.6
  assert.equal(r.base.hyojun, 1122000);
  assert.equal(r.base.uriageTax, 87516);                  // 1,122,000 × 7.8%
  assert.equal(r.methods.kani.kojo, 43758);
  assert.equal(r.methods.kani.r.koku, 43700);             // 43,758 → 43,700
  assert.equal(r.methods.kani.r.chiho, 12300);            // 43,700 × 22/78 ＝ 12,325.6 → 12,300
  assert.equal(I.tax78of110(1000), 70);                   // 70.9 → 70
});

// --- 簡易課税の届出の期限（2割特例・3割特例の翌年分は、その年分の確定申告期限まで）
test('確定申告期限: 3月31日が土日なら翌平日（国税庁のリーフレットは令和11年分を令和12年4月1日と明記）', () => {
  for (const y of Object.keys(V.years)) {
    const k = V.years[y].kigen;
    const d = new Date(k + 'T00:00:00Z');
    assert.ok([1, 2, 3, 4, 5].includes(d.getUTCDay()), y + ' の期限 ' + k + ' が平日');
    const m31 = new Date((Number(y) + 1) + '-03-31T00:00:00Z');
    if ([1, 2, 3, 4, 5].includes(m31.getUTCDay())) assert.equal(k, (Number(y) + 1) + '-03-31');
    else assert.ok(k > (Number(y) + 1) + '-03-31' && k <= (Number(y) + 1) + '-04-02');
  }
  assert.equal(V.years[2029].kigen, '2030-04-01');
  assert.deepEqual(I.kaniDeadline(2027), { tokurei: '2028-03-31', normal: '2026-12-31' });
});

test('経過措置の割合（問130）: 80 → 70 → 50 → 30%', () => {
  assert.deepEqual(V.keika.map((k) => [k.from, k.to, k.pct]), [
    ['2023-10-01', '2026-09-30', 80], ['2026-10-01', '2028-09-30', 70], ['2028-10-01', '2030-09-30', 50], ['2030-10-01', '2031-09-30', 30],
  ]);
});

// --- 入力の正規化とファイル
test('入力の正規化: 空欄は null、範囲外は既定値', () => {
  const d = I.normalizeInput({ uriage: '1,100,000円', year: 2030, kubun: 9, kijun: 'x', shiire: '' });
  assert.equal(d.uriage, 1100000);
  assert.equal(d.year, 2027);
  assert.equal(d.kubun, 5);
  assert.equal(d.kijun, 'le10m');
  assert.equal(d.shiire, null);
  assert.equal(I.calc({}).ready, false);
  assert.deepEqual(I.calc({}).missing, ['uriage']);
});

test('ファイルの書き出し・読み込み', () => {
  const f = I.toExportFile({ uriage: 5500000, kubun: 2 }, new Date('2026-09-25T00:00:00Z'));
  assert.equal(f.tool, 'seido-keisan-invoice');
  assert.equal(f.version, 1);
  const back = I.fromExportFile(JSON.parse(JSON.stringify(f)));
  assert.equal(back.ok, true);
  assert.equal(back.data.uriage, 5500000);
  assert.equal(I.fromExportFile({ tool: 'seido-keisan-iryohi', version: 1, data: {} }).ok, false);
  assert.equal(I.fromExportFile({ tool: 'seido-keisan-invoice', version: 2, data: {} }).ok, false);
});

test('確認日と出典', () => {
  assert.match(V.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(V.SOURCES.length >= 10);
  V.SOURCES.forEach((s) => assert.match(s.url, /^https:\/\//));
});
