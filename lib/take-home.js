// ===========================
// 手取りの計算（Japan take-home pay calculator、英語ページ）— 画面から切り離した純粋関数
// 会社員（協会けんぽ・厚生年金・雇用保険に入っている居住者）の月給・賞与から、
//   社会保険料（健康保険・介護・子ども・子育て支援金・厚生年金・雇用保険）→ 所得税（年末調整の計算）→ 住民税（翌年度分）
//   → 月と年の手取り
// を出す。計算は既存のエンジンをそのまま呼ぶ（値も計算も写さない）:
//   所得税    lib/nenmatsu.js の calc（令和8年分）
//   住民税    lib/juminzei.js の calc（令和9年度＝令和8年の所得）
//   健康保険・介護・支援金・厚生年金（月）  lib/ikukyu.js の hyojunFromSalary・monthlyPremium
//   賞与の端数   lib/shienkin.js の deductYen、標準賞与額の上限は lib/shienkin-values.js・lib/dattai-values.js
// ここで足しているのは雇用保険（lib/take-home-values.js）と、年の税を月・賞与に割り振る按分だけ。
// ブラウザでは window.TakeHome、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var TV = isNode ? require('./take-home-values.js') : root.TakeHomeValues;
  var N = isNode ? require('./nenmatsu.js') : root.Nenmatsu;
  var J = isNode ? require('./juminzei.js') : root.Juminzei;
  var Ik = isNode ? require('./ikukyu.js') : root.Ikukyu;
  var IV = isNode ? require('./ikukyu-values.js') : root.IkukyuValues;
  var Sh = isNode ? require('./shienkin.js') : root.Shienkin;
  var SV = isNode ? require('./shienkin-values.js') : root.ShienkinValues;
  var DV = isNode ? require('./dattai-values.js') : root.DattaiValues;
  var TAX = isNode ? require('./tax2026.js') : root.TaxValues;

  var TOOL_ID = 'seido-keisan-take-home';
  var FILE_VERSION = 1;
  var MAX_KIDS = 10;

  // 率を読む月（lib/ikukyu.js の月の番号 ＝ 年 × 12 ＋ 月 − 1）
  var PREMIUM_MI = (function () { var p = TV.premiumMonth.split('-'); return Number(p[0]) * 12 + Number(p[1]) - 1; })();

  // 雇用保険の被保険者負担分: 賃金 × 率。源泉控除は 50銭以下切り捨て・50銭1厘以上切り上げ（沖縄労働局の案内）
  // 1,000 分の perMille なので、賃金 × perMille が「厘」の整数になる
  function koyoPremium(wage) {
    var rin = Math.max(0, Math.floor(wage)) * TV.koyo.perMille;
    var y = Math.floor(rin / 1000), r = rin - y * 1000;
    return r > 500 ? y + 1 : y;
  }

  // 賞与 1 回分の社会保険料。healthLeft は健康保険・支援金の標準賞与額の年度の累計の残り（573万円から）
  function bonusPremium(b, d, healthLeft) {
    var std = Math.floor(b / SV.bonusUnit) * SV.bonusUnit;
    var hStd = Math.min(std, healthLeft);
    var h = hStd > 0 ? Ik.monthlyPremium(hStd, PREMIUM_MI, { pref: d.pref, over40: d.over40 }) : { kenpo: 0, shien: 0 };
    var pStd = Math.min(std, DV.bonus.cap);
    // 厚生年金: 標準賞与額 × 18.3% × 1/2。銭で計算して給与と同じ端数（50銭以下切り捨て）
    var pension = Sh.deductYen(pStd * Math.round(IV.hoken.kounenRate * 10) / 20);
    return { gross: b, std: std, healthStd: hStd, health: h.kenpo, shien: h.shien, pension: pension, koyo: koyoPremium(b) };
  }

  function sumSi(x) { return x.health + x.shien + x.pension + x.koyo; }

  /**
   * 手取りを計算する
   * @param {object} raw 画面の入力（normalizeInput を通す）
   */
  function calc(raw) {
    var d = normalizeInput(raw);
    var out = { input: d, ready: false };
    var bonus = d.bonus;
    var monthly;
    if (d.period === 'year') {
      bonus = Math.min(bonus, d.amount);
      monthly = Math.floor((d.amount - bonus) / 12);
    } else monthly = d.amount;
    if (!monthly && !bonus) return out;
    // 年で入れたときは入れた額をそのまま年収にする（月給は 12 で割った 1円未満切り捨て。差は数円）
    var gross = d.period === 'year' ? d.amount : monthly * 12 + bonus;

    if (gross > TAX.years[TV.taxYear].maxIncome) {
      out.error = 'over';
      return out;
    }

    // --- 社会保険料（月） ---
    var hyojun = Ik.hyojunFromSalary(monthly);
    var mp = Ik.monthlyPremium(hyojun, PREMIUM_MI, { pref: d.pref, over40: d.over40 });
    var m = { gross: monthly, hyojun: hyojun, hyojunPension: Ik.hyojunKounen(hyojun), health: mp.kenpo, shien: mp.shien, pension: mp.kounen, koyo: koyoPremium(monthly) };
    if (!monthly) { m.health = m.shien = m.pension = m.koyo = 0; }
    m.si = sumSi(m);

    // --- 賞与 ---
    var bonuses = [];
    var count = bonus > 0 ? d.bonusCount : 0;
    var left = SV.bonusCapYear;
    for (var i = 0; i < count; i++) {
      var b = i < count - 1 ? Math.floor(bonus / count) : bonus - Math.floor(bonus / count) * (count - 1);
      var bp = bonusPremium(b, d, left);
      left -= bp.healthStd;
      bp.si = sumSi(bp);
      bonuses.push(bp);
    }
    var bonusSi = bonuses.reduce(function (s, x) { return s + x.si; }, 0);
    var siYear = m.si * 12 + bonusSi;

    // --- 所得税（年末調整の計算をそのまま使う。令和8年分） ---
    var family = familyInput(d);
    var nen = N.calc({ income: gross, withheld: 0, shakai: siYear, spouse: family.spouse, relatives: family.relatives }, TV.taxYear);
    if (!nen.ok) { out.error = nen.error; return out; }

    // --- 住民税（令和9年度＝令和8年の所得。標準の税率・1級地） ---
    var jum = J.calc({ income: gross, shakai: siYear, spouse: family.spouse, relatives: family.relatives }, TV.juminNendo);
    var resYear = jum.total;
    var resMonth = jum.installments.tokubetsu.rest;      // 7 月〜翌年 5 月の 11 回の額（6 月は端数を足した額）
    var resFirst = jum.installments.tokubetsu.first;
    var paying = d.juminNow === 'same';

    // --- 年の所得税を月給・賞与に割り振る（給与の額に比例。1円未満切り捨て） ---
    var taxYear = nen.nenzei;
    m.incomeTax = gross > 0 ? Math.floor(taxYear * monthly / gross) : 0;
    m.resident = paying ? resMonth : 0;
    m.net = monthly - m.si - m.incomeTax - m.resident;
    bonuses.forEach(function (x) {
      x.incomeTax = Math.floor(taxYear * x.gross / gross);
      x.net = x.gross - x.si - x.incomeTax;
    });

    var resThisYear = paying ? resYear : 0;
    var net = gross - siYear - taxYear - resThisYear;

    out.ready = true;
    out.gross = gross;
    out.month = m;
    out.bonuses = bonuses;
    out.year = {
      gross: gross, si: siYear, incomeTax: taxYear, resident: resThisYear, net: net,
      health: m.health * 12 + bonuses.reduce(function (s, x) { return s + x.health; }, 0),
      shien: m.shien * 12 + bonuses.reduce(function (s, x) { return s + x.shien; }, 0),
      pension: m.pension * 12 + bonuses.reduce(function (s, x) { return s + x.pension; }, 0),
      koyo: m.koyo * 12 + bonuses.reduce(function (s, x) { return s + x.koyo; }, 0),
    };
    out.rate = gross > 0 ? (gross - net) / gross : 0;
    out.tax = {
      kyuyo: nen.kyuyoShotoku, kojo: nen.kojo, kiso: stepAmount(nen, 'kiso'), haigusha: nen.haigusha.amount,
      fuyo: nen.relatives.fuyo, tokutei: nen.relatives.tokutei, taxable: nen.taxable, sanshutsu: nen.sanshutsu, nenzei: nen.nenzei,
      pct: nen.taxable > 0 ? N.sokusan(nen.taxable, TV.taxYear).pct : 0,
    };
    out.resident = {
      total: resYear, month: resMonth, first: resFirst, paying: paying,
      wari: jum.wari, kinto: jum.prefKinto + jum.cityKinto + jum.shinrin, taxable: jum.taxable, kojo: jum.kojo,
      hikazei: jum.shotokuHikazei && jum.kintoHikazei,
    };
    out.prefRate = mp.rate;
    out.kaigoRate = mp.kaigo;
    out.shienRate = mp.shienRate;
    out.pensionCapped = monthly > 0 && m.hyojunPension !== hyojun;
    out.choseiMaybe = nen.choseiMaybe;
    return out;
  }

  function stepAmount(r, key) {
    for (var i = 0; i < r.steps.length; i++) if (r.steps[i].key === key) return r.steps[i].amount;
    return 0;
  }

  // 家族の入力を、年末調整・住民税の計算の形に直す（子どもは所得なしとみなす）
  function familyInput(d) {
    var rel = [];
    var add = function (n, age) { for (var i = 0; i < n; i++) rel.push({ age: age, incomeType: 'kyuyo', amount: 0, shogai: 'none' }); };
    add(d.kids.u16, 'u16');
    add(d.kids.a16, '16-18');
    add(d.kids.a19, '19-22');
    return {
      spouse: { has: d.spouse.has, incomeType: 'kyuyo', amount: d.spouse.has ? d.spouse.income : 0, over70: false, shogai: 'none' },
      relatives: rel,
    };
  }

  // --- 入力の正規化（保存・ファイル読み込み・計算の前に必ず通す） ---
  function num(v, max) {
    var n = Math.floor(Number(String(v === undefined || v === null ? '' : v).replace(/[,，\s¥円]/g, '')));
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(n, max || 1e9);
  }
  function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }
  var PREFS = Object.keys(IV.hoken.kyokai);

  function normalizeInput(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var sp = r.spouse || {}, k = r.kids || {};
    return {
      period: pick(r.period, ['month', 'year'], 'month'),
      amount: num(r.amount),
      bonus: num(r.bonus),
      bonusCount: pick(Number(r.bonusCount), [1, 2, 3], 2),
      pref: pick(r.pref, PREFS, 'tokyo'),
      over40: !!r.over40,
      spouse: { has: !!sp.has, income: num(sp.income) },
      kids: { u16: num(k.u16, MAX_KIDS), a16: num(k.a16, MAX_KIDS), a19: num(k.a19, MAX_KIDS) },
      juminNow: pick(r.juminNow, ['same', 'none'], 'same'),
    };
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
  function toExportFile(data, now) {
    return { tool: TOOL_ID, version: FILE_VERSION, exportedAt: (now || new Date()).toISOString(), data: normalizeInput(data) };
  }
  // 戻り値 { ok, data } または { ok:false, code }（code は画面の文言のキー）
  function fromExportFile(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, code: 'notJson' };
    if (obj.tool !== TOOL_ID) return { ok: false, code: 'otherTool' };
    if (typeof obj.version !== 'number' || obj.version > FILE_VERSION) return { ok: false, code: 'newer' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, code: 'empty' };
    return { ok: true, data: normalizeInput(obj.data) };
  }

  var api = {
    TOOL_ID: TOOL_ID, FILE_VERSION: FILE_VERSION, PREFS: PREFS,
    koyoPremium: koyoPremium, bonusPremium: bonusPremium, familyInput: familyInput,
    calc: calc, normalizeInput: normalizeInput, toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (isNode) module.exports = api;
  else root.TakeHome = api;
})(this);
