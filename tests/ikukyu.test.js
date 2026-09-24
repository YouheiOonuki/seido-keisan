// 育休・産休の給付の計算のテスト: node --test tests/*.test.js
// 期待値は健康保険法・雇用保険法（e-Gov 法令検索の原文）、厚生労働省のリーフレット（2026年8月1日改訂版）と
// 支給限度額の案内、協会けんぽの案内・保険料額表の数字から写した。出典は lib/ikukyu-values.js の SOURCES
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../lib/ikukyu.js');
const IV = require('../lib/ikukyu-values.js');

const d = I.parseDate;
const days = (r) => r.map((p) => [I.fmt(p.start), I.fmt(p.end), p.days, p.d67, p.amount]);

// --- 公表されている計算例を 1 円まで再現する ---

test('協会けんぽ「出産手当金」の支給額例: 標準報酬月額の平均 17万円 → 1日 3,780円', () => {
  // （16万円×6＋18万円×6）÷12＝17万円、17万円÷30≒5,670円（10円未満四捨五入）、5,670円×2/3＝3,780円（1円未満四捨五入）
  const t = I.teateDaily(170000, false);
  assert.equal(t.per30, 5670);
  assert.equal(t.daily, 3780);
});

test('厚労省リーフレット p.16〜17: 賃金日額 10,000円の育児休業給付金と出生後休業支援給付金', () => {
  // 10,000円×30日×67%＝201,000円、10,000円×28日×13%＝36,400円
  const p = I.ikukyuPeriods(d('2027-01-01'), d('2027-12-31'), 10000, 0);
  assert.equal(p[0].amount, 201000);
  assert.equal(p[0].days, 30);
  const r = I.calc({ role: 'father', wage6: 1800000, dueDate: '2027-01-10', leaveStart: '2027-01-10', leaveEnd: '2027-06-30' });
  assert.equal(r.wage.daily, 10000);
  assert.equal(r.shien.ok, true);
  assert.equal(r.shien.days, 28);
  assert.equal(r.shien.amount, 36400);
  assert.equal(r.leave.periods[0].amount, 201000);
});

test('厚労省リーフレット p.5: 賃金日額 10,000円で14日の産後パパ育休 → 93,800円＋18,200円', () => {
  const r = I.calc({ role: 'father', wage6: 1800000, dueDate: '2027-01-10', papa: { use: true, start: '2027-01-10', end: '2027-01-23' }, leaveStart: '2027-06-01', leaveEnd: '2027-06-30' });
  assert.equal(r.papa.paidDays, 14);
  assert.equal(r.papa.amount, 93800);
  assert.equal(r.shien.ok, true);
  assert.equal(r.shien.days, 14);
  assert.equal(r.shien.amount, 18200);
});

test('支給上限額・下限額（令和8年8月1日〜令和9年7月31日）を再現する', () => {
  const k = IV.koyo;
  assert.equal(k.dailyMax, 16540);
  assert.equal(k.dailyMin, 3203);
  const hi = I.ikukyuPeriods(d('2027-01-01'), d('2027-12-31'), k.dailyMax, 0);
  assert.equal(hi[0].amount, 332454);           // 67%
  assert.equal(hi[6].amount, 248100);           // 50%（7回目＝181日目から）
  const lo = I.ikukyuPeriods(d('2027-01-01'), d('2027-12-31'), k.dailyMin, 0);
  assert.equal(lo[0].amount, 64380);
  assert.equal(lo[6].amount, 48045);
  // 出生後休業支援給付金 28日: 上限 60,205円・下限 11,658円。出生時育児休業給付金 28日: 上限 310,290円
  assert.equal(Math.floor(k.dailyMax * 28 * 13 / 100), 60205);
  assert.equal(Math.floor(k.dailyMin * 28 * 13 / 100), 11658);
  const r = I.calc({ role: 'father', wage6: 6000000, dueDate: '2027-01-10', papa: { use: true, start: '2027-01-10', end: '2027-02-06' }, leaveEnd: '2027-06-30' });
  assert.equal(r.wage.capped, 'max');
  assert.equal(r.papa.amount, 310290);
  assert.equal(r.shien.amount, 60205);
  // 賃金月額の上限・下限（日額×30）
  assert.equal(k.dailyMax * 30, 496200);
  assert.equal(k.dailyMin * 30, 96090);
});

