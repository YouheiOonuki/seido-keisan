// 年末調整の計算のテスト: node --test tests/*.test.js
// （.github/workflows/test.yml で push・PR のたびに自動実行される）
// 期待値は国税庁「令和8年分／令和7年分 年末調整のしかた」の原文（PDF）から写した。ページは lib/tax2026.js の SOURCES
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../lib/nenmatsu.js');
const TAX = require('../lib/tax2026.js');

// --- 給与所得控除後の給与等の金額: 表とは別に、計算の規則から求める ---
// 令和8年分（102.pdf 3 ページ・所得税法別表第五の作り方）:
//   741,000 円未満 0 / 741,000〜2,191,000 未満は 収入 − 740,000（令和8・9年分の特例）/
//   2,191,000〜2,193,000 未満 1,451,000・〜2,196,000 未満 1,453,000・〜2,200,000 未満 1,456,000（同）/
//   2,200,000〜6,600,000 未満は 4,000 円ごとの下の端 A で A×70%−80,000（360 万未満）・A×80%−440,000（360 万以上）/
//   6,600,000〜8,500,000 未満 収入×90%−1,100,000（1 円未満切り捨て）/ 8,500,000〜20,000,000 収入 − 1,950,000
// 令和7年分: 651,000 円未満 0 / 651,000〜1,900,000 未満は 収入 − 650,000 / 1,900,000 以上は上と同じ
function ruleKyuyo(x, year) {
  const r8 = year === 2026;
  if (x < (r8 ? 741000 : 651000)) return 0;
  if (r8 && x < 2191000) return x - 740000;
  if (!r8 && x < 1900000) return x - 650000;
  if (r8 && x < 2193000) return 1451000;
  if (r8 && x < 2196000) return 1453000;
  if (r8 && x < 2200000) return 1456000;
  if (x < 6600000) {
    const a = Math.floor(x / 4000) * 4000;
    return a < 3600000 ? a * 7 / 10 - 80000 : a * 8 / 10 - 440000;
  }
  if (x < 8500000) return Math.floor(x * 9 / 10) - 1100000;
  return x - 1950000;
}

for (const year of [2026, 2025]) {
  const t = TAX.years[year].kyuyoTable;
  test(`給与所得控除後の金額（${year}）: PDF から取り出した表の全行が規則と一致する`, () => {
    assert.ok(t.rows.length > 1000, `行数 ${t.rows.length}`);
    for (const [from, to, v] of t.rows) {
      assert.equal(v, ruleKyuyo(from, year), `${from} 以上の行`);
      assert.equal(v, ruleKyuyo(to - 1, year), `${to} 未満の行`);
      assert.equal(N.kyuyoShotoku(from, year).value, v);
      assert.equal(N.kyuyoShotoku(to - 1, year).value, v);
    }
    // 表の上と下の式の範囲も 1,000 円ごとに確かめる
    for (let x = 0; x <= 20000000; x += (x < 3000000 ? 1000 : 7777)) {
      assert.equal(N.kyuyoShotoku(x, year).value, ruleKyuyo(x, year), `${x} 円`);
    }
    assert.equal(N.kyuyoShotoku(20000000, year).value, 18050000);
    assert.equal(N.kyuyoShotoku(20000001, year), null);
  });
}

test('給与所得控除後の金額（令和8年分）: 境界', () => {
  const k = (x) => N.kyuyoShotoku(x, 2026).value;
  assert.equal(k(740999), 0);
  assert.equal(k(741000), 1000);
  assert.equal(k(2190999), 1450999);
  assert.equal(k(2191000), 1451000);
  assert.equal(k(2192999), 1451000);
  assert.equal(k(2193000), 1453000);
  assert.equal(k(2195999), 1453000);
  assert.equal(k(2196000), 1456000);
  assert.equal(k(2199999), 1456000);
  assert.equal(k(2200000), 1460000);
  assert.equal(k(2203999), 1460000);
  assert.equal(k(6599999), 4836800);
  assert.equal(k(6600000), 4840000);
  assert.equal(k(7654321), 5788888);    // 109.pdf 36 ページの例
  assert.equal(k(8499999), 6549999);
  assert.equal(k(8500000), 6550000);
  assert.equal(k(8970000), 7020000);    // 110rei.pdf 58 ページ
});

