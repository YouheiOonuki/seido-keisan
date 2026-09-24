// 脱退一時金の計算のテスト: node --test tests/*.test.js
// 期待値は日本年金機構「脱退一時金の制度」「国民年金の脱退一時金額」、保険料額表、請求書（英語）、
// 国税庁「退職所得の選択課税の記載例」から写した（出典は lib/dattai-values.js の SOURCES）。手で確かめた例は企画書 16 の 6 章
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/pension-refund.js');
const V = require('../lib/dattai-values.js');
const TEXT = require('../lib/pension-refund-text.js');
const IV = require('../lib/iryohi-values.js');

// ---------- 企画書 16 の 6 章の例 ----------
test('例1: 厚生年金 30 月・平均標準報酬額 30 万円・最終月 2026-08 → 810,000円、源泉 165,402円、還付 165,402円', () => {
  const r = P.calc({ ep: { months: 30, last: '2026-08', avg: 300000 } });
  assert.equal(r.ready, true);
  assert.equal(r.ep.rate, 2.7);                     // 18.3% × 1/2 × 30 = 2.745 → 2.7
  assert.equal(r.ep.amount, 810000);
  assert.equal(r.ep.withheld, 165402);
  assert.equal(r.ep.net, 644598);
  assert.equal(r.total, 644598);
  assert.equal(r.tax.cases.length, 1);
  assert.equal(r.tax.cases[0].years, 3);            // 30 月 → 3 年（切り上げ）
  assert.equal(r.tax.cases[0].kojo, 1200000);
  assert.equal(r.tax.cases[0].total, 0);
  assert.equal(r.tax.refundMin, 165402);
  assert.equal(r.tax.range, false);
});

test('例2: 厚生年金 72 月・平均 45 万円・最終月 2026-03 → 上限 60 月 5.5、還付は 493,297〜503,507円（勤続 5 年と 6 年）', () => {
  const r = P.calc({ ep: { months: 72, last: '2026-03', avg: 450000 } });
  assert.equal(r.ep.cap, 60);
  assert.equal(r.ep.n, 60);
  assert.equal(r.ep.rate, 5.5);
  assert.equal(r.ep.overCap, true);
  assert.equal(r.ep.amount, 2475000);
  assert.equal(r.ep.withheld, 505395);
  const [five, six] = r.tax.cases;
  assert.equal(five.years, 5);
  assert.equal(five.kojo, 2000000);
  assert.equal(five.taxable, 237000);               // (2,475,000 − 2,000,000) ÷ 2 = 237,500 → 237,000
  assert.equal(five.kijun, 11850);
  assert.equal(five.fukko, 248);
  assert.equal(five.total, 12098);
  assert.equal(six.years, 6);
  assert.equal(six.taxable, 37000);                 // (2,475,000 − 2,400,000) ÷ 2 = 37,500 → 37,000
  assert.equal(six.total, 1888);                    // 1,850 ＋ 38
  assert.equal(r.tax.refundMin, 493297);
  assert.equal(r.tax.refundMax, 503507);
  assert.equal(r.tax.range, true);
});

test('例3: 国民年金 20 月・最後に納めた月 2026-05 → 令和8年度の 18〜24 月 161,280円（源泉なし）', () => {
  const r = P.calc({ np: { months: 20, last: '2026-05' } });
  assert.equal(r.np.fy, 2026);
  assert.equal(r.np.n, 18);
  assert.equal(r.np.amount, 161280);
  assert.equal(r.withheld, 0);
  assert.equal(r.total, 161280);
  assert.equal(r.tax, null);                        // 国民年金は源泉徴収がないので還付の目安もない
});

test('例4: 国民年金 40 月・最後に納めた月 2021-03 → 36 月上限・令和2年度 297,720円', () => {
  const r = P.calc({ np: { months: 40, last: '2021-03' } });
  assert.equal(r.np.fy, 2020);
  assert.equal(r.np.cap, 36);
  assert.equal(r.np.n, 36);
  assert.equal(r.np.amount, 297720);
  assert.equal(r.np.overCap, true);
});