test('育児時短就業給付金: 厚労省リーフレットの例①〜③', () => {
  const a = I.jitanAmount(300000, 200000);
  assert.equal(a.amount, 20000);                 // 90%以下 → 10%
  const b = I.jitanAmount(300000, 280000);
  assert.equal(b.pct, 6.43);                     // 9,000÷93.33−90＝6.43%
  assert.equal(b.amount, 18004);
  const c = I.jitanAmount(496200, 445000);
  assert.equal(c.amount, 39121);                 // 484,121 − 445,000
});

test('育児時短就業給付金の支給率早見表（賃金率→支給率）', () => {
  // 賃金率 95.00% → 4.74%、91.00% → 8.90%、99.50% → 0.45%、90.00% → 10.00%
  [[95, 4.74], [91, 8.9], [99.5, 0.45], [90, 10]].forEach(([x, y]) => {
    assert.equal(I.jitanAmount(1000000, 1000000 * x / 100 / 3).pct, 10);   // 比較用: 90%以下は 10%
    const r = I.jitanAmount(400000, 400000 * x / 100);
    assert.equal(r.pct, y, `賃金率 ${x}%`);
  });
  assert.equal(I.jitanAmount(300000, 300000).amount, 0);      // 100%以上は支給なし
  assert.equal(I.jitanAmount(600000, 490000).amount, 0);      // 支給限度額 484,121円以上は支給なし
  assert.equal(I.jitanAmount(300000, 299000).amount, 0);      // 計算した額 1,345円が最低限度額 2,562円以下
});

test('協会けんぽの保険料額表（東京・令和8年度）: 標準報酬月額 30万円の被保険者負担分', () => {
  // 健康保険 9.85% 折半 14,775円、介護あり 11.47% 折半 17,205円、支援金 0.23% 折半 345円、厚生年金 18.300% 折半 27,450円
  const p = I.monthlyPremium(300000, 2027 * 12 + 0, I.normalizeInput({ pref: 'tokyo' }));
  assert.equal(p.kenpo, 14775);
  assert.equal(p.shien, 345);
  assert.equal(p.kounen, 27450);
  const q = I.monthlyPremium(300000, 2027 * 12 + 0, I.normalizeInput({ pref: 'tokyo', over40: true }));
  assert.equal(q.kenpo, 17205);
  // 50銭の端数: 標準報酬 58,000円 → 2,856.5円は切り捨て（50銭以下）
  assert.equal(I.monthlyPremium(58000, 2027 * 12, I.normalizeInput({ pref: 'tokyo' })).kenpo, 2856);
  // 令和8年3月分は支援金なし
  assert.equal(I.monthlyPremium(300000, 2026 * 12 + 2, I.normalizeInput({ pref: 'tokyo' })).shien, 0);
});

// --- 日数の数え方 ---

test('出産手当金の期間: 予定日どおり 42＋56＝98日、出産日は産前に入る', () => {
  const p = I.teatePeriod(d('2027-03-10'), d('2027-03-10'), false);
  assert.equal(I.fmt(p.start), '2027-01-28');    // 3/10 を含めて 42 日前
  assert.equal(I.fmt(p.end), '2027-05-05');      // 3/11 から 56 日目
  assert.equal(p.sanzen, 42);
  assert.equal(p.days, 98);
});

test('出産手当金の期間: 多胎は産前 98日（98＋56＝154日）', () => {
  const p = I.teatePeriod(d('2027-03-10'), d('2027-03-10'), true);
  assert.equal(p.sanzen, 98);
  assert.equal(p.days, 154);
});