test('給与所得控除後の金額（令和7年分）: 境界', () => {
  const k = (x) => N.kyuyoShotoku(x, 2025).value;
  assert.equal(k(650999), 0);
  assert.equal(k(651000), 1000);
  assert.equal(k(1899999), 1249999);
  assert.equal(k(1900000), 1250000);
  assert.equal(k(2200000), 1460000);
});

test('基礎控除: 表の境界（令和8年分・令和7年分）', () => {
  const r8 = [[0, 1040000], [4890000, 1040000], [4890001, 670000], [6550000, 670000], [6550001, 620000], [23500000, 620000], [23500001, 480000], [24000001, 320000], [24500001, 160000], [25000000, 160000], [25000001, 0]];
  for (const [x, v] of r8) assert.equal(N.kisoKojo(x, 2026), v, `令和8年分 ${x}`);
  const r7 = [[1320000, 950000], [1320001, 880000], [3360000, 880000], [3360001, 680000], [4890000, 680000], [4890001, 630000], [6550000, 630000], [6550001, 580000], [23500000, 580000]];
  for (const [x, v] of r7) assert.equal(N.kisoKojo(x, 2025), v, `令和7年分 ${x}`);
});

test('特定親族特別控除: 表の境界（令和8年分は 62 万円超、令和7年分は 58 万円超）', () => {
  const one = (shotoku, year) => N.relativesKojo([{ age: '19-22', incomeType: 'shotoku', amount: shotoku }], year);
  const r8 = [[620000, 0, 630000], [620001, 630000, 0], [850000, 630000, 0], [850001, 610000, 0], [900001, 510000, 0], [950001, 410000, 0], [1000000, 410000, 0], [1000001, 310000, 0], [1050001, 210000, 0], [1100001, 110000, 0], [1150001, 60000, 0], [1200001, 30000, 0], [1230000, 30000, 0], [1230001, 0, 0]];
  for (const [x, tokutei, fuyo] of r8) {
    const r = one(x, 2026);
    assert.equal(r.tokutei, tokutei, `令和8年分 特定親族 ${x}`);
    assert.equal(r.fuyo, fuyo, `令和8年分 特定扶養 ${x}`);
  }
  assert.equal(one(580001, 2025).tokutei, 630000);
  assert.equal(one(580000, 2025).fuyo, 630000);
  assert.equal(one(620000, 2025).tokutei, 630000);   // 令和7年分では 62 万円は特定親族
  // 給与の収入で入れた場合（令和8年分は 136 万円以下なら扶養、136 万円超 197 万円以下なら特定親族）
  const kyuyo = (amount, year) => N.relativesKojo([{ age: '19-22', incomeType: 'kyuyo', amount }], year);
  assert.equal(kyuyo(1360000, 2026).fuyo, 630000);
  assert.equal(kyuyo(1361000, 2026).tokutei, 630000);
  assert.equal(kyuyo(1970000, 2026).tokutei, 30000);
  assert.equal(kyuyo(1971000, 2026).tokutei, 0);
  assert.equal(kyuyo(1230000, 2025).fuyo, 630000);
  assert.equal(kyuyo(1880000, 2025).tokutei, 30000);
  assert.equal(kyuyo(1881000, 2025).tokutei, 0);
});