test('例5: 国民年金 4 月＋厚生年金 4 月 → どちらも 6 月未満で請求できない（合算しない）', () => {
  const r = P.calc({ np: { months: 4, last: '2026-05' }, ep: { months: 4, last: '2026-05', salary: 300000 } });
  assert.equal(r.ready, true);
  assert.equal(r.np.status, 'short');
  assert.equal(r.ep.status, 'short');
  assert.equal(r.payable, false);
  assert.equal(r.total, 0);
});

// ---------- 国税庁の記載例（退職所得の選択課税） ----------
test('国税庁の記載例①: 1,000万円・勤続 10 年 → 所得税 202,500円 ＋ 復興 4,252円 ＝ 206,752円、源泉 1,429,400円 → 還付 1,222,648円', () => {
  const t = P.sentakuTax(10000000, 10);
  assert.equal(t.kojo, 4000000);
  assert.equal(t.shotoku, 3000000);
  assert.equal(t.taxable, 3000000);
  assert.equal(t.pct, 10);
  assert.equal(t.kijun, 202500);
  assert.equal(t.fukko, 4252);
  assert.equal(t.total, 206752);
  assert.equal(1429400 - t.total, 1222648);
});

test('国税庁の記載例②（厚生年金の脱退一時金）: 291,478円 → 源泉 59,519円（1円未満切り捨て）、控除 80万円で税 0円', () => {
  assert.equal(P.withholding(291478), 59519);
  const t = P.sentakuTax(291478, 2);
  assert.equal(t.kojo, 800000);
  assert.equal(t.total, 0);
});

test('選択課税: 勤続 5 年以下は控除後 300万円を超える部分を 1/2 にしない、6 年以上はすべて 1/2', () => {
  // 500万円・2 年: 控除 80万円、x = 420万円 → 150万円 ＋ 120万円 = 270万円 → 270,000 − 97,500 = 172,500、復興 3,622
  const s = P.sentakuTax(5000000, 2);
  assert.equal(s.shotoku, 2700000);
  assert.equal(s.kijun, 172500);
  assert.equal(s.fukko, 3622);
  assert.equal(s.total, 176122);
  // 同じ額・6 年: 控除 240万円、x = 260万円 → 130万円 → 130,000 × 5% = 65,000、復興 1,365
  const l = P.sentakuTax(5000000, 6);
  assert.equal(l.shotoku, 1300000);
  assert.equal(l.total, 66365);
  // 控除額の最低 80万円: 1 年でも 80万円
  assert.equal(P.sentakuTax(1000000, 1).kojo, 800000);
  assert.equal(P.sentakuTax(1000000, 3).kojo, 1200000);
});

test('速算表は医療費控除の計算（所得税法 89条）と同じ税率・控除額', () => {
  assert.deepEqual(V.sokusan.map(b => [b[1], b[2]]), IV.sokusan.map(b => [b[1], b[2]]));
});

// ---------- 源泉徴収 ----------
test('源泉徴収は 20.42%（1円未満切り捨て）、厚生年金の分だけ', () => {
  assert.equal(P.withholding(810000), 165402);
  assert.equal(P.withholding(100001), 20420);       // 20,420.2042 → 20,420
  const r = P.calc({ ep: { months: 12, last: '2026-08', avg: 200000 }, np: { months: 12, last: '2026-08' } });
  assert.equal(r.ep.amount, 220000);                // 200,000 × 1.1
  assert.equal(r.withheld, P.withholding(220000));
  assert.equal(r.total, 220000 - P.withholding(220000) + 107520);
});

// ---------- 6 月の境目・6 月ごとの区分・上限 ----------
test('5 月は請求できない、6 月から（厚生年金・国民年金とも）', () => {
  assert.equal(P.calc({ ep: { months: 5, last: '2026-08', avg: 300000 } }).ep.status, 'short');
  const ep6 = P.calc({ ep: { months: 6, last: '2026-08', avg: 300000 } }).ep;
  assert.equal(ep6.status, 'ok');
  assert.equal(ep6.rate, 0.5);
  assert.equal(ep6.amount, 150000);
  assert.equal(P.calc({ np: { months: 5, last: '2026-08' } }).np.status, 'short');
  assert.equal(P.calc({ np: { months: 6, last: '2026-08' } }).np.amount, 53760);
});