test('出産手当金の期間: 予定日より 5日遅れたら、遅れた日数も支給（42＋5＋56＝103日）', () => {
  const p = I.teatePeriod(d('2027-03-10'), d('2027-03-15'), false);
  assert.equal(I.fmt(p.start), '2027-01-28');    // 始まりは予定日から数える
  assert.equal(p.late, 5);
  assert.equal(p.days, 103);
  assert.equal(I.fmt(p.end), '2027-05-10');
});

test('出産手当金の期間: 予定日より早く生まれたら、出産日から数える（42＋56）', () => {
  const p = I.teatePeriod(d('2027-03-10'), d('2027-03-05'), false);
  assert.equal(I.fmt(p.start), '2027-01-23');
  assert.equal(p.days, 98);
});

test('出産手当金: 加入12か月未満は 32万円と比べて少ないほう', () => {
  const t = I.teateDaily(360000, true);
  assert.equal(t.base, 320000);
  assert.equal(t.per30, 10670);                  // 10,666.6… → 10,670
  assert.equal(t.daily, 7113);                   // 7,113.3… → 7,113
  assert.equal(I.teateDaily(240000, true).base, 240000);
});

test('産後パパ育休・出生後休業支援給付金の対象期間（厚労省リーフレットの例）', () => {
  // 例1: 予定日 10/1、出生日 10/5 → 8週間を経過する日の翌日は 11/30
  let r = I.calc({ role: 'father', salary: 300000, dueDate: '2026-10-01', birthDate: '2026-10-05', leaveStart: '2026-10-05' });
  assert.equal(I.fmt(r.shien.windowStart), '2026-10-01');
  assert.equal(I.fmt(r.shien.windowEnd), '2026-11-30');
  // 例2: 出生日 10/1、予定日 10/6 → 12/1
  r = I.calc({ role: 'father', salary: 300000, dueDate: '2026-10-06', birthDate: '2026-10-01', leaveStart: '2026-10-01' });
  assert.equal(I.fmt(r.shien.windowEnd), '2026-12-01');
  // 母（産後休業あり）: 16週間を経過する日の翌日。例3 出生日 10/5 → 1/25、例4 予定日 10/6 → 1/26
  r = I.calc({ role: 'mother', salary: 300000, dueDate: '2026-10-01', birthDate: '2026-10-05' });
  assert.equal(I.fmt(r.shien.windowEnd), '2027-01-25');
  r = I.calc({ role: 'mother', salary: 300000, dueDate: '2026-10-06', birthDate: '2026-10-01' });
  assert.equal(I.fmt(r.shien.windowEnd), '2027-01-26');
});

test('母の育休は産後休業（出生日の翌日から8週間）の翌日から、給付は1歳の誕生日の前々日まで', () => {
  const r = I.calc({ role: 'mother', salary: 300000, dueDate: '2027-03-10' });
  assert.equal(I.fmt(r.leave.start), '2027-05-06');
  assert.equal(I.fmt(r.leave.end), '2028-03-09');      // 1歳に達する日（誕生日の前日）
  assert.equal(I.fmt(r.leave.payEnd), '2028-03-08');   // 給付は前々日まで
  const last = r.leave.periods[r.leave.periods.length - 1];
  assert.deepEqual([I.fmt(last.start), I.fmt(last.end), last.days], ['2028-03-06', '2028-03-08', 3]);
});

test('支給単位期間: 応当日がない月は月末（5月31日の翌月応当日は6月30日）', () => {
  const p = I.ikukyuPeriods(d('2027-01-31'), d('2027-06-15'), 10000, 0);
  assert.deepEqual(days(p).slice(0, 3).map((x) => x.slice(0, 3)), [
    ['2027-01-31', '2027-02-27', 30],
    ['2027-02-28', '2027-03-30', 30],
    ['2027-03-31', '2027-04-29', 30],
  ]);
  assert.equal(I.fmt(I.ouDate(d('2027-05-31'), 1)), '2027-06-30');
});