test('扶養控除: 区分ごとの金額と所得要件', () => {
  const r = N.relativesKojo([
    { age: 'u16', amount: 0 }, { age: '16-18', amount: 0 }, { age: '19-22', amount: 0 },
    { age: '23-69', amount: 1360000 }, { age: '70', amount: 0 }, { age: '70dokyo', amount: 0, shogai: 'ippan' },
    { age: '23-69', amount: 1361000 },
  ], 2026);
  assert.equal(r.fuyo, 0 + 380000 + 630000 + 380000 + 480000 + 580000);
  assert.equal(r.shogai, 270000);
  assert.equal(r.hasU23, true);
  assert.equal(N.relativesKojo([{ age: '23-69', amount: 1360000 }], 2025).fuyo, 0);   // 令和7年分は 123 万円まで
  assert.equal(N.relativesKojo([{ age: '23-69', amount: 1230000 }], 2025).fuyo, 380000);
});

test('配偶者控除・配偶者特別控除: 本人と配偶者の所得の段階ごと（令和8年分）', () => {
  const h = (honnin, s, over70) => N.haigushaKojo(honnin, { has: true, incomeType: 'shotoku', amount: s, over70 }, 2026);
  assert.deepEqual([h(9000000, 620000).kind, h(9000000, 620000).amount], ['haigusha', 380000]);
  assert.equal(h(9000001, 620000).amount, 260000);
  assert.equal(h(9500001, 620000).amount, 130000);
  assert.equal(h(10000001, 0).amount, 0);
  assert.equal(h(9000000, 0, true).amount, 480000);
  assert.equal(h(9500000, 0, true).amount, 320000);
  assert.equal(h(10000000, 0, true).amount, 160000);
  const sp = [[620001, 380000], [950000, 380000], [950001, 360000], [1000001, 310000], [1050001, 260000], [1100001, 210000], [1150001, 160000], [1200001, 110000], [1250001, 60000], [1300001, 30000], [1330000, 30000], [1330001, 0]];
  for (const [s, v] of sp) assert.equal(h(5000000, s).amount, v, `配偶者 ${s}`);
  assert.equal(h(5000000, 620001).kind, 'tokubetsu');
  assert.equal(h(9500000, 1300001).amount, 20000);
  assert.equal(h(10000000, 1300001).amount, 10000);
  // 給与の収入で入れた場合: 136 万円以下は配偶者控除、207 万円超は 0（115.pdf 55 ページの参考欄）
  const k = (amount, year) => N.haigushaKojo(5000000, { has: true, incomeType: 'kyuyo', amount }, year);
  assert.equal(k(1360000, 2026).kind, 'haigusha');
  assert.equal(k(1361000, 2026).amount, 380000);
  assert.equal(k(1690000, 2026).amount, 380000);
  assert.equal(k(1691000, 2026).amount, 360000);
  assert.equal(k(2070000, 2026).amount, 30000);
  assert.equal(k(2071000, 2026).amount, 0);
  // 令和7年分: 123 万円以下は配偶者控除、2,015,999 円以下は 3 万円
  assert.equal(k(1230000, 2025).kind, 'haigusha');
  assert.equal(k(1231000, 2025).kind, 'tokubetsu');
  assert.equal(k(1600000, 2025).amount, 380000);
  assert.equal(k(1601000, 2025).amount, 360000);
  assert.equal(k(2015999, 2025).amount, 30000);
  assert.equal(k(2016000, 2025).amount, 0);
});

