// 医療費控除の計算のテスト: node --test tests/*.test.js
// 期待値は所得税法 73条・89条、租税特別措置法 41条の17、国税庁の明細書の計算欄・タックスアンサー・記載例から写した
// （出典は lib/iryohi-values.js の SOURCES）
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../lib/iryohi.js');
const V = require('../lib/iryohi-values.js');
const TAX = require('../lib/tax2026.js');
const N = require('../lib/nenmatsu.js');

// --- 国税庁「医療費控除を受ける方の記載例」（令和2年分）: 給与 7,140,000円、源泉徴収票の所得控除の合計 3,269,196円、
//     医療費 500,000円・補てん 200,000円 → 控除 200,000円、所得税 92,800円 ＋ 復興 1,948円 ＝ 94,748円、源泉 110,300円 → 還付 15,552円
test('国税庁の記載例（給与 714万円・医療費 50万円・補てん 20万円）を 1 円まで再現する', () => {
  const r = I.calc({ hiyo: 500000, hoten: 200000, mode: 'kyuyo', income: 7140000, kojo: 3269196 });
  assert.equal(r.ready, true);
  assert.equal(r.shotoku, 5326000);                 // 記載例の給与所得 5,326,000円（7,140,000 × 90% − 1,100,000。令和8年分の表でも同じ）
  assert.equal(r.iryohi.c, 300000);
  assert.equal(r.iryohi.e, 266300);                 // 明細書の E（5,326,000 × 0.05）
  assert.equal(r.iryohi.f, 100000);
  assert.equal(r.kojo, 200000);
  assert.equal(r.tax.before.total, 110300);         // 記載例の源泉徴収税額（年末調整の年税額）
  assert.equal(r.tax.after.taxable, 1856000);
  assert.equal(r.tax.after.kijun, 92800);
  assert.equal(r.tax.after.fukko, 1948);
  assert.equal(r.tax.after.total, 94748);
  assert.equal(r.tax.refund, 15552);
  assert.equal(r.jumin, 20000);
  assert.equal(r.total, 35552);
});

test('所得の金額で入れても記載例と同じ（前後とも確定申告の計算）', () => {
  const r = I.calc({ hiyo: 500000, hoten: 200000, mode: 'shotoku', shotoku: 5326000, kojo: 3269196 });
  assert.equal(r.kojo, 200000);
  // 前: 2,056,000 × 10% − 97,500 = 108,100、＋ 2,270 = 110,370（100円未満を切り捨てない）
  assert.equal(r.tax.before.total, 110370);
  assert.equal(r.tax.refund, 110370 - 94748);
});

// --- 10万円と 5% の境目（総所得金額等 200万円） ---
test('総所得金額等 200万円の境目: 200万円未満は 5%、以上は 10万円', () => {
  assert.equal(I.iryohiKojo(300000, 0, 1999999).f, 99999);
  assert.equal(I.iryohiKojo(300000, 0, 2000000).f, 100000);
  assert.equal(I.iryohiKojo(300000, 0, 2000001).f, 100000);
  assert.equal(I.iryohiKojo(300000, 0, 10000000).f, 100000);
  assert.equal(I.iryohiKojo(300000, 0, 1000000).f, 50000);
  assert.equal(I.iryohiKojo(300000, 0, 1000019).e, 50000);   // 5% は 1 円未満切り捨て（明細書の計算欄）
  assert.equal(I.iryohiKojo(60000, 0, 1000000).kojo, 10000); // 10万円以下でも控除が出る
});

test('給与だけなら 令和8年分で収入 297万2千円未満が 5% の側（給与所得 1,997,600円 → 2,000,400円）', () => {
  assert.equal(I.kyuyoShotoku(2971999).value, 1997600);
  assert.equal(I.kyuyoShotoku(2972000).value, 2000400);
  assert.equal(I.calc({ hiyo: 150000, mode: 'kyuyo', income: 2971999, kojo: 0 }).iryohi.f, 99880);
  assert.equal(I.calc({ hiyo: 150000, mode: 'kyuyo', income: 2972000, kojo: 0 }).iryohi.f, 100000);
});

