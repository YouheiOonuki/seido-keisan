// 手取りの計算（Japan take-home pay calculator、英語ページ）のテスト: node --test tests/*.test.js
// 1. 公式の表の値（協会けんぽ 東京支部の保険料額表 令和8年3月分から、厚労省の雇用保険料率）を 1 円まで再現する
// 2. 同じ入力で、日本語の年末調整（lib/nenmatsu.js）・住民税（lib/juminzei.js）・支援金（lib/shienkin.js）の計算と一致する
// 3. 値を写していない（ACCEPTANCE 3 章 K61）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../lib/take-home.js');
const TV = require('../lib/take-home-values.js');
const N = require('../lib/nenmatsu.js');
const J = require('../lib/juminzei.js');
const Sh = require('../lib/shienkin.js');

test('協会けんぽの保険料額表（東京支部、令和8年3月分から）の折半額を再現する', () => {
  // 額表の「折半額」: 健康保険 9.85%（介護なし）・介護あり 11.47%・支援金 0.23%・厚生年金 18.3%
  // 被保険者負担分は 50銭以下切り捨て・50銭超切り上げ（額表の注）
  const rows = [
    // [月給, 健康保険（介護なし）, 健康保険（介護あり）, 支援金, 厚生年金]
    [300000, 14775, 17205, 345, 27450],   // 22(19) 等級: 14,775.0 / 17,205.0 / 345.0 / 27,450.00
    [150000, 7387, 8602, 172, 13725],     // 12(9) 等級: 7,387.5 / 8,602.5 / 172.5 / 13,725.00（.5 は切り捨て）
    [360000, 17730, 20646, 414, 32940],   // 25(22) 等級: 17,730.0 / 20,646.0 / 414.0 / 32,940.00
    [260000, 12805, 14911, 299, 23790],   // 20(17) 等級: 12,805.0 / 14,911.0 / 299.0 / 23,790.00
  ];
  for (const [pay, h, hc, s, p] of rows) {
    const a = T.calc({ amount: pay, pref: 'tokyo' });
    assert.equal(a.month.health, h, pay + ' 健康保険');
    assert.equal(a.month.shien, s, pay + ' 支援金');
    assert.equal(a.month.pension, p, pay + ' 厚生年金');
    const b = T.calc({ amount: pay, pref: 'tokyo', over40: true });
    assert.equal(b.month.health, hc, pay + ' 健康保険＋介護');
  }
});

test('厚生年金の標準報酬月額は 88,000〜650,000円で頭打ち（健康保険は 1,390,000円まで）', () => {
  const r = T.calc({ amount: 1000000 });
  assert.equal(r.month.hyojun, 980000);
  assert.equal(r.month.hyojunPension, 650000);
  assert.equal(r.month.pension, 59475);   // 650,000 × 18.3% ÷ 2 = 59,475
  assert.equal(r.pensionCapped, true);
});

test('雇用保険: 賃金 × 5/1,000（令和8年度・一般の事業）。50銭以下切り捨て・50銭1厘以上切り上げ', () => {
  assert.equal(TV.koyo.perMille, 5);
  assert.equal(T.koyoPremium(200000), 1000);
  assert.equal(T.koyoPremium(300000), 1500);
  assert.equal(T.koyoPremium(100099), 500);   // 500.495円
  assert.equal(T.koyoPremium(100100), 500);   // 500.50円 → 50銭は切り捨て
  assert.equal(T.koyoPremium(100101), 501);   // 500.505円 → 50銭5厘は切り上げ
  assert.equal(T.calc({ amount: 300000 }).month.koyo, 1500);
});

test('支援金の月額は「いくら引かれる」の計算（lib/shienkin.js）と同じ', () => {
  for (const pay of [88000, 200000, 300000, 455000, 1500000]) {
    const a = T.calc({ amount: pay });
    const s = Sh.calc({ kind: 'kaisha', mode: 'salary', amount: pay });
    assert.equal(a.month.shien, Sh.deductYen(s.selfSen), String(pay));
  }
});

// 同じ入力を日本語の計算機の形にして比べる
function same(input) {
  const r = T.calc(input);
  const d = T.normalizeInput(input);
  const fam = T.familyInput(d);
  const nen = N.calc({ income: r.year.gross, withheld: 0, shakai: r.year.si, spouse: fam.spouse, relatives: fam.relatives }, 2026);
  const jum = J.calc({ income: r.year.gross, shakai: r.year.si, spouse: fam.spouse, relatives: fam.relatives }, 2027);
  return { r, nen, jum };
}