test('生命保険料控除: 23 歳未満の扶養親族あり／なし（107.pdf 24 ページの計算式Ⅰ〜Ⅲ）', () => {
  const s = (p, u23, year = 2026) => N.seimeiKojo(Object.assign({ newIppan: 0, oldIppan: 0, kaigo: 0, newNenkin: 0, oldNenkin: 0 }, p), u23, year);
  // 計算式Ⅰ（なし）
  assert.equal(s({ newIppan: 20000 }, false).ippan, 20000);
  assert.equal(s({ newIppan: 40000 }, false).ippan, 30000);
  assert.equal(s({ newIppan: 80000 }, false).ippan, 40000);
  assert.equal(s({ newIppan: 200000 }, false).ippan, 40000);
  assert.equal(s({ newIppan: 20001 }, false).ippan, 20001);   // 20,001 × 1/2 + 10,000 = 20,000.5 → 切り上げ
  // 計算式Ⅱ（あり）
  assert.equal(s({ newIppan: 30000 }, true).ippan, 30000);
  assert.equal(s({ newIppan: 60000 }, true).ippan, 45000);
  assert.equal(s({ newIppan: 120000 }, true).ippan, 60000);
  assert.equal(s({ newIppan: 120001 }, true).ippan, 60000);
  assert.equal(s({ newIppan: 30001 }, true).ippan, 30001);    // 30,001 × 1/2 + 15,000 = 30,000.5 → 切り上げ
  // 計算式Ⅲ（旧）
  assert.equal(s({ oldIppan: 25000 }, false).ippan, 25000);
  assert.equal(s({ oldIppan: 50000 }, false).ippan, 37500);
  assert.equal(s({ oldIppan: 100000 }, false).ippan, 50000);
  assert.equal(s({ oldIppan: 100001 }, true).ippan, 50000);
  // 新旧両方: なしは 4 万円、ありは 6 万円まで。大きいほう
  assert.equal(s({ newIppan: 80000, oldIppan: 35000 }, false).ippan, 40000);
  assert.equal(s({ newIppan: 80000, oldIppan: 35000 }, true).ippan, 60000);
  assert.equal(s({ newIppan: 10000, oldIppan: 100000 }, false).ippan, 50000);
  assert.equal(s({ newIppan: 10000, oldIppan: 100000 }, true).ippan, 60000);
  // 令和7年分には特例がない
  assert.equal(s({ newIppan: 120000 }, true, 2025).ippan, 40000);
  assert.equal(s({ newIppan: 80000, oldIppan: 35000 }, true, 2025).ippan, 40000);
  // 合計 12 万円まで
  assert.equal(s({ newIppan: 200000, kaigo: 200000, newNenkin: 200000 }, true).total, 120000);
  assert.equal(s({ newIppan: 200000, kaigo: 200000, newNenkin: 200000 }, false).total, 120000);
  assert.equal(s({ newIppan: 200000, kaigo: 200000 }, true).total, 100000);
});

test('地震保険料控除', () => {
  assert.equal(N.jishinKojo({ jishin: 30000, oldLong: 0 }, 2026), 30000);
  assert.equal(N.jishinKojo({ jishin: 60000, oldLong: 0 }, 2026), 50000);
  assert.equal(N.jishinKojo({ jishin: 0, oldLong: 10000 }, 2026), 10000);
  assert.equal(N.jishinKojo({ jishin: 0, oldLong: 14800 }, 2026), 12400);
  assert.equal(N.jishinKojo({ jishin: 0, oldLong: 30000 }, 2026), 15000);
  assert.equal(N.jishinKojo({ jishin: 42000, oldLong: 14800 }, 2026), 50000);
});

test('速算表・102.1%・100 円未満切り捨て・1,000 円未満切り捨て', () => {
  assert.equal(N.sokusan(2696000, 2026).value, 172100);   // 109.pdf 38 ページの例
  assert.equal(N.sokusan(1950000, 2026).value, 97500);
  assert.equal(N.sokusan(1951000, 2026).value, 97600);
  assert.equal(N.sokusan(3300000, 2026).value, 232500);
  assert.equal(N.sokusan(6950000, 2026).value, 962500);
  assert.equal(N.sokusan(9000000, 2026).value, 1434000);
  assert.equal(N.sokusan(18000000, 2026).value, 4404000);
  assert.equal(N.sokusan(18050000, 2026).value, 4424000);
  // 年調年税額: 10,000 × 1.021 = 10,210 → 10,200
  const r = N.calc({ income: 3000000, shakai: 0 }, 2026);
  const kyuyo = N.kyuyoShotoku(3000000, 2026).value;   // 2,020,000
  assert.equal(kyuyo, 2020000);
  assert.equal(r.taxable, 2020000 - 1040000);
  assert.equal(r.sanshutsu, 49000);
  assert.equal(r.nenzei, 50000);                        // 49,000 × 1.021 = 50,029 → 50,000
  const r2 = N.calc({ income: 3000000, shakai: 123 }, 2026);
  assert.equal(r2.taxable, 979000);                     // 979,877 → 979,000
  assert.equal(r2.sanshutsu, 48950);
  assert.equal(r2.nenzei, 49900);                       // 48,950 × 1.021 = 49,977.95 → 49,900
});