// --- 上限 200万円 ---
test('医療費控除の上限 200万円', () => {
  assert.deepEqual([I.iryohiKojo(2100000, 0, 5000000).kojo, I.iryohiKojo(2100000, 0, 5000000).capped], [2000000, false]);
  assert.deepEqual([I.iryohiKojo(2100001, 0, 5000000).kojo, I.iryohiKojo(2100001, 0, 5000000).capped], [2000000, true]);
  assert.equal(I.iryohiKojo(9000000, 1000000, 5000000).kojo, 2000000);
  assert.equal(I.iryohiKojo(2100000, 1, 5000000).kojo, 1999999);
});

// --- セルフメディケーション税制 ---
test('セルフメディケーション税制: 1万2千円を超える部分、8万8千円まで', () => {
  assert.equal(V.self.floor, 12000);
  assert.equal(V.self.cap, 88000);
  assert.equal(I.selfKojo(12000, 0).kojo, 0);
  assert.equal(I.selfKojo(12001, 0).kojo, 1);
  assert.equal(I.selfKojo(100000, 0).kojo, 88000);
  assert.equal(I.selfKojo(100000, 0).capped, false);
  assert.equal(I.selfKojo(100001, 0).kojo, 88000);
  assert.equal(I.selfKojo(100001, 0).capped, true);
  assert.equal(I.selfKojo(50000, 10000).kojo, 28000);   // 補てん額を引いてから
  assert.equal(I.selfKojo(5000, 9000).kojo, 0);
});

test('どちらか有利なほう（併用しない）', () => {
  const base = { mode: 'shotoku', shotoku: 3000000, kojo: 1500000 };
  // 医療費 12万円 → 通常 2万円、対象医薬品 5万円 → セルフ 3.8万円 → セルフ
  let r = I.calc({ ...base, hiyo: 120000, self: { use: true, torikumi: true, amount: 50000 } });
  assert.equal(r.iryohi.kojo, 20000);
  assert.equal(r.self.kojo, 38000);
  assert.equal(r.best, 'self');
  assert.equal(r.kojo, 38000);
  // 取組（健康診断など）がなければセルフは使えない
  r = I.calc({ ...base, hiyo: 120000, self: { use: true, torikumi: false, amount: 50000 } });
  assert.equal(r.best, 'iryohi');
  assert.equal(r.kojo, 20000);
  // 医療費 25万円 → 通常 15万円 > セルフ 8.8万円
  r = I.calc({ ...base, hiyo: 250000, self: { use: true, torikumi: true, amount: 200000 } });
  assert.equal(r.best, 'iryohi');
  assert.equal(r.kojo, 150000);
  // 同じ額なら通常の医療費控除のまま
  r = I.calc({ ...base, hiyo: 138000, self: { use: true, torikumi: true, amount: 50000 } });
  assert.equal(r.iryohi.kojo, 38000);
  assert.equal(r.best, 'iryohi');
  // 医療費を入れずにセルフだけでも計算する
  r = I.calc({ ...base, self: { use: true, torikumi: true, amount: 30000 } });
  assert.equal(r.ready, true);
  assert.equal(r.best, 'self');
  assert.equal(r.kojo, 18000);
  // どちらも 0 なら none
  r = I.calc({ ...base, hiyo: 90000 });
  assert.equal(r.best, 'none');
  assert.equal(r.total, 0);
});

