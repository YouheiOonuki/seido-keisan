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

test('送信しない（企画書 102 の 5.3）。used.js だけが送る。保存は画面が箱（lib/box.js）を通して端末にだけ（枝 7）', () => {
  for (const f of ['lifeplan/app.js', 'lib/lifeplan.js']) {
    const s = read(f);
    for (const w of ['fetch(', 'sendBeacon', 'XMLHttpRequest', 'WebSocket']) assert.ok(!s.includes(w), `${f} に ${w}`);
  }
  assert.ok(!read('lib/lifeplan.js').includes('localStorage'), '計算の lib は保存しない');
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

// 枝 6（Q-164、企画書 102 の 5.2.3）: 制度の改定の印
const Kaitei = require('../lib/kaitei.js');
const KaiteiV = require('../lib/kaitei-values.js');
const iso = (t) => `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;

test('枝 6: 層の項目の id は ITEMS の「まだ施行されていない」と一致し、位置は ageOn と同じ（today 2 つ）', () => {
  for (const today of [{ y: 2026, m: 3, d: 31 }, { y: 2026, m: 11, d: 11 }]) {
    const b = L.build({ age: 40 }, today);
    const ids = b.kaitei.byAge.flatMap((r) => r.items.map((it) => it.id)).sort();
    const want = KaiteiV.ITEMS.filter((it) => !Kaitei.isEnforced(it.date, iso(today))).map((it) => it.id).sort();
    assert.deepEqual(ids, want);
    assert.ok(want.length > 0);
    for (const r of b.kaitei.byAge) for (const it of r.items) {
      const [y, m, d] = it.date.split('-').map(Number);
      const at = L.ageOn(40, today, { y, m, d });
      assert.equal(it.pos, at.pos);
      assert.equal(r.age, at.age);
    }
    assert.ok(KaiteiV.PENDING.every((p) => !ids.includes(p.id)));
  }
});

test('枝 6: 施行日の当日は施行済み（入らない）、前日は入る', () => {
  const it = KaiteiV.ITEMS.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];   // いちばん遅い項目
  const [y, m, d] = it.date.split('-').map(Number);
  const on = L.build({ age: 40 }, { y, m, d });
  assert.ok(!on.kaitei || !on.kaitei.byAge.some((r) => r.items.some((x) => x.id === it.id)));
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  const before = L.build({ age: 40 }, { y: prev.getUTCFullYear(), m: prev.getUTCMonth() + 1, d: prev.getUTCDate() });
  assert.ok(before.kaitei.byAge.some((r) => r.items.some((x) => x.id === it.id)));
});

test('枝 6: today がどの項目よりも後なら kaitei の鍵も行の列も無い（枝 3 までと同じ形）', () => {
  const today = { y: 2100, m: 1, d: 1 };
  const raw = { age: 40, income: 5000000, loan: { principal: 30000000, years: 35, rate: 1, startAge: 40 }, children: [{ y: 2090, m: 5 }] };
  const b = L.build(raw, today);
  assert.equal('kaitei' in b, false);
  const rs = L.rows(b, today);
  assert.ok(rs.length > 0);
  assert.ok(rs.every((r) => !('kaitei' in r)));
});

test('枝 6: 行の制度の改定の列は件数で、印のある年はほかの層が無くても行が出る', () => {
  const b = L.build({ age: 40, pensionStart: 75 }, TODAY);
  const rs = L.rows(b, TODAY);
  for (const r of b.kaitei.byAge) {
    const row = rs.find((x) => x.age === r.age);
    assert.ok(row, `${r.age} 歳の行`);
    assert.equal(row.kaitei, r.items.length);
  }
});

// 枝 5（Q-165、企画書 102 の 5.2.4）: 医療費控除
const Iryohi = require('../lib/iryohi.js');

test('枝 5: 年収 3 例 × 医療費 3 例 × 年齢 39・40 で、控除額と軽くなる税が Iryohi.calc と一致', () => {
  for (const income of [3000000, 5000000, 9000000]) {
    for (const hiyo of [0, 100000, 500000]) {   // 100000 は総所得金額等が 200 万円以上なら控除額 0 になる額
      const b = L.build({ age: 39, income, iryohi: hiyo }, TODAY);
      for (const age of [39, 40]) {
        const t = b.tax.byAge.find((r) => r.age === age);
        const want = Iryohi.calc({ mode: 'kyuyo', income, hiyo, shakai: t.si });
        const got = b.iryohi.byAge.find((r) => r.age === age);
        assert.equal(got.kojo, want.kojo, `${income} ${hiyo} ${age} 控除額`);
        assert.equal(got.incomeTax, want.tax.refund, `${income} ${hiyo} ${age} 所得税`);
        assert.equal(got.resident, want.jumin, `${income} ${hiyo} ${age} 住民税`);
        assert.equal(got.total, want.total);
      }
      if (hiyo === 100000) assert.ok(b.iryohi.byAge.every((r) => r.kojo === 0));
      if (hiyo === 0) assert.ok(b.iryohi.byAge.every((r) => r.total === 0));
    }
  }
});

test('枝 5: 医療費なしなら前の枝までと同じ形、年収なしなら医療費だけでは層を出さない', () => {
  const raw = { age: 45, income: 6000000, loan: { principal: 20000000, years: 30, rate: 1.2, startAge: 40 } };
  const a = L.build(raw, TODAY), c = L.build({ ...raw, iryohi: undefined }, TODAY);
  assert.deepEqual(a, c);
  assert.equal('iryohi' in a, false);
  assert.ok(L.rows(a, TODAY).every((r) => !('iryohi' in r)));
  const noIncome = L.build({ age: 45, iryohi: 300000 }, TODAY);
  assert.equal('iryohi' in noIncome, false);
});

test('枝 5: 行の列は軽くなる税の合計で、範囲は税と社会保険の層と同じ', () => {
  const b = L.build({ age: 50, income: 5000000, iryohi: 400000 }, TODAY);
  assert.deepEqual(b.iryohi.byAge.map((r) => r.age), b.tax.byAge.map((r) => r.age));
  const rs = L.rows(b, TODAY);
  for (const r of b.iryohi.byAge) assert.equal(rs.find((x) => x.age === r.age).iryohi, r.total);
});

// 枝 7（Q-166、企画書 102 の 5.2.5）: 印刷・箱・CSV
const Box = require('../lib/box.js');
const Meisai = require('../lib/meisai.js');
function fakeStorage(init) {
  const m = new Map(init ? Object.entries(init) : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}
// 画面の state は入力欄の文字のまま（数字も文字）
const RAW = { age: '42', income: '6000000', iryohi: '250000', pensionStart: 67, loan: { principal: '30000000', years: '35', rate: '1.1', startAge: '38' }, children: [{ y: '2018', m: '4' }, {}, { y: '2023', m: '12' }] };

test('枝 7: 箱の往復（保存して読み込むと build が deepEqual）', () => {
  const st = fakeStorage();
  assert.equal(Box.save(st, Box.setLifeplan(Box.load(st).box, { input: RAW, layers: 5 })), true);
  const back = Box.lifeplan(Box.load(st).box);
  assert.deepEqual(L.build(back.input, TODAY), L.build(RAW, TODAY));
  assert.equal(back.layers, 5);
});

test('枝 7: meisai の区画は残り、明細を保存し直しても lifeplan は消えない。壊れた値は空から', () => {
  const st = fakeStorage();
  let box = Box.setSection(Box.empty(), 2026, 'meisai', { rows: [{ who: 'A', payee: 'B', kubun: ['shinryo'], amount: 1000, hoten: null }] });
  Box.save(st, box);
  Box.save(st, Box.setLifeplan(Box.load(st).box, { input: RAW, layers: 3 }));
  assert.equal(Box.section(Box.load(st).box, 2026, 'meisai').rows.length, 1);
  // 明細書の画面が保存し直す
  Box.save(st, Box.setSection(Box.load(st).box, 2026, 'meisai', { rows: [] }));
  assert.ok(Box.lifeplan(Box.load(st).box));
  const broken = fakeStorage({ [Box.KEY]: '{not json' });
  const r = Box.load(broken);
  assert.equal(r.broken, true);
  assert.equal(Box.lifeplan(r.box), null);
  // 形の違う値は空の入力として読む（年齢が無いので層は出ない）
  const odd = Box.lifeplan(Box.normalize({ years: {}, lifeplan: { input: { age: 'x', loan: 3, children: 'no' }, layers: -1 } }));
  assert.equal(odd.input.age, null);
  assert.deepEqual(odd.input.children, []);
  assert.equal(odd.layers, 0);
  assert.equal(L.build(odd.input, TODAY).ready, false);
});

test('枝 7: lifeplan の無い箱は前と同じ形（明細書の読み書きに鍵が増えない）', () => {
  const box = Box.setSection(Box.empty(), 2026, 'meisai', { rows: [] });
  assert.equal('lifeplan' in Box.normalize(box), false);
  assert.deepEqual(Object.keys(Box.normalize(box)).sort(), ['version', 'years']);
});

test('枝 7: CSV は rows の行数 ＋ 見出し、BOM と CRLF、先頭のアポストロフィの決まりは明細書と同じ', () => {
  const b = L.build(RAW, TODAY);
  const list = L.rows(b, TODAY);
  const csv = L.toCsv(list);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.endsWith('\r\n'));
  const lines = csv.slice(1).split('\r\n').filter(Boolean);
  assert.equal(lines.length, list.length + 1);
  assert.equal(L.csvRows(list)[0].length, lines[0].split(',').length);
  for (const v of ['=1+1', '+81', '-5', '@x', '\tA', 'a,b', 'say "hi"', '普通', 12345, '', null]) assert.equal(L.cell(v), Meisai.cell(v), String(v));
  assert.equal(L.CSV_NAME, 'lifeplan.csv');
});

test('枝 7: 画面は fetch・sendBeacon を使わず、localStorage は Box を通してだけ', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'lifeplan', 'app.js'), 'utf8');
  assert.ok(!/\bfetch\s*\(|sendBeacon/.test(app));
  assert.ok(!/localStorage\.(getItem|setItem)/.test(app));
  const html = fs.readFileSync(path.join(__dirname, '..', 'lifeplan', 'index.html'), 'utf8');
  assert.ok(html.indexOf('../lib/box.js') < html.indexOf('./app.js'));
});

// --- 枝 4: 育休・産休の給付（企画書 102 の 5.2.7、Q-178） ---

const Ikukyu = require('../lib/ikukyu.js');
// TODAY は 2026-11-05。生まれ月 3 例: 今月（もう生まれた）・半年前・3 か月先（まだ生まれていない）
const IK_KIDS = [{ y: 2026, m: 11 }, { y: 2026, m: 5 }, { y: 2027, m: 2 }];
const IK_BASE = { age: '33', income: '6000000', children: [{ y: '2026', m: '11' }] };
const ikWant = (choice, k, income) => {
  const due = `${k.y}-${String(k.m).padStart(2, '0')}-02`;
  return Ikukyu.calc({ role: choice === 'leave' ? 'father' : 'mother', salary: Math.floor(income / 12), dueDate: due, birthDate: due <= '2026-11-05' ? due : '' });
};
const withoutIkukyu = (b) => { const c = { ...b }; delete c.ikukyu; return c; };

test('枝 4 (1)(8): select 2 通り × 生まれ月 3 例で、層の合計は Ikukyu.calc の total、表と CSV の列の年ごとの和も total', () => {
  for (const choice of ['both', 'leave']) for (const k of IK_KIDS) {
    const raw = { age: '33', income: '6000000', children: [{ y: String(k.y), m: String(k.m) }], ikukyu: choice };
    const b = L.build(raw, TODAY);
    const want = ikWant(choice, k, 6000000);
    assert.equal(want.ok, true);
    assert.equal(b.ikukyu.total, want.total, `${choice} ${k.y}-${k.m}`);
    assert.equal(b.ikukyu.byAge.reduce((s, r) => s + r.amount, 0), want.total);
    const list = L.rows(b, TODAY);
    assert.equal(list.reduce((s, r) => s + r.ikukyu, 0), want.total, `表の和 ${choice} ${k.y}-${k.m}`);
    const csv = L.csvRows(list);
    const col = csv[0].indexOf('育休・産休の給付（円）');
    assert.ok(col > 0);
    assert.equal(csv.slice(1).reduce((s, r) => s + r[col], 0), want.total);
  }
});

test('枝 4: 4 つの額は、それぞれ期間の終わりの日の年（出産手当金・育児休業給付金の支給単位期間・出生後休業支援給付金）', () => {
  const b = L.build({ ...IK_BASE, children: [{ y: '2026', m: '5' }] }, TODAY);
  const r = ikWant('both', { y: 2026, m: 5 }, 6000000);
  const at = (n) => { const [y, m, d] = Ikukyu.fmt(n).split('-').map(Number); return L.ageOn(33, TODAY, { y, m, d }).age; };
  const want = {};
  const put = (n, v) => { want[at(n)] = (want[at(n)] || 0) + v; };
  put(r.teate.period.end, r.teate.total);
  r.leave.periods.forEach((p) => put(p.end, p.amount));
  if (r.shien.amount) put(r.shien.windowEnd, r.shien.amount);
  assert.deepEqual(Object.fromEntries(b.ikukyu.byAge.map((x) => [x.age, x.amount])), want);
  // 半年前に生まれた子は、終わった期間の額が今の年齢より前の年に入り、表はその年から始まる
  assert.ok(b.ikukyu.byAge[0].age < 33);
  assert.equal(L.rows(b, TODAY)[0].age, b.ikukyu.byAge[0].age);
});

test('枝 4 (9): 今の年齢より前の行は 1 つで、表と CSV は年齢と育休・産休の給付のほかが空。子がいない・これから生まれる子では、その行が無い（Q-193）', () => {
  // 半年前に生まれた子。ほかの列（住宅ローン・年金・税と社会保険・医療費控除・子の学年・制度の改定）もそろえて、空になることを見る
  const raw = { ...IK_BASE, iryohi: '250000', pensionStart: 67, loan: { principal: '30000000', years: '35', rate: '1.1', startAge: '30' }, children: [{ y: '2026', m: '5' }, { y: '2020', m: '4' }] };
  const b = L.build(raw, TODAY);
  assert.ok(b.ikukyu && b.tax && b.iryohi && b.loan && b.pension && b.kaitei && b.children);
  const list = L.rows(b, TODAY);
  const pre = list.filter((r) => r.age < 33);
  assert.equal(pre.length, 1);
  assert.equal(pre[0].ikukyu, b.ikukyu.byAge[0].amount);
  assert.ok(pre[0].ikukyu > 0);
  const csv = L.csvRows(list);
  const head = csv[0];
  const row = csv[1 + list.indexOf(pre[0])];
  assert.ok(head.length >= 9);
  head.forEach((h, i) => {
    const v = L.cell(row[i]);
    if (h === '年齢') assert.equal(v, String(pre[0].age));
    else if (h === '育休・産休の給付（円）') assert.equal(v, String(pre[0].ikukyu));
    else assert.equal(v, '', `${h} は空`);
  });
  assert.ok(L.toCsv(list).split('\r\n')[1 + list.indexOf(pre[0])].startsWith(`${pre[0].age},,,,`));
  // 今の年齢からの行は、これまでどおり 0 を数で持つ（この直しは今の年齢より前の行だけ）
  assert.equal(list.find((r) => r.age === 33).pension, 0);
  for (const r2 of [{ age: '33', income: '6000000' }, { ...IK_BASE, children: [{ y: '2027', m: '2' }] }, { ...raw, children: [{ y: '2027', m: '2' }] }]) {
    const l2 = L.rows(L.build(r2, TODAY), TODAY);
    assert.ok(l2.length > 0);
    assert.equal(l2.filter((r) => r.age < 33).length, 0, JSON.stringify(r2.children));
  }
});

test('枝 4 (2): 条件に当たる子がいない・年収が無いときは、枝 7 までと同じ build・rows・CSV（select の値で変わらない）', () => {
  for (const raw of [RAW, { ...IK_BASE, children: [{ y: '2025', m: '11' }] }, { age: '33', children: [{ y: '2026', m: '11' }] }, { age: '33', income: '6000000' }]) {
    const b = L.build(raw, TODAY);
    assert.equal('ikukyu' in b, false);
    for (const choice of ['both', 'leave', 'none']) {
      const c = L.build({ ...raw, ikukyu: choice }, TODAY);
      assert.deepEqual(c, b);
      assert.deepEqual(L.rows(c, TODAY), L.rows(b, TODAY));
      assert.equal(L.toCsv(L.rows(c, TODAY)), L.toCsv(L.rows(b, TODAY)));
    }
    assert.ok(!L.toCsv(L.rows(b, TODAY)).includes('育休'));
  }
});

test('枝 4 (3): 「取らない」では層が無く、build・rows・CSV は層の無い形と同じ', () => {
  for (const k of IK_KIDS) {
    const raw = { ...IK_BASE, children: [{ y: String(k.y), m: String(k.m) }] };
    const none = L.build({ ...raw, ikukyu: 'none' }, TODAY);
    const base = withoutIkukyu(L.build(raw, TODAY));
    assert.deepEqual(none, base);
    assert.deepEqual(L.rows(none, TODAY), L.rows(base, TODAY));
    assert.equal(L.toCsv(L.rows(none, TODAY)), L.toCsv(L.rows(base, TODAY)));
    assert.ok(!L.toCsv(L.rows(none, TODAY)).includes('育休'));
  }
});

test('枝 4 (4): 境。今日がちょうど 1 歳の誕生月の子は当たらず、その翌月生まれは当たる。2 人ならいちばん下の 1 人', () => {
  assert.equal(L.ikukyuChild([{ n: 1, y: 2025, m: 11 }], TODAY), null);
  assert.equal(L.ikukyuChild([{ n: 1, y: 2025, m: 12 }], TODAY).n, 1);
  assert.equal(L.ikukyuChild([{ n: 1, y: 2026, m: 3 }, { n: 2, y: 2027, m: 1 }, { n: 3, y: 2020, m: 4 }], TODAY).n, 2);
  assert.equal(L.build({ ...IK_BASE, children: [{ y: '2025', m: '11' }] }, TODAY).ikukyu, undefined);
  assert.equal(L.build({ ...IK_BASE, children: [{ y: '2025', m: '12' }] }, TODAY).ikukyu.n, 1);
  // 子 2 人のうち、層は下の子の行に
  assert.equal(L.build({ ...IK_BASE, children: [{ y: '2026', m: '1' }, { y: '2027', m: '3' }] }, TODAY).ikukyu.n, 2);
});

test('枝 4 (6): 年収 600 万円では lib の notes と同じ文が同じ数だけ層に入る。300 万円では上限の文が無い', () => {
  for (const k of IK_KIDS) for (const choice of ['both', 'leave']) {
    const b = L.build({ ...IK_BASE, children: [{ y: String(k.y), m: String(k.m) }], ikukyu: choice }, TODAY);
    assert.deepEqual(b.ikukyu.notes, ikWant(choice, k, 6000000).notes);
    assert.ok(b.ikukyu.notes.some((s) => s.startsWith('賃金日額が上限')));
    const low = L.build({ ...IK_BASE, income: '3000000', children: [{ y: String(k.y), m: String(k.m) }], ikukyu: choice }, TODAY);
    assert.deepEqual(low.ikukyu.notes, ikWant(choice, k, 3000000).notes);
    assert.ok(!low.ikukyu.notes.some((s) => s.startsWith('賃金日額が上限')));
  }
});

test('枝 4 (7): 年収 11 円（月給 0 円で lib が ok: false）では層を出さず、層の無い形と同じ', () => {
  const raw = { ...IK_BASE, income: '11' };
  assert.equal(ikWant('both', IK_KIDS[0], 11).ok, false);
  const b = L.build(raw, TODAY);
  assert.equal('ikukyu' in b, false);
  assert.deepEqual(b, L.build({ ...raw, ikukyu: 'none' }, TODAY));
  // 12 円からは ok
  assert.ok(L.build({ ...raw, income: '12' }, TODAY).ikukyu);
});

test('枝 4: 箱に select の値を持つ。欄の無い古いファイルは「産休と育休」として読める', () => {
  const st = fakeStorage();
  Box.save(st, Box.setLifeplan(Box.load(st).box, { input: { ...IK_BASE, ikukyu: 'leave' }, layers: 4 }));
  const back = Box.lifeplan(Box.load(st).box);
  assert.equal(back.input.ikukyu, 'leave');
  assert.deepEqual(L.build(back.input, TODAY), L.build({ ...IK_BASE, ikukyu: 'leave' }, TODAY));
  const old = Box.lifeplan(Box.normalize({ years: {}, lifeplan: { input: { age: 33, income: 6000000, children: [{ y: 2026, m: 11 }] }, layers: 2 } }));
  assert.equal(old.input.ikukyu, 'both');
  assert.equal(L.build(old.input, TODAY).ikukyu.choice, 'both');
});

test('枝 4: 画面に select（産休と育休・育休だけ・取らない）、前提の details、表の列、/ikukyu/ へのリンク', () => {
  const html = read('lifeplan/index.html');
  assert.match(html, /<select id="ikukyu" data-k="ikukyu">\s*<option value="both">産休と育休<\/option>\s*<option value="leave">育休だけ<\/option>\s*<option value="none">取らない<\/option>/);
  assert.ok(html.includes('<summary>育休・産休の給付の前提</summary>'));
  assert.ok(html.includes('class="col-ikukyu" hidden>育休・産休の給付</th>'));
  assert.ok(html.indexOf('../lib/ikukyu.js') < html.indexOf('../lib/lifeplan.js'));
  assert.ok(read('lifeplan/app.js').includes("'../ikukyu/'"));
});

// --- 枝 9: 年金の見込額（ねんきん定期便）を入れる（企画書 102 の 5.2.8、Q-181） ---

const LV = require('../lib/lifeplan-values.js');
const ikMix = { ...IK_BASE, children: [{ y: '2026', m: '5' }] };   // 今の年齢より前の行もある入力（枝 4 の (9)）

test('枝 9 (1): 見込額が空なら、今の build・rows・CSV と deepEqual', () => {
  for (const base of [RAW, ikMix, { age: '40' }]) {
    const want = L.build(base, TODAY);
    for (const v of ['', undefined, null]) {
      const b = L.build({ ...base, mikomi: v }, TODAY);
      assert.deepEqual(b, want);
      assert.deepEqual(L.rows(b, TODAY), L.rows(want, TODAY));
      assert.equal(L.toCsv(L.rows(b, TODAY)), L.toCsv(L.rows(want, TODAY)));
    }
    assert.equal('mikomi' in want.input, false);
    assert.equal('mikomi' in want.pension, false);
  }
});

test('枝 9 (2): 100 万円を入れると、開始 60・65・70・75 歳の帯の額は 100 万円 × 年金の繰上げ・繰下げの計算の率', () => {
  const want = { 60: 760000, 65: 1000000, 70: 1420000, 75: 1840000 };   // −24%・0%・+42%・+84%（1962-04-02 以降生まれ）
  for (const start of [60, 65, 70, 75]) {
    const b = L.build({ age: '40', pensionStart: start, mikomi: '1000000' }, TODAY);
    const k = Kuriage.calc({ birth: L.birthOf(40, TODAY), kiso: 1000000, age: start, mon: 0 }, '2026-11');
    assert.equal(b.pension.annual, k.kiso, `${start} 歳から`);
    assert.equal(b.pension.annual, Math.round(1000000 * (1 + b.pension.pct / 100)), `${start} 歳から`);
    assert.equal(b.pension.annual, want[start]);
    assert.equal(b.pension.pct, L.pensionLayer(40, start, TODAY).pct, '率は満額のときと同じ');
    assert.equal(b.pension.mikomi, 1000000);
    // 帯: 開始の年は 11 か月、次の年から 12 か月。表と CSV の年金の列もこの額
    assert.equal(b.pension.byAge[0].annual, k.kiso * 11 / 12);
    assert.equal(b.pension.byAge[1].annual, k.kiso);
    const rows = L.rows(b, TODAY);
    assert.equal(rows.find(r => r.age === b.pension.startAge + 1).pension, k.kiso);
    assert.deepEqual(L.csvRows(rows)[0], L.csvRows(L.rows(L.build({ age: '40', pensionStart: start }, TODAY), TODAY))[0], 'CSV の頭は変わらない');
  }
});

test('枝 9 (3): 範囲の外・整数でない・数字でない値は空として扱う', () => {
  const want = L.build({ age: '40' }, TODAY);
  for (const v of ['0', 0, '-1', '10000000', 10000000, '1000000.5', '100万', 'abc', ' ', '1e99', NaN, Infinity, true, {}, []]) {
    assert.deepEqual(L.build({ age: '40', mikomi: v }, TODAY), want, String(v));
  }
  for (const v of ['1', 1, '9999999', 9999999, '0816000']) assert.ok(L.build({ age: '40', mikomi: v }, TODAY).pension.mikomi, String(v));
  assert.equal(L.MIKOMI_MAX, 9999999);
});

test('枝 9 (4): 箱に見込額を持つ。欄の無い古いファイルは空として読める', () => {
  const st = fakeStorage();
  const raw = { ...RAW, mikomi: '1200000' };
  Box.save(st, Box.setLifeplan(Box.load(st).box, { input: raw, layers: 5 }));
  const back = Box.lifeplan(Box.load(st).box);
  assert.equal(back.input.mikomi, 1200000);
  assert.deepEqual(L.build(back.input, TODAY), L.build(raw, TODAY));
  const old = Box.lifeplan(Box.normalize({ years: {}, lifeplan: { input: { age: 40, pensionStart: 65 }, layers: 1 } }));
  assert.equal(old.input.mikomi, null);
  assert.deepEqual(L.build(old.input, TODAY), L.build({ age: 40, pensionStart: 65 }, TODAY));
});

test('枝 9: 画面に見込額の欄、帯の上の 1 文の差し替え、ねんきん定期便の前提の 1 文。出典と確認日は lib/lifeplan-values.js', () => {
  const html = read('lifeplan/index.html');
  assert.match(html, /<input type="number" id="mikomi" data-k="mikomi"[^>]*max="9999999"/);
  assert.ok(html.indexOf('id="mikomi"') < html.indexOf('</fieldset>'), '年金の区画（必須の区画）の中');
  assert.ok(html.includes('50歳以上（60歳未満）では今の加入条件のまま60歳まで加入したと仮定した額、50歳未満ではこれまでの加入実績だけで出した額'));
  const app = read('lifeplan/app.js');
  assert.ok(app.includes("'入力した見込み額の場合'") && app.includes("'老齢基礎年金の満額の場合'"));
  assert.ok(!/mikomi/.test(app.slice(app.indexOf('yzUsed'), app.indexOf('yzUsed') + 40)), 'used に乗せない');
  assert.match(LV.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(LV.SOURCES.map(s => s.key), ['teikibinPage', 'teikibin50ijyou', 'teikibin50miman', 'kouneiRei', 'kouneihoMikomi', 'kokunenhoMikomi']);
  for (const s of LV.SOURCES) assert.match(s.url, /^https:\/\/(www\.nenkin\.go\.jp\/service\/nenkinkiroku\/torikumi\/teikibin\/|laws\.e-gov\.go\.jp\/law\/)/);
  assert.ok(read('lifeplan/guide.html').includes('<script src="../lib/lifeplan-values.js"></script>'));
});

test('Q-213: 見込額を入れたときの注意・FAQ・計算しないことの文（企画書 102 の 5.2.8）。条文は lib/lifeplan-values.js', () => {
  const html = read('lifeplan/index.html');
  assert.ok(html.includes('<p>年金の額は、見込み額を入れなければ老齢基礎年金の満額での目安で、厚生年金は入れていません。見込み額を入れたときは、その額の全体に同じ率をかけます。働きながら受け取って止まる分と加給年金は繰下げでも増えず、基礎年金と厚生年金は別々の年齢で繰り下げられるので、実際の額とは違うことがあります。'));
  assert.ok(html.includes('<li>特別支給の老齢厚生年金（受け取れる生まれの人は、繰上げの減り方が違います）</li>'));
  const guide = read('lifeplan/guide.html');
  const faq = '見込み額を入れないときは、65歳からの額を老齢基礎年金の満額（令和8年度、月70,608円）とし、受け取り始める年齢の増減率をかけています。厚生年金は入れていません。ねんきん定期便の見込み額を入れると、その額に同じ増減率をかけます。自分の額は年金の繰上げ・繰下げの計算で確かめられます。';
  assert.ok(guide.includes('"text": "' + faq + '"'), 'JSON-LD');
  assert.ok(guide.includes('<dd>' + faq + '</dd>'), '本文');
  const where = LV.SOURCES.map(s => s.where).join('');
  for (const art of ['3条の5の2', '6条の3', '8条の2の3', '44条の3第4項', '附則7条の3第2項', '附則13条の4', '28条1項', '附則9条の2第2項']) assert.ok(where.includes(art), art);
});