test('180日の境目: 6回目まで 67%、7回目から 50%', () => {
  const p = I.ikukyuPeriods(d('2027-05-06'), d('2028-03-08'), 10000, 0);
  assert.deepEqual(p.slice(4, 8).map((x) => [x.d67, x.d50, x.amount]), [
    [30, 0, 201000], [30, 0, 201000], [0, 30, 150000], [0, 30, 150000],
  ]);
});

test('180日の境目: 産後パパ育休 28日を通算すると、6回目の期間の途中で 50% に変わる', () => {
  // 28＋30×5＝178 日 → 6回目は 2日が 67%、28日が 50%
  const p = I.ikukyuPeriods(d('2027-02-07'), d('2027-12-31'), 10000, 28);
  assert.deepEqual([p[5].d67, p[5].d50], [2, 28]);
  assert.equal(p[5].amount, Math.floor((10000 * 2 * 67 + 10000 * 28 * 50) / 100));   // 13,400＋140,000
  assert.equal(p[5].amount, 153400);
  assert.equal(p[6].d67, 0);
});

test('多胎・予定日より遅れた出産が月ごとの表と合計に反映される', () => {
  const r = I.calc({ role: 'mother', salary: 300000, dueDate: '2027-03-10', birthDate: '2027-03-15', babies: 2 });
  assert.equal(r.teate.period.days, 98 + 5 + 56);
  assert.equal(r.teate.total, 6667 * 159);
  assert.equal(r.ichiji.total, 1000000);
  assert.equal(I.fmt(r.leave.start), '2027-05-11');
});

// --- 出生後休業支援給付金の要件 ---

test('出生後休業支援給付金: 母で配偶者が14日以上の育休を取る → 支給', () => {
  const r = I.calc({ role: 'mother', salary: 300000, dueDate: '2027-03-10', spouse: 'leave14' });
  assert.equal(r.shien.daysInWindow, 56);       // 産後休業のあと 16週までの育休
  assert.equal(r.shien.ok, true);
  assert.equal(r.shien.amount, Math.floor(10000 * 28 * 13 / 100));
});

test('出生後休業支援給付金: 母で配偶者が会社員なのに育休を取らない → 支給なし', () => {
  const r = I.calc({ role: 'mother', salary: 300000, dueDate: '2027-03-10', spouse: 'noLeave' });
  assert.equal(r.shien.daysOk, true);
  assert.equal(r.shien.spouseOk, false);
  assert.equal(r.shien.ok, false);
  assert.equal(r.shien.amount, 0);
});

test('出生後休業支援給付金: 配偶者が自営業・専業主婦（主夫）、ひとり親 → 配偶者の育休は要らない', () => {
  ['notEmployee', 'none'].forEach((s) => {
    const r = I.calc({ role: 'mother', salary: 300000, dueDate: '2027-03-10', spouse: s });
    assert.equal(r.shien.ok, true, s);
  });
});

test('出生後休業支援給付金: 母が16週より後に育休を始めると対象期間の日数が足りない', () => {
  // 母が産後休業のあと、いったん復帰して 16週の 5日前から育休 → 対象期間内 5日
  const r = I.calc({ role: 'mother', salary: 300000, dueDate: '2027-03-10', spouse: 'leave14' });
  assert.equal(r.shien.ok, true);
  const r2 = I.calc({ role: 'father', salary: 300000, dueDate: '2027-03-10', leaveStart: '2027-04-23', leaveEnd: '2027-06-30' });
  // 父の対象期間は 3/10〜5/5。4/23〜5/5 は 13日 → 14日に足りない
  assert.equal(r2.shien.daysInWindow, 13);
  assert.equal(r2.shien.ok, false);
  const r3 = I.calc({ role: 'father', salary: 300000, dueDate: '2027-03-10', leaveStart: '2027-04-22', leaveEnd: '2027-06-30' });
  assert.equal(r3.shien.daysInWindow, 14);
  assert.equal(r3.shien.ok, true);
  assert.equal(r3.shien.days, 14);
});