// --- 所得税の速算表と税率の境目 ---
test('速算表: 1,805 万円までは年末調整の表と同じ、4,000 万円超は 45%', () => {
  for (const [upTo, pct, minus] of TAX.years[2026].sokusan) {
    const b = I.bracket(upTo);
    assert.deepEqual([b.pct, b.minus], [pct, minus], `${upTo}`);
  }
  const cases = [[1950000, 5], [1951000, 10], [3300000, 10], [3301000, 20], [6950000, 20], [6951000, 23],
    [9000000, 23], [9001000, 33], [18000000, 33], [18001000, 40], [40000000, 40], [40001000, 45]];
  for (const [t, pct] of cases) assert.equal(I.bracket(t).pct, pct, `${t}`);
  assert.equal(I.shinkokuTax(7000000).kijun, 974000);      // タックスアンサー No.2260 の具体例
  assert.equal(I.shinkokuTax(50000000).kijun, 50000000 * 45 / 100 - 4796000);
  // 税率の境目の両側で速算表がつながっている（195万円: 5% でも 10% − 97,500 でも 97,500円）
  assert.equal(I.shinkokuTax(1950000).kijun, 97500);
  assert.equal(I.shinkokuTax(1951000).kijun, 97600);
});

test('102.1%: 復興特別所得税は基準所得税額 × 2.1%（1円未満切り捨て）、年末調整は 100円未満切り捨て', () => {
  assert.equal(I.shinkokuTax(1856000).fukko, 1948);         // 92,800 × 2.1% = 1,948.8
  assert.equal(I.shinkokuTax(1856999).taxable, 1856000);    // 課税所得は 1,000円未満切り捨て
  assert.equal(I.nenchoTax(2056000).total, 110300);         // 108,100 × 102.1% = 110,370.1 → 110,300
  // 年末調整の計算（lib/nenmatsu.js）と同じ年税額になる
  const n = N.calc({ income: 5000000, shakai: 700000, withheld: 0 }, 2026);
  const r = I.calc({ hiyo: 0, mode: 'kyuyo', income: 5000000, kojo: n.kojo });
  assert.equal(r.tax.before.total, n.nenzei);
});

test('戻る所得税: 税率の中なら 控除額 × 税率 × 102.1%、境目をまたぐと前後の差', () => {
  // 課税所得 500万円（20%）から 10万円引く → 100,000 × 20% = 20,000、× 102.1% = 20,420
  let r = I.calc({ mode: 'shotoku', shotoku: 6000000, kojo: 1000000, hiyo: 200000 });
  assert.equal(r.kojo, 100000);
  assert.equal(r.tax.sameBracket, true);
  assert.equal(r.tax.refund, 20420);
  // 課税所得 200万円（10%）から 20万円引く → 5万円分は 10%、15万円分は 5%
  //   前 2,000,000×10%−97,500 = 102,500 ＋ 2,152 = 104,652、後 1,800,000×5% = 90,000 ＋ 1,890 = 91,890 → 12,762
  r = I.calc({ mode: 'shotoku', shotoku: 3000000, kojo: 1000000, hiyo: 300000 });
  assert.equal(r.kojo, 200000);
  assert.equal(r.tax.sameBracket, false);
  assert.equal(r.tax.before.total, 104652);
  assert.equal(r.tax.after.total, 91890);
  assert.equal(r.tax.refund, 12762);
});

test('税率を自分で選ぶ: 控除額 × 税率 × 102.1%', () => {
  const r = I.calc({ mode: 'shotoku', shotoku: 5000000, hiyo: 200000, rateMode: 'manual', rate: 10 });
  assert.equal(r.ready, true);                              // 所得控除の合計がなくても出る
  assert.equal(r.tax.refund, 10210);
  assert.equal(I.calc({ mode: 'shotoku', shotoku: 5000000, hiyo: 200000, rateMode: 'manual', rate: 33 }).tax.refund, 33693);
  assert.equal(I.normalizeInput({ rate: 7 }).rate, 10);     // 表にない税率は 10%
});

test('住民税の減額: 控除額 × 10%、含めないこともできる', () => {
  const on = I.calc({ mode: 'shotoku', shotoku: 4000000, kojo: 1500000, hiyo: 250000 });
  assert.equal(on.jumin, 15000);
  assert.equal(on.total, on.tax.refund + 15000);
  const off = I.calc({ mode: 'shotoku', shotoku: 4000000, kojo: 1500000, hiyo: 250000, jumin: false });
  assert.equal(off.jumin, null);
  assert.equal(off.total, off.tax.refund);
});

