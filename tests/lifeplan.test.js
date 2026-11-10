// 人生の数字を 1 枚に（/seido-keisan/lifeplan/、yorozu-plans 企画書 102 の枝 1）のテスト: node --test tests/*.test.js
// 企画書 7 章の完了の目印: 2 本の計算（住宅ローン・年金）が元の道具と同じ値（deepEqual）。5.3: 送信なし・判定文なし。4 章: D117 の 1 文
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../lib/lifeplan.js');
const Loan = require('../lib/loan.js');
const Kuriage = require('../lib/kuriage.js');
const KV = require('../lib/kuriage-values.js');
const Gakunen = require('../lib/gakunen.js');
const Koko = require('../lib/koko.js');
const TakeHome = require('../lib/take-home.js');

const TODAY = { y: 2026, m: 11, d: 5 };
const MAN = 10000;
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('住宅ローンの層は、住宅ローン 返済シミュレーター（loan-sim）と同じ simulate・yearly の値（deepEqual）', () => {
  for (const [principal, years, rate, startAge] of [[3000 * MAN, 35, 1.0, 35], [2000 * MAN, 25, 0.5, 30], [4500 * MAN, 40, 2.3, 45], [1000 * MAN, 10, 0, 60]]) {
    const layer = L.loanLayer(L.normalizeInput({ loan: { principal, years, rate, startAge } }).loan);
    const sim = Loan.simulate({ principal, months: years * 12, method: 'annuity', rates: [{ from: 1, rate }], rule5: false, rule125: false, prepayments: [], prepayFee: 0 });
    assert.deepEqual(layer.byAge.map(r => [r.age - startAge, r.paid, r.principal, r.interest, r.balance]),
      Loan.yearly(sim.rows, 0, 1).map(y => [y.year, y.paid, y.principal, y.interest, y.balance]));
    assert.equal(layer.monthly, sim.payments[0].payment);
    assert.equal(layer.totalInterest, sim.totalInterest);
    assert.equal(layer.payoffAge, startAge + years - 1);
  }
});

test('住宅ローンの層: 3,000万円・35年・1.0% は毎月 84,686 円（loan-sim の受け入れの値、yorozu-plans 01 の 6 章）。35 歳で借りると 69 歳の年に完済', () => {
  const b = L.build({ age: 40, loan: { principal: 3000 * MAN, years: 35, rate: 1.0, startAge: 35 } }, TODAY);
  assert.equal(Math.round(b.loan.monthly), 84686);
  assert.equal(b.loan.payoffAge, 69);
  assert.equal(Math.round(b.loan.totalInterest / 1000) / 10, 556.8);
});

test('年金の層は、年金の繰上げ・繰下げの計算（nenkin-kuriage）と同じ calc の値（deepEqual）。65 歳からの額は老齢基礎年金の満額', () => {
  for (const age of [30, 45, 60, 63, 64]) for (let start = 60; start <= 75; start++) {
    const p = L.pensionLayer(age, start, TODAY);
    const want = Kuriage.calc({ birth: L.birthOf(age, TODAY), kiso: KV.mangaku.monthly * 12, age: start, mon: 0 }, '2026-11');
    assert.deepEqual([p.annual, p.pct, p.startAge], [want.kiso, want.pct1, 65 + Math.floor(want.k1 / 12)], `${age} 歳・${start} 歳から`);
  }
});

test('年金の層: 65 歳から 0%、70 歳から +42%、75 歳から +84%、60 歳から −24%（1962-04-02 以降生まれ）。月額は満額 70,608 円が基準', () => {
  const pct = (s) => L.pensionLayer(40, s, TODAY).pct;
  assert.deepEqual([pct(60), pct(65), pct(70), pct(75)], [-24, 0, 42, 84]);
  assert.equal(KV.mangaku.monthly, 70608);
  assert.equal(L.pensionLayer(40, 65, TODAY).monthly, 70608);
  // 開始の年は翌月分から 11 か月、次の年から 12 か月
  const p = L.pensionLayer(40, 65, TODAY);
  assert.equal(p.byAge[0].age, 65);
  assert.equal(p.byAge[0].annual, p.annual * 11 / 12);
  assert.equal(p.byAge[1].annual, p.annual);
  assert.equal(p.byAge[p.byAge.length - 1].age, 100);
});