test('6 月ごとの区分: 11 月は 6、12 月は 12、59 月は 54、60 月と 61 月は 60', () => {
  const rate = m => P.calc({ ep: { months: m, last: '2026-08', avg: 100000 } }).ep.rate;
  assert.equal(rate(11), 0.5);
  assert.equal(rate(12), 1.1);
  assert.equal(rate(59), 4.9);
  assert.equal(rate(60), 5.5);
  assert.equal(rate(61), 5.5);
  const np = m => P.calc({ np: { months: m, last: '2026-08' } }).np;
  assert.equal(np(59).amount, 483840);
  assert.equal(np(60).amount, 537600);
  assert.equal(np(60).overCap, false);
  assert.equal(np(61).amount, 537600);
  assert.equal(np(61).overCap, true);
});

test('上限は最終月で決まる: 厚生年金 2021-03 は 36 月（3.3）、2021-04 は 60 月（5.5）', () => {
  const a = P.calc({ ep: { months: 60, last: '2021-03', avg: 300000 } }).ep;
  assert.equal(a.cap, 36);
  assert.equal(a.rate, 3.3);
  assert.equal(a.overCap, true);
  const b = P.calc({ ep: { months: 60, last: '2021-04', avg: 300000 } }).ep;
  assert.equal(b.cap, 60);
  assert.equal(b.rate, 5.5);
  assert.equal(b.overCap, false);
});

test('上限は基準月で決まる: 国民年金 2021-03（令和2年度）は 36 月、2021-04（令和3年度）は 60 月', () => {
  const a = P.calc({ np: { months: 60, last: '2021-03' } }).np;
  assert.equal(a.cap, 36);
  assert.equal(a.amount, 297720);
  const b = P.calc({ np: { months: 60, last: '2021-04' } }).np;
  assert.equal(b.cap, 60);
  assert.equal(b.amount, 498300);
});

test('制度ごとに判定する: 厚生年金は 60 月上限、国民年金は 36 月上限が同時に起こる', () => {
  const r = P.calc({ ep: { months: 48, last: '2026-08', avg: 300000 }, np: { months: 40, last: '2020-12' } });
  assert.equal(r.ep.cap, 60);
  assert.equal(r.ep.rate, 4.4);
  assert.equal(r.np.cap, 36);
  assert.equal(r.np.amount, 297720);
});

test('対象の範囲: 厚生年金の最終月 2017-08 は対象外、2017-09 は 36 月の表', () => {
  assert.equal(P.calc({ ep: { months: 24, last: '2017-08', avg: 300000 } }).ep.status, 'outOfScope');
  const ep = P.calc({ ep: { months: 24, last: '2017-09', avg: 300000 } }).ep;
  assert.equal(ep.cap, 36);
  assert.equal(ep.rate, 2.2);
});

// ---------- 国民年金の年度の表 ----------
test('年度: 3 月は前の年度、4 月から新しい年度', () => {
  assert.equal(P.fiscalYear('2026-03'), 2025);
  assert.equal(P.fiscalYear('2026-04'), 2026);
  assert.equal(P.calc({ np: { months: 60, last: '2026-03' } }).np.amount, 525300);
  assert.equal(P.calc({ np: { months: 60, last: '2026-04' } }).np.amount, 537600);
});

test('国民年金の表: 平成25〜令和8年度の 14 年度分（機構のページの 6〜12 月未満と最後の行）', () => {
  // [年度, 6〜12月未満, 最後の行（60月以上 または 36月以上）]
  const page = [
    [2026, 53760, 537600], [2025, 52530, 525300], [2024, 50940, 509400], [2023, 49560, 495600], [2022, 49770, 497700], [2021, 49830, 498300],
    [2020, 49620, 297720], [2019, 49230, 295380], [2018, 49020, 294120], [2017, 49470, 296820],
    [2016, 48780, 292680], [2015, 46770, 280620], [2014, 45750, 274500], [2013, 45120, 270720],
  ];
  assert.deepEqual(Object.keys(V.kokunen).map(Number).sort(), page.map(p => p[0]).sort());
  for (const [fy, first, last] of page) {
    const t = V.kokunen[fy];
    assert.equal(t.length, fy >= 2021 ? 10 : 6, 'FY' + fy + ' の行数');
    assert.equal(t[0], first, 'FY' + fy + ' 6 月');
    assert.equal(t[t.length - 1], last, 'FY' + fy + ' 最後の行');
    t.forEach((v, i) => assert.equal(v, first * (i + 1), 'FY' + fy + ' ' + (i + 1) * 6 + ' 月（保険料 × 1/2 × 数）'));
    // 計算を通しても表の額になる
    const m = t.length * 6;
    assert.equal(P.calc({ np: { months: m, last: fy + '-04' } }).np.amount, last);
  }
  // 令和8年度の保険料 17,920円 × 1/2 × 60 = 537,600円
  assert.equal(17920 / 2 * 60, V.kokunen[2026][9]);
});

