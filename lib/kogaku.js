// ===========================
// 制度の計算機 — 高額療養費の計算（純粋関数）
// 値は lib/kogaku-values.js にだけ置く。順番は健康保険法施行令 41 条のとおり:
//   1. 70歳以上の外来（個人ごと。外来の上限がある区分だけ）
//   2. 70歳以上の世帯（入院と、1 の残り）
//   3. 世帯全体（70歳未満は1つの病院等で21,000円以上の分と、2 の残り）… 健保・国保（74歳まで）のとき
// 1%の額は 50銭以上を1円に切り上げ、50銭未満を切り捨て（42 条）。
// ブラウザでは window.Kogaku、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var V = (typeof module !== 'undefined' && module.exports) ? require('./kogaku-values.js') : root.KogakuValues;

  var TOOL_ID = 'seido-keisan-kogaku';
  var PLANS = ['kenpo', 'kouki'];        // 健保・国保（74歳まで）／後期高齢者医療（75歳以上）
  var AGES = ['u70', 'o70'];             // 70歳未満／70歳以上
  var PLACES = ['in', 'out'];            // 入院／外来（院外処方の薬局は外来に含める）
  var WHO = ['self', 'f1', 'f2', 'f3', 'f4'];
  var MAX_ROWS = 12;

  function num(v) { var n = Math.floor(Number(v)); return isFinite(n) && n > 0 ? n : 0; }
  function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }

  // 診療月（YYYY-MM）→ 表
  function periodFor(ym) {
    for (var i = 0; i < V.PERIODS.length; i++) {
      var p = V.PERIODS[i];
      if ((!p.from || ym >= p.from) && (!p.to || ym <= p.to)) return p;
    }
    return V.PERIODS[V.PERIODS.length - 1];
  }
  function periodById(id) { for (var i = 0; i < V.PERIODS.length; i++) if (V.PERIODS[i].id === id) return V.PERIODS[i]; return null; }
  function catById(p, id) { for (var i = 0; i < p.cats.length; i++) if (p.cats[i].id === id) return p.cats[i]; return null; }

  function defaultRate(age, plan) { return plan === 'kouki' ? 0.1 : age === 'o70' ? 0.2 : 0.3; }

  function normalizeRow(r, plan, i) {
    r = r || {};
    var age = plan === 'kouki' ? 'o70' : pick(r.age, AGES, 'u70');
    var rate = Number(r.rate);
    if (V.RATES.indexOf(rate) < 0) rate = defaultRate(age, plan);
    return { who: pick(r.who, WHO, i === 0 ? 'self' : 'f1'), age: age, place: pick(r.place, PLACES, 'in'), cost: num(r.cost), rate: rate };
  }

  function normalizeInput(raw) {
    raw = raw || {};
    var plan = pick(raw.plan, PLANS, 'kenpo');
    var period = periodById(raw.period) ? raw.period : null;   // null は「今月の表」（画面が決める）
    var rows = Array.isArray(raw.rows) && raw.rows.length ? raw.rows.slice(0, MAX_ROWS) : [{}];
    rows = rows.map(function (r, i) { return normalizeRow(r, plan, i); });
    rows[0].who = 'self';
    return {
      plan: plan,
      period: period,
      cat: typeof raw.cat === 'string' ? raw.cat : '',
      many: !!raw.many,
      rows: rows,
      yearPaid: num(raw.yearPaid),    // 年間上限の確かめ: 8月からの自己負担の合計（高額療養費を引いたあと）
    };
  }

  // 1%の額の端数: 50銭以上は1円に切り上げ、50銭未満は切り捨て（整数の銭で計算）
  function onePercent(yen) { return Math.floor((yen + 50) / 100); }
  // 上限額（円）。cost は合算した療養の医療費（10割）
  function limitOf(l, cost, many) {
    if (many && l.many !== null) return l.many;
    if (!l.thr) return l.base;
    return l.base + (cost > l.thr ? onePercent(cost - l.thr) : 0);
  }
  // 窓口の自己負担（円）。窓口では10円未満を四捨五入するが、ここでは医療費 × 割合をそのまま使う（1円未満は切り捨て）
  function selfPay(row) { return Math.floor(row.cost * Math.round(row.rate * 10) / 10); }

  function calc(raw, todayYm) {
    var d = normalizeInput(raw);
    var p = d.period ? periodById(d.period) : periodFor(todayYm || '2026-08');
    var cat = catById(p, d.cat);
    var r = { input: d, period: p, cat: cat, ready: false, msgs: [] };
    if (!cat) return r;
    var rows = d.rows.filter(function (x) { return x.cost > 0; });
    if (!rows.length) return r;
    var kouki = d.plan === 'kouki';
    var hasU70 = !kouki && rows.some(function (x) { return x.age === 'u70'; });
    if (cat.o70only && hasU70) r.msgs.push('o1u70');   // 70歳未満の人はオ（住民税非課税）で計算
    rows = rows.map(function (x) { var y = {}; for (var k in x) y[k] = x[k]; y.pay = selfPay(x); return y; });
    var paid = rows.reduce(function (s, x) { return s + x.pay; }, 0);
    var steps = [];

    // 1. 70歳以上の外来（個人ごと）
    var o70 = rows.filter(function (x) { return x.age === 'o70'; });
    var rest1 = {};       // 人 → 外来の残り
    var refund1 = 0;
    if (o70.length) {
      var persons = {};
      o70.forEach(function (x) { if (x.place === 'out') { persons[x.who] = (persons[x.who] || 0) + x.pay; } });
      Object.keys(persons).forEach(function (w) {
        var sum = persons[w];
        if (cat.gairai !== null && cat.gairai !== undefined && sum > cat.gairai) {
          refund1 += sum - cat.gairai;
          rest1[w] = cat.gairai;
          steps.push({ kind: 'gairai', who: w, paid: sum, limit: cat.gairai, refund: sum - cat.gairai });
        } else {
          rest1[w] = sum;
          if (cat.gairai !== null && cat.gairai !== undefined) steps.push({ kind: 'gairai', who: w, paid: sum, limit: cat.gairai, refund: 0 });
        }
      });
    }

    // 2. 70歳以上の世帯（入院と外来の残り）
    var rest2 = 0, refund2 = 0, costO70 = 0;
    if (o70.length) {
      var sumIn = o70.filter(function (x) { return x.place === 'in'; }).reduce(function (s, x) { return s + x.pay; }, 0);
      var sumOut = Object.keys(rest1).reduce(function (s, w) { return s + rest1[w]; }, 0);
      costO70 = o70.reduce(function (s, x) { return s + x.cost; }, 0);
      var total2 = sumIn + sumOut;
      var lim2 = limitOf(cat.o70, costO70, d.many);
      refund2 = Math.max(0, total2 - lim2);
      rest2 = Math.min(total2, lim2);
      steps.push({ kind: 'o70', paid: total2, limit: lim2, refund: refund2, cost: costO70 });
    }

    // 3. 世帯全体（健保・国保で70歳未満の人がいるとき）
    var refund3 = 0, finalLimit = null;
    var u70 = rows.filter(function (x) { return x.age === 'u70'; });
    var small = u70.filter(function (x) { return x.pay < V.GASSAN_MIN; });
    var big = u70.filter(function (x) { return x.pay >= V.GASSAN_MIN; });
    if (!kouki && u70.length) {
      var costU70 = big.reduce(function (s, x) { return s + x.cost; }, 0) + costO70;
      var total3 = big.reduce(function (s, x) { return s + x.pay; }, 0) + rest2;
      var lim3 = limitOf(cat.u70, costU70, d.many);
      refund3 = Math.max(0, total3 - lim3);
      finalLimit = lim3;
      steps.push({ kind: 'u70', paid: total3, limit: lim3, refund: refund3, cost: costU70, small: small.length, smallPaid: small.reduce(function (s, x) { return s + x.pay; }, 0) });
    } else if (o70.length) {
      finalLimit = steps[steps.length - 1].limit;
    }

    var refund = refund1 + refund2 + refund3;
    r.ready = true;
    r.rows = rows;
    r.paid = paid;                 // 窓口で払う額の合計（割合どおり）
    r.refund = refund;             // 高額療養費（戻る額。マイナ保険証などで窓口で差し引かれる分を含む）
    r.self = paid - refund;        // この月の自己負担
    r.limit = finalLimit;          // いちばん外側の上限額
    r.steps = steps;
    r.smallU70 = small.length;     // 21,000円に届かず合算しなかった行の数
    r.many = d.many;
    r.hasGairai = steps.some(function (s) { return s.kind === 'gairai'; });

    // 年間上限（2026-08 からの計算期間）。上限は区分で決まる（基準日＝7月31日の区分）
    if (cat.year) {
      r.year = { cap: cat.year, cap200: cat.year200 || null, gairaiYear: cat.gairaiYear || null };
      if (d.yearPaid) r.year.over = Math.max(0, d.yearPaid - cat.year);
    }
    return r;
  }

  // 医療費（10割）→ 上限額だけを知りたいとき（1人・1か所・入院）
  function limitFor(periodId, catId, age, cost, many) {
    var p = periodById(periodId), c = p && catById(p, catId);
    if (!c) return null;
    return limitOf(age === 'o70' ? c.o70 : c.u70, cost, many);
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
  function toExportFile(state) {
    return { tool: TOOL_ID, version: 1, exportedAt: new Date().toISOString(), data: normalizeInput(state) };
  }
  function fromExportFile(obj) {
    if (!obj || typeof obj !== 'object' || obj.tool !== TOOL_ID) return { ok: false, message: 'このツールで書き出したファイルではありません。' };
    if (obj.version !== 1) return { ok: false, message: 'ファイルの版が違います（version ' + obj.version + '）。' };
    return { ok: true, data: normalizeInput(obj.data) };
  }

  var api = {
    TOOL_ID: TOOL_ID, MAX_ROWS: MAX_ROWS, normalizeInput: normalizeInput, normalizeRow: normalizeRow, defaultRate: defaultRate,
    periodFor: periodFor, periodById: periodById, catById: catById,
    onePercent: onePercent, limitOf: limitOf, limitFor: limitFor, selfPay: selfPay, calc: calc,
    toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Kogaku = api;
})(this);