test('所得税・住民税は日本語の年末調整・住民税の計算と同じ入力で 1 円まで一致する', () => {
  const cases = [
    { amount: 300000 },
    { period: 'year', amount: 5000000 },
    { amount: 400000, bonus: 1000000, over40: true, spouse: { has: true, income: 0 }, kids: { u16: 1, a16: 1 } },
    { amount: 250000, spouse: { has: true, income: 1300000 }, kids: { a19: 1 } },
    { period: 'year', amount: 12000000, bonus: 3000000, bonusCount: 2, pref: 'osaka' },
    { amount: 120000 },
  ];
  for (const c of cases) {
    const { r, nen, jum } = same(c);
    assert.equal(r.year.incomeTax, nen.nenzei, JSON.stringify(c) + ' 所得税');
    assert.equal(r.tax.taxable, nen.taxable);
    assert.equal(r.resident.total, jum.total, JSON.stringify(c) + ' 住民税');
    assert.equal(r.resident.month, jum.installments.tokubetsu.rest);
  }
});

test('手で確かめた例: 月給 300,000円・東京・40歳未満・扶養なし・賞与なし', () => {
  const r = T.calc({ amount: 300000 });
  // 社会保険料 14,775 + 345 + 27,450 + 1,500 = 44,070 円/月、年 528,840 円
  assert.equal(r.month.si, 44070);
  assert.equal(r.year.si, 528840);
  // 所得税: 給与所得 3,600,000 → 2,440,000（令和8年分の表）。控除 528,840 ＋ 基礎控除 1,040,000 ＝ 1,568,840
  // 課税所得 871,000（1,000円未満切り捨て）× 5% ＝ 43,550 × 102.1% ＝ 44,464 → 44,400（100円未満切り捨て）
  assert.equal(r.tax.kyuyo, 2440000);
  assert.equal(r.tax.kojo, 1568840);
  assert.equal(r.tax.taxable, 871000);
  assert.equal(r.year.incomeTax, 44400);
  // 住民税（令和9年度）: 控除 528,840 ＋ 基礎控除 430,000 → 課税 1,481,000。× 10% ＝ 148,100、調整控除 2,500 → 145,600 → 所得割 145,500（道府県 4%・市町村 6% それぞれ 100円未満切り捨て）
  // ＋ 均等割 4,000 ＋ 森林環境税 1,000 ＝ 150,500。特別徴収は 7 月〜翌年 5 月が 12,500、6 月が 13,000
  assert.equal(r.resident.taxable, 1481000);
  assert.equal(r.resident.total, 150500);
  assert.equal(r.resident.month, 12500);
  assert.equal(r.resident.first, 13000);
  // 月の所得税は年の税額を給与に比例して割る（賞与なしなら 12 等分の切り捨て）
  assert.equal(r.month.incomeTax, 3700);
  assert.equal(r.month.net, 300000 - 44070 - 3700 - 12500);
  assert.equal(r.year.net, 3600000 - 528840 - 44400 - 150500);
});

test('賞与: 標準賞与額は 1,000円未満切り捨て。厚生年金は 1 回 150万円、健康保険は年度 573万円まで', () => {
  const r = T.calc({ amount: 500000, bonus: 2000999, bonusCount: 1 });
  const b = r.bonuses[0];
  assert.equal(b.std, 2000000);
  assert.equal(b.pension, 137250);         // 1,500,000 × 18.3% ÷ 2
  assert.equal(b.health, 98500);           // 2,000,000 × 9.85% ÷ 2
  assert.equal(b.shien, 2300);             // 2,000,000 × 0.23% ÷ 2
  assert.equal(b.koyo, 10005);             // 2,000,999 × 5/1,000 ＝ 10,004.995 → 10,005
  const big = T.calc({ amount: 500000, bonus: 9000000, bonusCount: 3 });
  assert.deepEqual(big.bonuses.map(x => x.healthStd), [3000000, 2730000, 0]);
  assert.deepEqual(big.bonuses.map(x => x.std), [3000000, 3000000, 3000000]);
});

test('賞与の端数は最後の回に寄せ、所得税は給与の額に比例して割る', () => {
  const r = T.calc({ amount: 300000, bonus: 1000001, bonusCount: 2 });
  assert.deepEqual(r.bonuses.map(b => b.gross), [500000, 500001]);
  assert.equal(r.year.gross, 3600000 + 1000001);
  const t = r.year.incomeTax;
  assert.equal(r.month.incomeTax, Math.floor(t * 300000 / r.year.gross));
  assert.equal(r.bonuses[0].incomeTax, Math.floor(t * 500000 / r.year.gross));
});