test('年金の層: 1952-04-01 以前生まれ（今 75 歳など）は 70 歳までしか繰り下げられず、満額は 1956-04-01 以前生まれの額', () => {
  const p = L.pensionLayer(80, 75, TODAY);
  assert.equal(p.startAge, 70);
  assert.equal(p.clipped, true);
  assert.equal(p.full, KV.mangaku.monthlyOld);
});

test('年齢が無いと線を出さない。住宅ローンは 4 つ揃ったときだけ層になる', () => {
  assert.equal(L.build({}, TODAY).ready, false);
  assert.equal(L.build({ age: 'abc' }, TODAY).ready, false);
  const b = L.build({ age: 40, loan: { principal: 3000 * MAN, years: 35, rate: 1.0 } }, TODAY);
  assert.equal(b.ready, true);
  assert.equal(b.loan, null);
  assert.ok(b.pension);
  assert.equal(L.normalizeInput({ pensionStart: 80 }).pensionStart, 65);
});

test('年ごとの行: 今の年齢から 100 歳まで、返済か年金がある年だけ', () => {
  const b = L.build({ age: 40, pensionStart: 70, loan: { principal: 3000 * MAN, years: 35, rate: 1.0, startAge: 35 } }, TODAY);
  const r = L.rows(b);
  assert.equal(r[0].age, 40);
  assert.equal(r[r.length - 1].age, 100);
  assert.ok(r.every(x => x.loanPaid > 0 || x.pension > 0));
  assert.equal(r.find(x => x.age === 69).loanPaid > 0, true);
  assert.equal(r.find(x => x.age === 70).loanPaid, 0);
});

test('送信しない・保存しない（企画書 102 の 5.3）。used.js だけが送る', () => {
  for (const f of ['lifeplan/app.js', 'lib/lifeplan.js']) {
    const s = read(f);
    for (const w of ['fetch(', 'sendBeacon', 'XMLHttpRequest', 'localStorage', 'WebSocket']) assert.ok(!s.includes(w), `${f} に ${w}`);
  }
  const html = read('lifeplan/index.html');
  assert.match(html, /<script src="\.\.\/used\.js"><\/script>/);
  assert.ok(read('lifeplan/app.js').includes('window.yzUsed?.()'));
});

test('画面: 結果の下に D117 の 1 文。判定・おすすめの言い回しを置かない（D117・企画書 102 の 5.3）', () => {
  const html = read('lifeplan/index.html');
  assert.ok(html.includes('将来の金利・物価は入れていません。今の値のまま並べた目安です。'));
  // 帯の上に、年金の額の前提の 1 文（yorozu-plans 7.189 の続き 3）
  assert.ok(html.indexOf('年金の帯は、老齢基礎年金の満額の場合です。') < html.indexOf('id="timeline"'));
  assert.ok(html.includes('年金の帯は、老齢基礎年金の満額の場合です。'));
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const w of ['大丈夫', '不足しています', '足りません', 'おすすめ', '安心です']) assert.ok(!body.includes(w), w);
  assert.ok(!read('lifeplan/app.js').match(/大丈夫|不足|足りません|おすすめ/));
});