test('国税庁の設例（110rei.pdf 57〜59 ページ）を再現する', () => {
  const input = {
    income: 8970000, withheld: 156670, shakai: 1386102,
    seimei: { newIppan: 80000, oldIppan: 35000, kaigo: 80000, newNenkin: 30000, oldNenkin: 90000 },
    jishin: { jishin: 42000, oldLong: 14800 },
    spouse: { has: true, incomeType: 'shotoku', amount: 500000 },
    relatives: [
      { age: '23-69', amount: 0 },
      { age: '19-22', amount: 0 },
      { age: '70dokyo', amount: 0, shogai: 'ippan' },
      { age: '19-22', incomeType: 'shotoku', amount: 1000000 },
    ],
    jutaku: 76500,
  };
  // 設例は所得金額調整控除（このツールの画面では対象外）を含むので、テスト用のオプションで入れる
  const r = N.calc(input, 2026, { chosei: true });
  const step = (k) => r.steps.find((s) => s.key === k).amount;
  assert.equal(r.kyuyoShotoku, 7020000);
  assert.equal(step('chosei'), 47000);
  assert.equal(r.shotoku, 6973000);
  assert.equal(r.seimei.ippan, 60000);
  assert.equal(r.seimei.kaigo, 40000);
  assert.equal(r.seimei.nenkin, 47500);
  assert.equal(r.seimei.total, 120000);
  assert.equal(r.jishin, 50000);
  assert.equal(r.haigusha.amount, 380000);
  assert.equal(step('tokutei'), 410000);
  assert.equal(step('fuyo') + step('shogai'), 1860000);
  assert.equal(step('kiso'), 620000);
  assert.equal(r.kojo, 4826102);
  assert.equal(r.taxable, 2146000);
  assert.equal(r.sanshutsu, 117100);
  assert.equal(r.nencho, 40600);
  assert.equal(r.nenzei, 41400);
  assert.equal(r.diff, 115270);
  assert.equal(r.choseiMaybe, true);
  // 画面と同じ（所得金額調整控除なし）で計算すると、控除の分だけ税額が多くなる
  const plain = N.calc(input, 2026);
  assert.ok(plain.nenzei > r.nenzei);
});

test('住宅借入金等特別控除は算出所得税額まで', () => {
  const r = N.calc({ income: 3000000, jutaku: 200000 }, 2026);
  assert.equal(r.jutaku, 49000);
  assert.equal(r.jutakuLeft, 151000);
  assert.equal(r.nenzei, 0);
});

test('寡婦・ひとり親・勤労学生の所得要件', () => {
  const k = (r) => (key) => r.steps.find((s) => s.key === key).amount;
  assert.equal(k(N.calc({ income: 6777778, self: { kafu: 'hitorioya' } }, 2026))('kafu'), 350000);
  assert.equal(k(N.calc({ income: 6778000, self: { kafu: 'hitorioya' } }, 2026))('kafu'), 0);
  assert.equal(k(N.calc({ income: 1630000, self: { kinro: true } }, 2026))('kinro'), 270000);
  assert.equal(k(N.calc({ income: 1631000, self: { kinro: true } }, 2026))('kinro'), 0);
  assert.equal(k(N.calc({ income: 1500000, self: { kinro: true } }, 2025))('kinro'), 270000);
  assert.equal(k(N.calc({ income: 1501000, self: { kinro: true } }, 2025))('kinro'), 0);
});