test('国民年金の対象の範囲: 基準月 2013-03 は対象外、2013-04 は平成25年度、2027-04 は未公表', () => {
  assert.equal(P.calc({ np: { months: 12, last: '2013-03' } }).np.status, 'outOfScope');
  assert.equal(P.calc({ np: { months: 12, last: '2013-04' } }).np.amount, 90240);
  const r = P.calc({ np: { months: 12, last: '2027-04' } });
  assert.equal(r.np.status, 'notPublished');
  assert.equal(r.np.fy, 2027);
  assert.equal(r.payable, false);
  assert.equal(P.calc({ np: { months: 12, last: '2027-03' } }).np.amount, 107520);
});

// ---------- 国民年金の一部免除 ----------
test('一部免除の数え方: 半額免除 2 月＝1 月、4分の1免除 4 月＝3 月、4分の3免除 4 月＝1 月', () => {
  // 納付 5 月 ＋ 半額免除 2 月 = 6 月 → 請求できる
  const a = P.calc({ np: { months: 5, half: 2, last: '2026-08' } }).np;
  assert.equal(a.months, 6);
  assert.equal(a.status, 'ok');
  assert.equal(a.amount, 53760);
  // 納付 5 月 ＋ 半額免除 1 月 = 5.5 月 → 6 月未満
  const b = P.calc({ np: { months: 5, half: 1, last: '2026-08' } }).np;
  assert.equal(b.months, 5.5);
  assert.equal(b.status, 'short');
  // 4分の1免除 8 月 = 6 月、4分の3免除 24 月 = 6 月
  assert.equal(P.calc({ np: { q1: 8, last: '2026-08' } }).np.months, 6);
  assert.equal(P.calc({ np: { q3: 24, last: '2026-08' } }).np.months, 6);
  assert.equal(P.calc({ np: { q3: 23, last: '2026-08' } }).np.status, 'short');
  // 納付 10 ＋ 4分の1免除 4（3）＋ 4分の3免除 4（1）= 14 月 → 12 の区分
  const c = P.calc({ np: { months: 10, q1: 4, q3: 4, last: '2026-08' } }).np;
  assert.equal(c.months, 14);
  assert.equal(c.n, 12);
  assert.equal(c.amount, 107520);
});

// ---------- 支給率の表 ----------
test('支給率の表は 18.3% × 1/2 × 数 を小数点以下 1 位に四捨五入した値（機構の 2 つの表と一致）', () => {
  const n = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60];
  assert.deepEqual(n.map(k => P.rateFromHokenryo(V.hokenryoRitsu, k)), V.shikyuritsu.from202104);
  assert.deepEqual(V.shikyuritsu.from202104, [0.5, 1.1, 1.6, 2.2, 2.7, 3.3, 3.8, 4.4, 4.9, 5.5]);
  assert.deepEqual(V.shikyuritsu.from201709, V.shikyuritsu.from202104.slice(0, 6));
  // 四捨五入の向き: 30 月 2.745 → 2.7、18 月 1.647 → 1.6、54 月 4.941 → 4.9
  assert.equal(P.rateFromHokenryo(18.3, 30), 2.7);
  assert.equal(P.rateFromHokenryo(18.3, 18), 1.6);
});

// ---------- 標準報酬月額・賞与 ----------
test('月給 → 標準報酬月額: 88,000円〜650,000円に収め、報酬月額の境目で等級が上がる', () => {
  assert.equal(V.grades.length, 32);
  assert.equal(P.gradeOf(0), 88000);
  assert.equal(P.gradeOf(92999), 88000);
  assert.equal(P.gradeOf(93000), 98000);
  assert.equal(P.gradeOf(289999), 280000);
  assert.equal(P.gradeOf(290000), 300000);
  assert.equal(P.gradeOf(309999), 300000);
  assert.equal(P.gradeOf(634999), 620000);
  assert.equal(P.gradeOf(635000), 650000);
  assert.equal(P.gradeOf(3000000), 650000);
  // 区切りは前の行の「未満」＝次の行の「以上」でつながり、標準報酬月額は増えていく
  for (let i = 1; i < V.grades.length; i++) assert.ok(V.grades[i][1] > V.grades[i - 1][1]);
});

