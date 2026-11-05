// ===========================
// 人生の数字を 1 枚に（/seido-keisan/lifeplan/、yorozu-plans 企画書 102・K232）— 時間軸の層を組み立てる（純粋関数）
// この画面は数を新しく作らない。住宅ローンは lib/loan.js（住宅ローン 返済シミュレーターと同じ計算）、年金は lib/kuriage.js と
// lib/kuriage-values.js（年金の繰上げ・繰下げの計算と同じ計算と値）をそのまま呼ぶ。どちらも root の tools/common/calc の生成物（D484）。
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

  var MAX_AGE = 100;

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
   * raw = { age, pensionStart, loan: { principal（円）, years, rate（年利 %）, startAge } }
   */
  function normalizeInput(raw) {
    raw = raw || {};
    var l = raw.loan || {};
    return {
      age: int(raw.age, 0, 99),
      pensionStart: int(raw.pensionStart, 60, 75) === null ? 65 : int(raw.pensionStart, 60, 75),
      loan: {
        principal: num(l.principal, 1, 1e10),
        years: int(l.years, 1, 50),
        rate: num(l.rate, 0, 20),
        startAge: int(l.startAge, 18, 99),
      },
    };
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
    return out;
  }

  /** 年ごとの行（年齢・住宅ローンの返済・うち利息・年金）。表と CSV の元 */
  function rows(b) {
    var list = [];
    if (!b || !b.ready) return list;
    var loan = {}, pen = {};
    if (b.loan && b.loan.byAge) b.loan.byAge.forEach(function (r) { loan[r.age] = r; });
    if (b.pension) b.pension.byAge.forEach(function (r) { pen[r.age] = r; });
    for (var a = b.input.age; a <= b.maxAge; a++) {
      if (!loan[a] && !pen[a]) continue;
      list.push({ age: a, loanPaid: loan[a] ? loan[a].paid : 0, loanInterest: loan[a] ? loan[a].interest : 0, pension: pen[a] ? pen[a].annual : 0 });
    }
    return list;
  }

  var api = { MAX_AGE: MAX_AGE, normalizeInput: normalizeInput, birthOf: birthOf, loanLayer: loanLayer, pensionLayer: pensionLayer, build: build, rows: rows };
  if (NODE) module.exports = api;
  else root.Lifeplan = api;
})(this);