test('対象外: 給与 2,000 万円超・課税給与所得 1,805 万円超', () => {
  const a = N.calc({ income: 20000001 }, 2026);
  assert.equal(a.ok, false);
  assert.equal(a.error, 'income');
  // 給与がちょうど 2,000 万円なら対象（18,050,000 − 基礎控除 62 万 = 1,743 万円 ≦ 1,805 万円）。
  // 給与のほかに所得がない前提では、課税給与所得金額が 1,805 万円を超えることはない
  const b = N.calc({ income: 20000000 }, 2026);
  assert.equal(b.ok, true);
  assert.equal(b.taxable, 17430000);
});

test('3 つの例（画面の確認に使う）', () => {
  const a = N.calc({ income: 5000000, withheld: 120000, shakai: 720000 }, 2026);
  assert.equal(a.kyuyoShotoku, 3560000);
  assert.equal(a.taxable, 3560000 - 720000 - 1040000);
  assert.equal(a.taxable, 1800000);
  assert.equal(a.sanshutsu, 90000);
  assert.equal(a.nenzei, 91800);                        // 90,000 × 1.021 = 91,890 → 91,800
  assert.equal(a.diff, 120000 - 91800);
  const a7 = N.calc({ income: 5000000, withheld: 120000, shakai: 720000 }, 2025);
  assert.equal(a7.taxable, 3560000 - 720000 - 680000);   // 令和7年分は 336 万超 489 万以下で基礎控除 68 万円
  const c = N.calc({ income: 1800000, withheld: 20000, shakai: 0 }, 2026);
  assert.equal(c.kyuyoShotoku, 1060000);
  assert.equal(c.taxable, 20000);
  assert.equal(c.nenzei, 1000);
  assert.equal(c.diff, 19000);
});

test('入力の正規化とファイルの書き出し・読み込み', () => {
  const n = N.normalizeInput({ income: '5,000,000', withheld: -3, relatives: [{ age: 'x', amount: 'abc', shogai: 'bad' }], spouse: { has: 1, incomeType: 'z' } });
  assert.equal(n.income, 5000000);
  assert.equal(n.withheld, 0);
  assert.deepEqual(n.relatives[0], { age: '23-69', incomeType: 'kyuyo', amount: 0, shogai: 'none' });
  assert.equal(n.spouse.has, true);
  assert.equal(n.spouse.incomeType, 'kyuyo');
  const f = N.toExportFile({ income: 1 }, new Date('2026-09-24T00:00:00Z'));
  assert.equal(f.tool, 'seido-keisan-nenmatsu');
  assert.equal(f.version, 1);
  assert.equal(f.exportedAt, '2026-09-24T00:00:00.000Z');
  const back = N.fromExportFile(JSON.parse(JSON.stringify(f)));
  assert.equal(back.ok, true);
  assert.equal(back.data.income, 1);
  assert.equal(N.fromExportFile({ tool: 'loan-sim', version: 1, data: {} }).ok, false);
  assert.equal(N.fromExportFile({ tool: 'seido-keisan-nenmatsu', version: 99, data: {} }).ok, false);
  assert.equal(N.fromExportFile(null).ok, false);
});

test('値の表: 出典と確認日がそろっている', () => {
  assert.match(TAX.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  for (const y of [2026, 2025]) {
    const v = TAX.years[y];
    assert.match(v.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(v.SOURCES.length >= 5);
    for (const s of v.SOURCES) {
      assert.ok(s.label && /^https:\/\/www\.nta\.go\.jp\//.test(s.url), `${y} ${s.key}`);
    }
    assert.ok(v.kyuyoTable && v.kyuyoTable.year === y, `${y} の表がつながっていない`);
    assert.match(v.kyuyoTable.source, new RegExp(`nencho${y}/pdf/114\\.pdf$`));
  }
});