test('出生後休業支援給付金: 父は配偶者（出産した人）の要件を自動で満たし、28日で頭打ち', () => {
  const r = I.calc({ role: 'father', salary: 300000, dueDate: '2027-03-10', leaveStart: '2027-03-10', leaveEnd: '2027-09-09' });
  assert.equal(r.shien.spouseOk, true);
  assert.equal(r.shien.daysInWindow, 57);        // 3/10〜5/5
  assert.equal(r.shien.days, 28);
});

// --- 社会保険料の免除 ---

test('社会保険料の免除: 月末に休んでいる月（開始月〜終了日の翌日の月の前月）', () => {
  const m = I.exemptMonths([{ s: d('2027-03-10'), e: d('2027-04-29'), iku: true }]);
  assert.deepEqual(Object.keys(m).map(Number).map(I.monthLabel), ['2027年3月']);        // 4/30 は休んでいないので 4月は免除なし
  const m2 = I.exemptMonths([{ s: d('2027-03-10'), e: d('2027-04-30'), iku: true }]);
  assert.deepEqual(Object.keys(m2).map(Number).map(I.monthLabel), ['2027年3月', '2027年4月']);
});

test('社会保険料の免除: 同じ月の中で14日以上の育休（令和4年10月から）', () => {
  assert.equal(Object.keys(I.exemptMonths([{ s: d('2027-03-01'), e: d('2027-03-14'), iku: true }])).length, 1);
  assert.equal(Object.keys(I.exemptMonths([{ s: d('2027-03-01'), e: d('2027-03-13'), iku: true }])).length, 0);
  // 産前産後休業には 14日の規定はない
  assert.equal(Object.keys(I.exemptMonths([{ s: d('2027-03-01'), e: d('2027-03-20'), iku: false }])).length, 0);
});

test('社会保険料の免除: 産休から育休へ続けて休むと、つながった 1 つの休業として数える', () => {
  const r = I.calc({ role: 'mother', salary: 300000, dueDate: '2027-03-10' });
  const labels = r.exempt.map((x) => x.label);
  assert.equal(labels[0], '2027年1月');             // 産前休業 1/28 から
  assert.equal(labels[labels.length - 1], '2028年2月');   // 育休の終了日 3/9 の翌日 3/10 の月の前月まで
  assert.equal(labels.length, 14);
});

// --- 標準報酬月額 ---

test('標準報酬月額の等級（協会けんぽの保険料額表の報酬月額の区切り）', () => {
  assert.equal(IV.hoken.hyojunKenpo.length, 50);
  assert.equal(I.hyojunFromSalary(0), 58000);
  assert.equal(I.hyojunFromSalary(92999), 88000);
  assert.equal(I.hyojunFromSalary(93000), 98000);
  assert.equal(I.hyojunFromSalary(250000), 260000);
  assert.equal(I.hyojunFromSalary(1355000), 1390000);
  assert.equal(I.hyojunKounen(58000), 88000);
  assert.equal(I.hyojunKounen(1390000), 650000);
  assert.equal(Object.keys(IV.hoken.kyokai).length, 47);
});

// --- 手で確かめた 3 つの例（README と企画書に計算を載せたもの） ---

test('手計算の例: 月給 25万円・母・予定日 2027-03-10', () => {
  const r = I.calc({ role: 'mother', salary: 250000, dueDate: '2027-03-10', spouse: 'leave14' });
  assert.equal(r.hyojun, 260000);                 // 25万円は 25万〜27万円未満 → 26万円
  assert.equal(r.teate.daily.daily, 5780);        // 260,000÷30＝8,666.6… → 8,670 × 2/3 ＝ 5,780
  assert.equal(r.teate.total, 566440);            // × 98日
  assert.equal(r.wage.daily, 8333);               // 1,500,000÷180＝8,333.3… → 8,333
  assert.equal(r.leave.monthlyHigh, 167493);      // 8,333×30×67%＝167,493.3
  assert.equal(r.leave.monthlyLow, 124995);       // 8,333×30×50%
  assert.equal(r.shien.amount, 30332);            // 8,333×28×13%＝30,332.1
  assert.equal(r.leave.total, 167493 * 6 + 124995 * 4 + Math.floor(8333 * 3 * 50 / 100));
});