test('画面が読む計算は生成物（root の tools/common/calc、D484）で、数をこの画面で持たない', () => {
  for (const f of ['lib/loan.js', 'lib/kuriage.js', 'lib/kuriage-values.js', 'lib/gakunen.js']) assert.match(read(f), /^\/\/ 生成物。正本は youheioonuki\.github\.io の tools\/common\/calc\//);
  const html = read('lifeplan/index.html');
  for (const s of ['../lib/loan.js', '../lib/kuriage-values.js', '../lib/kuriage.js', '../lib/gakunen.js', '../lib/koko-values.js', '../lib/koko.js', '../lib/take-home-values.js', '../lib/take-home.js', '../lib/lifeplan.js']) assert.ok(html.includes(`<script src="${s}"></script>`), s);
  assert.ok(!/\d{2},\d{3}|0\.00[47]/.test(read('lifeplan/app.js')), 'app.js に制度の値を書かない');
});

// --- 枝 2: 子の学年の節目（企画書 102 の 5.2.1、Q-147） ---

test('子の層: 帯の入学・卒業の日は学年早見の schoolHistory と同じ（4 月生まれ・3 月の早生まれ・12 月生まれ。2 日生まれとして渡す）', () => {
  for (const [y, m] of [[2020, 4], [2021, 3], [2019, 12]]) {
    const b = L.build({ age: 40, children: [{ y, m }] }, TODAY);
    const got = b.children[0].bands.map(bd => [bd.key, bd.inDate, bd.outDate]);
    const h = Gakunen.schoolHistory({ y, m, d: 2 });
    const want = ['elementary', 'junior', 'high', 'university'].map(k => [k,
      h.find(e => e.key === k && e.event === 'in').date, h.find(e => e.key === k && e.event === 'out').date]);
    assert.deepEqual(got, want, `${y}-${m}`);
  }
  // 4 月生まれは 4 月 2 日以降の学年（2020 年 4 月生まれは 2027 年に小学校）。3 月生まれは早生まれ（2021 年 3 月生まれも 2027 年）
  assert.equal(L.build({ age: 40, children: [{ y: 2020, m: 4 }] }, TODAY).children[0].bands[0].inDate.y, 2027);
  assert.equal(L.build({ age: 40, children: [{ y: 2021, m: 3 }] }, TODAY).children[0].bands[0].inDate.y, 2027);
});

test('子の層: 横の位置の境。入学の 4 月 1 日は、今日が 3 月 31 日なら少し先、4 月 1 日なら今の年齢ちょうど、4 月 2 日なら 1 年前の年齢', () => {
  const kid = [{ y: 2020, m: 5 }];   // 2027-04-01 に小学校
  const at = (t) => L.build({ age: 40, children: kid }, t).children[0].bands[0];
  const b331 = at({ y: 2027, m: 3, d: 31 }), b401 = at({ y: 2027, m: 4, d: 1 }), b402 = at({ y: 2027, m: 4, d: 2 });
  assert.ok(b331.from > 40 && b331.from < 40.01);
  assert.equal(b331.entryAge, 40);
  assert.equal(b401.from, 40);
  assert.equal(b401.entryAge, 40);
  assert.ok(b402.from < 40 && b402.from > 39.99);
  assert.equal(b402.entryAge, 39);
  // 0 歳より前・100 歳より後は切る
  const old = L.build({ age: 95, children: [{ y: 2020, m: 5 }] }, TODAY).children[0].bands[3];
  assert.equal(old.to, 101);
});

test('子が 0 人（空・読めない値）なら、枝 1 と同じ build・rows（deepEqual）', () => {
  const raw = { age: 40, pensionStart: 70, loan: { principal: 3000 * MAN, years: 35, rate: 1.0, startAge: 35 } };
  const base = L.build(raw, TODAY);
  for (const children of [undefined, [], [{}], [{ y: 'x', m: 4 }, { y: 2020 }]]) {
    const b = L.build(Object.assign({}, raw, { children }), TODAY);
    assert.deepEqual(b, base);
    assert.deepEqual(L.rows(b, TODAY), L.rows(base));
  }
  assert.ok(!('children' in base) && !('children' in base.input));
});

test('子の層: 高校の縁取りの長さは就学支援金の支給期間（全日制、Koko.supportYears）', () => {
  assert.equal(Koko.supportYears('zen'), 3);
  for (const [y, m] of [[2020, 4], [2021, 3], [2019, 12]]) {
    const c = L.build({ age: 40, children: [{ y, m }] }, TODAY).children[0];
    assert.equal(c.support.to - c.support.from, Koko.supportYears('zen'));
    assert.equal(c.support.from, c.bands[2].from);
  }
});

test('子の層: 3 人まで、n は入力の順番。大学卒業の親の年齢と、年ごとの行の学年（4 月時点）', () => {
  const b = L.build({ age: 40, children: [{ y: 2018, m: 6 }, {}, { y: 2022, m: 1 }, { y: 2023, m: 1 }] }, TODAY);
  assert.deepEqual(b.children.map(c => c.n), [1, 3]);
  // 2018 年 6 月生まれ: 2025-04 に小 1。親は 2026-11-05 に 40 歳 → 2041-03-31（大学卒業）は 54 歳
  assert.equal(b.children[0].bands[0].entryAge, 38);
  assert.equal(b.children[0].gradAge, 54);
  const r = L.rows(b, TODAY);
  // 親 40 歳の年の 4 月 1 日は 2027-04-01: 1 人目は小 3、3 人目（2022 年 1 月の早生まれ）は年長で在学でない
  assert.deepEqual(r.find(x => x.age === 40).grades, ['小3', '']);
  assert.deepEqual(r.find(x => x.age === 41).grades, ['小4', '小1']);
  // 返済も年金も無い年でも、在学なら行がある
  assert.ok(r.find(x => x.age === 48 && x.loanPaid === 0 && x.pension === 0));
  assert.equal(r.find(x => x.age === 48).grades[0], '高2');
  assert.ok(r.every(x => x.grades.length === 2));
});

// --- 枝 3: 税と社会保険（企画書 102 の 5.2.2、Q-150） ---

test('税と社会保険の層: 年収 3 例 × 年齢 39・40・64 で、3 つの額と手取りが TakeHome.calc と同じ', () => {
  for (const income of [3000000, 5000000, 12000000]) {
    for (const age of [39, 40, 64]) {
      const t = L.build({ age, income }, TODAY).tax;
      const r = t.byAge[0];
      const y = TakeHome.calc({ period: 'year', amount: income, bonus: 0, over40: age >= 40 }).year;
      assert.equal(r.age, age);
      assert.deepEqual([r.si, r.incomeTax, r.resident, r.net], [y.si, y.incomeTax, y.resident, y.net], `${income} ${age}`);
      assert.equal(r.total, y.si + y.incomeTax + y.resident);
      assert.equal(t.byAge[t.byAge.length - 1].age, 64);
    }
  }
  // 39 歳から並べると、40 歳で介護保険料のぶん社会保険料が増える
  const b = L.build({ age: 39, income: 5000000 }, TODAY).tax.byAge;
  assert.ok(b[1].si > b[0].si);
  assert.equal(b.length, 26);
});

test('税と社会保険の層: 65 歳以上は行なし、2,000 万円を超える年収は over', () => {
  assert.deepEqual(L.build({ age: 65, income: 5000000 }, TODAY).tax.byAge, []);
  const o = L.build({ age: 40, income: 20000001 }, TODAY).tax;
  assert.equal(o.error, 'over');
  assert.deepEqual(o.byAge, []);
});

test('年収が無い（空・0・読めない値）なら、枝 2 までの build・rows と deepEqual', () => {
  const raw = { age: 40, pensionStart: 70, loan: { principal: 3000 * MAN, years: 35, rate: 1.0, startAge: 35 }, children: [{ y: 2018, m: 6 }] };
  const base = L.build(raw, TODAY);
  for (const income of [undefined, '', 0, 'abc', -1]) {
    const b = L.build(Object.assign({}, raw, { income }), TODAY);
    assert.deepEqual(b, base);
    assert.deepEqual(L.rows(b, TODAY), L.rows(base, TODAY));
  }
  assert.ok(!('tax' in base) && !('income' in base.input));
});

test('税と社会保険の層: 年ごとの行に tax（3 つの合計）。64 歳までは返済も年金も無くても行がある', () => {
  const b = L.build({ age: 30, income: 5000000 }, TODAY);
  const r = L.rows(b, TODAY);
  assert.equal(r.find(x => x.age === 30).tax, b.tax.byAge[0].total);
  assert.ok(r.find(x => x.age === 50 && x.loanPaid === 0 && x.pension === 0 && x.tax > 0));
  assert.equal(r.find(x => x.age === 66).tax, 0);
});