test('所得控除の合計がわからないとき: 社会保険料 ＋ 基礎控除（令和8年分）で見積もる', () => {
  const r = I.calc({ mode: 'kyuyo', income: 5000000, shakai: 700000, hiyo: 300000 });
  assert.equal(r.shotoku, 3560000);
  assert.equal(r.kojoTotal, 700000 + 1040000);              // 合計所得 489万円以下の基礎控除 104万円
  assert.equal(r.kojoEstimated, true);
  // 入れた所得控除の合計のほうを優先する
  assert.equal(I.calc({ mode: 'kyuyo', income: 5000000, shakai: 700000, kojo: 2000000, hiyo: 300000 }).kojoTotal, 2000000);
});

test('0・空欄・マイナス・課税所得なし', () => {
  // 必須が空なら結果なし
  let r = I.calc({});
  assert.equal(r.ready, false);
  assert.deepEqual(r.missing.sort(), ['hiyo', 'income', 'kojo']);
  r = I.calc({ hiyo: 300000, mode: 'shotoku' });
  assert.deepEqual(r.missing.sort(), ['kojo', 'shotoku']);
  // マイナス・文字は 0／空欄
  const d = I.normalizeInput({ hiyo: -5, hoten: 'abc', income: '1,000,000円', kojo: '' });
  assert.deepEqual([d.hiyo, d.hoten, d.income, d.kojo], [0, null, 1000000, null]);
  // 補てんが医療費より多い → 差引 0
  assert.equal(I.iryohiKojo(100000, 300000, 5000000).kojo, 0);
  // 所得 0 → 5% は 0、医療費の全額（補てん後）が控除
  assert.equal(I.iryohiKojo(30000, 0, 0).kojo, 30000);
  // 課税所得がない → 所得税は戻らない
  r = I.calc({ mode: 'kyuyo', income: 1500000, kojo: 1500000, hiyo: 300000 });
  assert.equal(r.tax.before.total, 0);
  assert.equal(r.tax.refund, 0);
  assert.equal(r.noTax, true);
  // 医療費 0 円
  r = I.calc({ mode: 'kyuyo', income: 5000000, kojo: 1800000, hiyo: 0 });
  assert.equal(r.ready, true);
  assert.equal(r.kojo, 0);
  assert.equal(r.total, 0);
  // 給与の収入 2,000万円超は 収入 − 195万円
  assert.equal(I.kyuyoShotoku(25000000).value, 23050000);
});

test('ファイルの書き出し・読み込み（D31）', () => {
  const data = { hiyo: 300000, hoten: 10000, mode: 'kyuyo', income: 5000000, kojo: 1800000, self: { use: true, torikumi: true, amount: 40000 }, jumin: false };
  const file = I.toExportFile(data, new Date('2026-09-24T00:00:00Z'));
  assert.equal(file.tool, 'seido-keisan-iryohi');
  assert.equal(file.version, 1);
  assert.equal(file.exportedAt, '2026-09-24T00:00:00.000Z');
  const back = I.fromExportFile(JSON.parse(JSON.stringify(file)));
  assert.equal(back.ok, true);
  assert.deepEqual(back.data, I.normalizeInput(data));
  assert.equal(I.fromExportFile({ tool: 'seido-keisan-nenmatsu', version: 1, data: {} }).ok, false);
  assert.equal(I.fromExportFile({ tool: 'seido-keisan-iryohi', version: 2, data: {} }).ok, false);
  assert.equal(I.fromExportFile(null).ok, false);
  assert.equal(I.fromExportFile({ tool: 'seido-keisan-iryohi', version: 1, data: { hiyo: -1, mode: 'x' } }).data.mode, 'kyuyo');
});

test('値と出典: 確認日と主な値', () => {
  assert.match(V.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(V.iryohi, { floor: 100000, pct: 5, cap: 2000000 });
  assert.equal(V.year, 2026);
  assert.ok(V.SOURCES.length >= 8);
  for (const s of V.SOURCES) assert.match(s.url, /^https:\/\/(laws\.e-gov\.go\.jp|www\.nta\.go\.jp)\//);
});