test('標準賞与額: 1,000円未満切り捨て、1 回 150万円まで', () => {
  assert.equal(P.bonusStd(123456), 123000);
  assert.equal(P.bonusStd(1500999), 1500000);
  assert.equal(P.bonusStd(1600000), 1500000);
});

test('平均標準報酬額 ＝（標準報酬月額 × 月数 ＋ 標準賞与額の総額）÷ 月数', () => {
  // 月給 30 万円（300,000円の等級）× 24 月 ＋ 賞与 50 万円 × 4 回 → 9,200,000 ÷ 24 = 383,333.3…、× 2.2 = 843,333円
  const r = P.calc({ ep: { months: 24, last: '2026-08', salary: 300000, bonus: 500000, bonusCount: 4 } }).ep;
  assert.equal(r.grade, 300000);
  assert.equal(r.bonusTotal, 2000000);
  assert.equal(r.avg, 383333);
  assert.equal(r.amount, 843333);
  // 賞与の上限: 200万円 × 2 回 → 150万円 × 2 回
  const c = P.calc({ ep: { months: 12, last: '2026-08', salary: 700000, bonus: 2000000, bonusCount: 2 } }).ep;
  assert.equal(c.grade, 650000);
  assert.equal(c.bonusTotal, 3000000);
  assert.equal(c.amount, Math.floor((650000 * 12 + 3000000) * 11 / 120));
  // 平均標準報酬額を入れたら月給・賞与より優先
  const d = P.calc({ ep: { months: 24, last: '2026-08', salary: 300000, bonus: 500000, bonusCount: 4, avg: 350000 } }).ep;
  assert.equal(d.avgSource, 'direct');
  assert.equal(d.amount, 770000);
});

test('最終月が 2027-09 以降で月給から計算するときは、等級表の上限が変わる注意を出す', () => {
  assert.equal(P.calc({ ep: { months: 12, last: '2027-08', salary: 300000 } }).ep.newGradeTable, false);
  assert.equal(P.calc({ ep: { months: 12, last: '2027-09', salary: 300000 } }).ep.newGradeTable, true);
});

// ---------- 請求できない場合 ----------
test('請求できない: 日本国籍、障害年金などの受給権、加入期間 120 月以上', () => {
  const base = { ep: { months: 36, last: '2026-08', avg: 300000 } };
  for (const k of ['japanese', 'disability']) {
    const r = P.calc({ ...base, [k]: true });
    assert.deepEqual(r.blocked, [k]);
    assert.equal(r.payable, false);
    assert.equal(r.total, 0);
    assert.equal(r.tax, null);
  }
  // 厚生年金 100 月 ＋ 国民年金 20 月 = 120 月 → 請求できない。119 月なら請求できる
  const q = P.calc({ ep: { months: 100, last: '2026-08', avg: 300000 }, np: { months: 20, last: '2020-01' } });
  assert.deepEqual(q.blocked, ['qualify']);
  assert.equal(q.payable, false);
  const q2 = P.calc({ ep: { months: 100, last: '2026-08', avg: 300000 }, np: { months: 10, half: 9, last: '2020-01' } });
  assert.equal(q2.qualifyMonths, 119);
  assert.deepEqual(q2.blocked, []);
});

test('入力が足りないときは結果を出さない', () => {
  assert.equal(P.calc({}).ready, false);
  assert.deepEqual(P.calc({}).missing, ['any']);
  const a = P.calc({ ep: { months: 24 } });
  assert.equal(a.ready, false);
  assert.deepEqual(a.missing, ['ep.last', 'ep.salary']);
  const b = P.calc({ np: { months: 24 } });
  assert.deepEqual(b.missing, ['np.last']);
  assert.equal(P.calc({ ep: { months: 0, last: '2026-08' }, np: { months: 0 } }).ready, false);
});