test('手計算の例: 月給 30万円・父・産後パパ育休 14日＋育休', () => {
  const r = I.calc({ role: 'father', salary: 300000, dueDate: '2027-03-10', papa: { use: true, start: '2027-03-10', end: '2027-03-23' }, leaveStart: '2027-04-01', leaveEnd: '2027-09-30' });
  assert.equal(r.wage.daily, 10000);
  assert.equal(r.papa.amount, 93800);
  // 対象期間 3/10〜5/5 の休業: 産後パパ育休 14日＋育休 4/1〜5/5 の 35日＝49日 → 28日分
  assert.equal(r.shien.daysInWindow, 49);
  assert.equal(r.shien.amount, 36400);
  // 育休 4/1〜9/30: 6回。通算 14＋30×5＝164 → 6回目 16日 67%・14日 50%
  const p6 = r.leave.periods[5];
  assert.deepEqual([p6.d67, p6.d50], [16, 14]);
  assert.equal(p6.amount, 107200 + 70000);
});

test('手計算の例: 月給 60万円（上限に当たる）・母', () => {
  const r = I.calc({ role: 'mother', salary: 600000, dueDate: '2027-03-10', spouse: 'leave14' });
  assert.equal(r.hyojun, 590000);                 // 57.5万〜60.5万円未満 → 59万円
  assert.equal(r.teate.daily.daily, 13113);       // 590,000÷30＝19,666.6… → 19,670 × 2/3 ＝ 13,113.3
  assert.equal(r.wage.raw, 20000);                // 3,600,000÷180
  assert.equal(r.wage.daily, 16540);              // 上限
  assert.equal(r.leave.monthlyHigh, 332454);
  assert.equal(r.shien.amount, 60205);
});

// --- 入力の正規化とファイル ---

test('入力の正規化: おかしな値は既定に戻す', () => {
  const n = I.normalizeInput({ role: 'x', salary: '-5', dueDate: '2027-02-30', babies: 9, pref: 'mars', customRate: 'abc', spouse: 'zzz' });
  assert.equal(n.role, 'mother');
  assert.equal(n.salary, 0);
  assert.equal(n.dueDate, '');
  assert.equal(n.babies, 1);
  assert.equal(n.pref, 'tokyo');
  assert.equal(n.customRate, 10);
  assert.equal(n.spouse, 'leave14');
  assert.equal(n.sanka, true);
  assert.equal(I.calc({}).ok, false);
  assert.equal(I.calc({ dueDate: '2027-03-10' }).need, 'salary');
});

test('ファイルの書き出し・読み込み（D31）', () => {
  const data = { role: 'father', salary: 320000, dueDate: '2027-03-10', papa: { use: true, start: '2027-03-10', end: '2027-03-23' } };
  const file = I.toExportFile(data, new Date('2026-09-24T00:00:00Z'));
  assert.equal(file.tool, 'seido-keisan-ikukyu');
  assert.equal(file.version, 1);
  assert.equal(file.exportedAt, '2026-09-24T00:00:00.000Z');
  const back = I.fromExportFile(JSON.parse(JSON.stringify(file)));
  assert.equal(back.ok, true);
  assert.deepEqual(back.data, I.normalizeInput(data));
  assert.equal(I.fromExportFile({ tool: 'seido-keisan-juminzei', version: 1, data: {} }).ok, false);
  assert.equal(I.fromExportFile({ tool: 'seido-keisan-ikukyu', version: 2, data: {} }).ok, false);
  assert.equal(I.fromExportFile(null).ok, false);
});

test('値の表: 出典と確認日がそろっている', () => {
  assert.match(IV.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(IV.SOURCES.length >= 10);
  IV.SOURCES.forEach((s) => assert.match(s.url, /^https:\/\//));
  assert.equal(IV.koyo.validTo, '2027-07-31');
});
