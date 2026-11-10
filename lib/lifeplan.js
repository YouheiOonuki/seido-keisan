// ===========================
// 人生の数字を 1 枚に（/seido-keisan/lifeplan/、yorozu-plans 企画書 102・K232）— 時間軸の層を組み立てる（純粋関数）
// この画面は数を新しく作らない。住宅ローンは lib/loan.js（住宅ローン 返済シミュレーターと同じ計算）、年金は lib/kuriage.js と
// lib/kuriage-values.js（年金の繰上げ・繰下げの計算と同じ計算と値）、子の学年は lib/gakunen.js（学年早見と同じ計算）をそのまま呼ぶ。
// この 3 つは root の tools/common/calc の生成物（D484）。高校の就学支援金の期間は lib/koko.js（高校無償化の計算）の supportYears。
// 税と社会保険は lib/take-home.js（手取りの計算）の calc をそのまま呼ぶ（会社員・協会けんぽ東京・扶養なし・賞与なしの年収）。
// 将来の金利・物価・昇給・運用利回りは入れない（企画書 4 章。今の値のまま並べる）。
// 年齢の数え方: 横軸の 1 目盛りは「その年齢の 1 年」。住宅ローンは借りた年齢の 1 年目の 1 か月目から数え、年金は受け取り始める年齢に達した月の翌月分から数える。
// ブラウザでは window.Lifeplan、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var NODE = typeof module !== 'undefined' && module.exports;
  var Loan = NODE ? require('./loan.js') : root.Calc;
  var Kuriage = NODE ? require('./kuriage.js') : root.Kuriage;
  var KV = NODE ? require('./kuriage-values.js') : root.KuriageValues;
  var Gakunen = NODE ? require('./gakunen.js') : root.Gakunen;
  var Koko = NODE ? require('./koko.js') : root.Koko;
  var TakeHome = NODE ? require('./take-home.js') : root.TakeHome;

  var MAX_AGE = 100;
  var TAX_LAST_AGE = 64;   // 税と社会保険の層は 64 歳まで（介護保険の第 2 号の終わり。企画書 102 の 5.2.2）
  var MAX_CHILDREN = 3;
  var STAGES = ['elementary', 'junior', 'high', 'university'];   // 短大（college2）は使わない（企画書 102 の 5.2.1）
  var STAGE_SHORT = { elementary: '小', junior: '中', high: '高', university: '大' };

  function int(v, lo, hi) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Math.floor(Number(v));
    if (!isFinite(n)) return null;
    return n < lo || n > hi ? null : n;
  }
  function num(v, lo, hi) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(v);
    if (!isFinite(n)) return null;
    return n < lo || n > hi ? null : n;
  }

  /**
   * 入力をそろえる。読めない値・範囲の外の値は null（その層を出さない）
   * raw = { age, income（年収、円）, pensionStart, loan: { principal（円）, years, rate（年利 %）, startAge }, children: [{ y, m }]（3 人まで、生まれた年と月） }
   * 子は読める人だけ残し、n に入力の順番（1 人目・2 人目）を持つ。1 人もいなければ children の鍵を置かない（枝 1 と同じ形）。
   * 年収も読めるときだけ income の鍵を置く（枝 2 までと同じ形）
   */
  function normalizeInput(raw) {
    raw = raw || {};
    var l = raw.loan || {};
    var kids = (Array.isArray(raw.children) ? raw.children : []).slice(0, MAX_CHILDREN).map(function (c, i) {
      c = c || {};
      var y = int(c.y, 1900, 2200), m = int(c.m, 1, 12);
      return y === null || m === null ? null : { n: i + 1, y: y, m: m };
    }).filter(Boolean);
    var out = {
      age: int(raw.age, 0, 99),
      pensionStart: int(raw.pensionStart, 60, 75) === null ? 65 : int(raw.pensionStart, 60, 75),
      loan: {
        principal: num(l.principal, 1, 1e10),
        years: int(l.years, 1, 50),
        rate: num(l.rate, 0, 20),
        startAge: int(l.startAge, 18, 99),
      },
    };
    if (kids.length) out.children = kids;
    var income = int(raw.income, 1, 1e10);
    if (income !== null) out.income = income;
    return out;
  }

  // 生年月日の代わり（入力は年齢だけ）: 今日がちょうど age 歳の誕生日の人とみなす。
  // 年金の率が生年月日で変わる人（1962年4月1日以前生まれ・1952年4月1日以前生まれ）の境の年齢では、実際と 1 歳ずれることがある（画面の details に書く）
  function birthOf(age, today) {
    var y = today.y - age, m = today.m, d = today.d;
    if (m === 2 && d === 29) d = 28;
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  function ymOf(today) { return today.y + '-' + (today.m < 10 ? '0' : '') + today.m; }

  /** 住宅ローンの層。loan-sim と同じ simulate・yearly（元利均等・金利は 1 本）を、借りた年齢を 0 年目として年齢に並べる */
  function loanLayer(loan) {
    if (loan.principal === null || loan.years === null || loan.rate === null || loan.startAge === null) return null;
    var input = { principal: loan.principal, months: loan.years * 12, method: 'annuity', rates: [{ from: 1, rate: loan.rate }], rule5: false, rule125: false, prepayments: [], prepayFee: 0 };
    var sim = Loan.simulate(input);
    if (sim.errors.length) return { errors: sim.errors };
    var years = Loan.yearly(sim.rows, 0, 1);   // 0 年目 = 借りた年齢の 1 年
    var byAge = years.map(function (y) {
      return { age: loan.startAge + y.year, paid: y.paid, principal: y.principal, interest: y.interest, balance: y.balance };
    }).filter(function (r) { return r.age <= MAX_AGE; });
    var payoffAge = loan.startAge + Math.floor((sim.months - 1) / 12);
    return {
      input: input, monthly: sim.payments[0].payment, totalPaid: sim.totalPaid, totalInterest: sim.totalInterest,
      months: sim.months, payoffAge: payoffAge, beyond: payoffAge > MAX_AGE, byAge: byAge,
    };
  }

  /** 年金の層。年金の繰上げ・繰下げの計算と同じ calc に、老齢基礎年金の満額（令和8年度）を 65 歳からの額として入れる */
  function pensionLayer(age, start, today) {
    var birth = birthOf(age, today);
    var full = birth <= KV.mangaku.oldBornBy ? KV.mangaku.monthlyOld : KV.mangaku.monthly;
    var input = { birth: birth, kiso: full * 12, age: start, mon: 0 };
    var r = Kuriage.calc(input, ymOf(today));
    if (!r.ready) return null;
    var startAge = 65 + Math.floor(r.k1 / 12);   // 75 を超えて繰り下げられない人（1952年4月1日以前生まれ）は calc が 70 に縮める
    var annual = r.kiso;
    var byAge = [];
    for (var a = startAge; a <= MAX_AGE; a++) byAge.push({ age: a, annual: a === startAge ? annual * 11 / 12 : annual });   // 開始の年は翌月分から 11 か月
    return {
      input: input, birth: birth, full: full, fiscalYear: KV.mangaku.fiscalYear, pct: r.pct1, startAge: startAge, clipped: startAge !== start,
      annual: annual, monthly: annual / 12, byAge: byAge, msgs: r.msgs,
    };
  }

  // 日付 → 時間軸の位置（親の年齢）。今日がちょうど age 歳の誕生日とみなす（birthOf と同じ置き方）
  function dayNo(dt) { return Date.UTC(dt.y, dt.m - 1, dt.d) / 86400000; }
  function ageOn(age, today, dt) {
    var full = dt.y - today.y - ((dt.m < today.m || (dt.m === today.m && dt.d < today.d)) ? 1 : 0);
    var last = { y: today.y + full, m: today.m, d: today.d };
    var next = { y: today.y + full + 1, m: today.m, d: today.d };
    var frac = (dayNo(dt) - dayNo(last)) / (dayNo(next) - dayNo(last));
    return { age: age + full, pos: age + full + frac };   // age は整数（その日の親の満年齢）、pos は横の位置
  }
  function clip(v) { return Math.max(0, Math.min(MAX_AGE + 1, v)); }

  /**
   * 子の学年の層。入学・卒業の日は学年早見の schoolHistory をそのまま（日は聞かず 2 日生まれとして渡す）。
   * 帯は小・中・高・大学 4 年。高校の帯のうち就学支援金の対象の年数（全日制）を support に
   */
  function childLayer(kids, age, today) {
    var hy = Koko.supportYears('zen');
    return kids.map(function (c) {
      var birth = { y: c.y, m: c.m, d: 2 };
      var hist = Gakunen.schoolHistory(birth);
      var bands = STAGES.map(function (k) {
        var i = hist.filter(function (e) { return e.key === k && e.event === 'in'; })[0];
        var o = hist.filter(function (e) { return e.key === k && e.event === 'out'; })[0];
        var a = ageOn(age, today, i.date), b = ageOn(age, today, o.date);
        return { key: k, inDate: i.date, outDate: o.date, entryAge: a.age, outAge: b.age, from: clip(a.pos), to: clip(b.pos) };
      });
      var high = bands[2];
      var sFrom = ageOn(age, today, high.inDate).pos;
      return {
        n: c.n, birth: birth, bands: bands,
        support: { years: hy, from: clip(sFrom), to: clip(sFrom + hy) },
        gradAge: bands[3].outAge,
      };
    });
  }

  /**
   * 税と社会保険の層。手取りの計算の calc に年収（賞与 0）を入れ、今の年齢から 64 歳まで並べる。
   * 年で変わるのは 40〜64 歳の介護保険料（over40）だけで、ほかは今年の表のまま。上限を超える年収は error（'over' など）
   */
  function taxLayer(income, age) {
    var memo = {};
    var byAge = [];
    for (var a = age; a <= TAX_LAST_AGE; a++) {
      var over40 = a >= 40;
      var r = memo[over40] || (memo[over40] = TakeHome.calc({ period: 'year', amount: income, bonus: 0, over40: over40 }));
      if (!r.ready) return { income: income, error: r.error || 'notReady', byAge: [] };
      var y = r.year;
      byAge.push({ age: a, si: y.si, incomeTax: y.incomeTax, resident: y.resident, total: y.si + y.incomeTax + y.resident, net: y.net });
    }
    return { income: income, byAge: byAge };
  }

  /** 親が a 歳の 1 年の中の 4 月 1 日（今日が誕生日とみなすので、今日が 4 月 1 日より後なら翌年の 4 月 1 日） */
  function aprilIn(a, age, today) {
    var after = today.m > 4 || (today.m === 4 && today.d > 1);
    return { y: today.y + (a - age) + (after ? 1 : 0), m: 4, d: 1 };
  }
  /** その 4 月 1 日の子の学年の短い名（小1・中2・高3・大4）。在学でなければ '' */
  function gradeLabel(birth, ref) {
    var g = Gakunen.gradeAt(birth, ref);
    return STAGES.indexOf(g.stage) >= 0 ? STAGE_SHORT[g.stage] + g.grade : '';
  }

  /**
   * 時間軸（0〜100 歳）の層をまとめて返す
   * today = { y, m, d }（端末の今日）
   */
  function build(raw, today) {
    var d = normalizeInput(raw);
    var out = { input: d, ready: d.age !== null, maxAge: MAX_AGE, loan: null, pension: null };
    if (!out.ready) return out;
    out.pension = pensionLayer(d.age, d.pensionStart, today);
    out.loan = loanLayer(d.loan);
    if (d.children) out.children = childLayer(d.children, d.age, today);
    if (d.income !== undefined) out.tax = taxLayer(d.income, d.age);
    return out;
  }

  /**
   * 年ごとの行（年齢・住宅ローンの返済・うち利息・年金、年収があれば税と社会保険、子がいれば子の学年）。表と CSV の元。
   * 税と社会保険がある年・子が在学の年は、返済も年金も無くても行を出す
   */
  function rows(b, today) {
    var list = [];
    if (!b || !b.ready) return list;
    var loan = {}, pen = {};
    if (b.loan && b.loan.byAge) b.loan.byAge.forEach(function (r) { loan[r.age] = r; });
    if (b.pension) b.pension.byAge.forEach(function (r) { pen[r.age] = r; });
    var kids = b.children || null;
    var tax = b.tax ? {} : null;
    if (tax) b.tax.byAge.forEach(function (r) { tax[r.age] = r; });
    for (var a = b.input.age; a <= b.maxAge; a++) {
      var grades = kids ? kids.map(function (c) { return gradeLabel(c.birth, aprilIn(a, b.input.age, today)); }) : null;
      var inSchool = grades && grades.some(function (g) { return g; });
      if (!loan[a] && !pen[a] && !inSchool && !(tax && tax[a])) continue;
      var r = { age: a, loanPaid: loan[a] ? loan[a].paid : 0, loanInterest: loan[a] ? loan[a].interest : 0, pension: pen[a] ? pen[a].annual : 0 };
      if (tax) r.tax = tax[a] ? tax[a].total : 0;
      if (kids) r.grades = grades;
      list.push(r);
    }
    return list;
  }

  var api = {
    MAX_AGE: MAX_AGE, MAX_CHILDREN: MAX_CHILDREN, TAX_LAST_AGE: TAX_LAST_AGE, STAGES: STAGES, normalizeInput: normalizeInput, birthOf: birthOf, ageOn: ageOn,
    loanLayer: loanLayer, pensionLayer: pensionLayer, childLayer: childLayer, taxLayer: taxLayer, aprilIn: aprilIn, gradeLabel: gradeLabel, build: build, rows: rows,
  };
  if (NODE) module.exports = api;
  else root.Lifeplan = api;
})(this);