// ---------- 還付の目安の切り替え ----------
test('還付の目安: 出さない設定・ほかの退職金ありのときは null', () => {
  const base = { ep: { months: 30, last: '2026-08', avg: 300000 } };
  assert.ok(P.calc(base).tax);
  assert.equal(P.calc({ ...base, refund: false }).tax, null);
  assert.equal(P.calc({ ...base, otherRetirement: true }).tax, null);
});

test('上限以内の人は勤続年数が 1 通り（37 月 → 4 年）', () => {
  const r = P.calc({ ep: { months: 37, last: '2026-08', avg: 300000 } });
  assert.equal(r.tax.cases.length, 1);
  assert.equal(r.tax.cases[0].years, 4);
});

// ---------- 期限・協定 ----------
test('請求の期限: 住所を有しなくなった日から 2 年', () => {
  assert.deepEqual(P.calc({ left: '2026-10-15' }).deadline, { from: '2026-10-15', to: '2028-10-15' });
  assert.equal(P.addYears('2028-02-29', 2), '2030-02-28');
  assert.equal(P.calc({ left: '2026-13-01' }).deadline, null);
});

test('社会保障協定: 24 か国、通算できる 20 か国と できない 4 か国（英国・韓国・中国・イタリア）', () => {
  assert.equal(V.kyotei.length, 24);
  assert.equal(V.kyotei.filter(k => k[4]).length, 20);
  assert.deepEqual(V.kyotei.filter(k => !k[4]).map(k => k[0]).sort(), ['cn', 'gb', 'it', 'kr']);
  const us = P.calc({ ep: { months: 30, last: '2026-08', avg: 300000 }, country: 'us' });
  assert.equal(us.kyotei.totalize, true);
  assert.equal(us.total, 644598);                   // 額は変えない
  assert.equal(P.calc({ country: 'kr' }).kyotei.totalize, false);
  assert.equal(P.calc({ country: 'xx' }).kyotei, null);
});

// ---------- 入力の正規化・ファイル ----------
test('年月の読み取り', () => {
  assert.equal(P.parseYm('2026-08'), '2026-08');
  assert.equal(P.parseYm('2026/8'), '2026-08');
  assert.equal(P.parseYm('2026年8月'), '2026-08');
  assert.equal(P.parseYm('2026-13'), null);
  assert.equal(P.parseYm(''), null);
  assert.equal(P.normalizeInput({ ep: { months: '1,000' } }).ep.months, 600);
  assert.equal(P.normalizeInput({ ep: { months: '-3' } }).ep.months, 0);
});

test('ファイルの書き出し・読み込み', () => {
  const data = { ep: { months: 30, last: '2026-08', avg: 300000 }, country: 'de' };
  const f = P.toExportFile(data, new Date('2026-09-24T00:00:00Z'));
  assert.equal(f.tool, 'seido-keisan-dattai');
  assert.equal(f.version, 1);
  const back = P.fromExportFile(JSON.parse(JSON.stringify(f)));
  assert.equal(back.ok, true);
  assert.deepEqual(back.data, P.normalizeInput(data));
  assert.equal(P.fromExportFile({ tool: 'other' }).code, 'notThisTool');
  assert.equal(P.fromExportFile({ tool: 'seido-keisan-dattai', version: 2, data: {} }).code, 'newerVersion');
});

// ---------- 文言（英語・日本語） ----------
test('TEXT: 英語と日本語でキーと型がそろっている', () => {
  const shape = o => Object.keys(o).sort().map(k => [k, typeof o[k] === 'object' ? shape(o[k]) : typeof o[k]]);
  assert.deepEqual(shape(TEXT.en), shape(TEXT.ja));
  // 画面が使う fromExportFile のエラーコードは両方にある
  for (const code of ['notThisTool', 'newerVersion', 'noData']) { assert.ok(TEXT.en[code]); assert.ok(TEXT.ja[code]); }
  assert.equal(TEXT.en.yen(1222648), '¥1,222,648');
  assert.equal(TEXT.ja.yen(1222648), '1,222,648円');
  assert.equal(TEXT.en.date('2028-10-15'), 'October 15, 2028');
  assert.equal(TEXT.ja.date('2028-10-15'), '2028年10月15日');
});

test('値の表: 確認日と出典', () => {
  assert.match(V.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(V.STALE_MONTHS, 12);
  for (const s of V.SOURCES) { assert.ok(s.label && s.en && s.where); assert.match(s.url, /^https:\/\//); }
});