test('年で入れたときは入れた額を年収にし、賞与を引いて 12 で割った額を月給にする', () => {
  const r = T.calc({ period: 'year', amount: 5000000, bonus: 1000000 });
  assert.equal(r.year.gross, 5000000);
  assert.equal(r.month.gross, 333333);
  // 賞与が年収より多いときは年収まで
  const r2 = T.calc({ period: 'year', amount: 500000, bonus: 900000, bonusCount: 1 });
  assert.equal(r2.month.gross, 0);
  assert.equal(r2.bonuses[0].gross, 500000);
});

test('住民税を「まだ無い」にすると、月と年の手取りから外し、来年 6 月からの額を残す', () => {
  const a = T.calc({ amount: 300000 });
  const b = T.calc({ amount: 300000, juminNow: 'none' });
  assert.equal(b.month.resident, 0);
  assert.equal(b.month.net, a.month.net + a.month.resident);
  assert.equal(b.year.resident, 0);
  assert.equal(b.resident.month, a.resident.month);
  assert.equal(b.resident.paying, false);
});

test('年収 2,000万円を超えると年末調整の対象外として結果を出さない', () => {
  const r = T.calc({ period: 'year', amount: 20000001 });
  assert.equal(r.ready, false);
  assert.equal(r.error, 'over');
  assert.equal(T.calc({ period: 'year', amount: 20000000 }).ready, true);
});

test('入力の正規化とファイルの書き出し・読み込み', () => {
  const d = T.normalizeInput({ period: 'x', amount: '¥300,000', bonusCount: '9', pref: 'nowhere', kids: { u16: 99 } });
  assert.equal(d.period, 'month');
  assert.equal(d.amount, 300000);
  assert.equal(d.bonusCount, 2);
  assert.equal(d.pref, 'tokyo');
  assert.equal(d.kids.u16, 10);
  const f = T.toExportFile({ amount: 1 }, new Date('2026-10-01T00:00:00Z'));
  assert.equal(f.tool, 'seido-keisan-take-home');
  assert.deepEqual(T.fromExportFile(f), { ok: true, data: T.normalizeInput({ amount: 1 }) });
  assert.equal(T.fromExportFile({ tool: 'other' }).code, 'otherTool');
  assert.equal(T.fromExportFile({ tool: f.tool, version: 99, data: {} }).code, 'newer');
  assert.equal(T.fromExportFile(null).code, 'notJson');
  assert.equal(T.calc({}).ready, false);
});

test('値を写していない: 手取りの計算は率・控除額を数字で持たず、ほかの値ファイルを読む', () => {
  const src = fs.readFileSync(path.join(__dirname, '../lib/take-home.js'), 'utf8').replace(/\/\/.*$/gm, '');
  for (const v of ['9.85', '18.3', '0.23', '1.62', '1040000', '430000', '5730000', '1500000', '102.1', '1021']) {
    assert.ok(!src.includes(v), 'lib/take-home.js に ' + v + ' がある');
  }
  const vals = fs.readFileSync(path.join(__dirname, '../lib/take-home-values.js'), 'utf8').replace(/\/\/.*$/gm, '');
  for (const v of ['9.85', '18.3', '0.23', '1.62', '1040000']) assert.ok(!vals.includes(v), 'lib/take-home-values.js に ' + v + ' がある');
  // 英語ページは日本語の計算機と同じ値ファイルを読み込む
  const html = fs.readFileSync(path.join(__dirname, '../en/take-home-pay/index.html'), 'utf8');
  for (const f of ['tax2026.js', 'nenmatsu.js', 'juminzei-values.js', 'juminzei.js', 'ikukyu-values.js', 'shienkin-values.js']) {
    assert.ok(html.includes('../../lib/' + f), f);
  }
});

test('英語ページと年末調整のページは hreflang で互いを指す', () => {
  const pairs = [
    ['en/take-home-pay/index.html', 'nenmatsu/index.html', 'https://yorozu-craft.com/seido-keisan/en/take-home-pay/', 'https://yorozu-craft.com/seido-keisan/nenmatsu/'],
    ['en/take-home-pay/guide.html', 'nenmatsu/guide.html', 'https://yorozu-craft.com/seido-keisan/en/take-home-pay/guide.html', 'https://yorozu-craft.com/seido-keisan/nenmatsu/guide.html'],
  ];
  for (const [en, ja, enUrl, jaUrl] of pairs) {
    for (const f of [en, ja]) {
      const h = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      assert.ok(h.includes('hreflang="en" href="' + enUrl + '"'), f + ' en');
      assert.ok(h.includes('hreflang="ja" href="' + jaUrl + '"'), f + ' ja');
      assert.ok(h.includes('hreflang="x-default" href="' + jaUrl + '"'), f + ' x-default');
    }
  }
});
