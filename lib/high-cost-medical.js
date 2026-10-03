// ===========================
// 高額療養費の計算（Japan high-cost medical expense benefit calculator、英語ページ）— 画面から切り離した純粋関数
// 計算は日本語の高額療養費の計算（lib/kogaku.js）の calc をそのまま呼ぶ。上限額・区分は lib/kogaku-values.js にだけある
// （値を写さない。企画書 70）。区分の名前は値ファイルの日本語の文字列（「83万円以上」「年収約370万〜約770万円」など）を
// 機械で英語に直す（数字は写さない。直せない文字列が来たらテストが落ちる）。
// ブラウザでは window.HighCostMedical、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var K = isNode ? require('./kogaku.js') : root.Kogaku;
  var V = isNode ? require('./kogaku-values.js') : root.KogakuValues;

  var TOOL_ID = 'seido-keisan-high-cost-medical';
  var FILE_VERSION = 1;
  var AGEPLANS = ['u70', 'o70', 'kouki'];

  // 「1,160万」→ 11600000、「83万」→ 830000
  function man(s) { return Math.round(Number(String(s).replace(/,/g, '')) * 10000); }
  function yenM(n) {   // 円 → 「¥11.6 million」「¥830,000」
    if (n >= 1000000) return '¥' + (Math.round(n / 10000) / 100) + ' million';   // 万円の値をそのまま（丸めない）
    return '¥' + n.toLocaleString('en-US');
  }
  function yenA(n) { return '¥' + n.toLocaleString('en-US'); }

  // 金額の幅の日本語（値ファイルの kenpo・kokuho・kouki）→ 英語。直せないときは null
  function rangeEn(s, fmt) {
    fmt = fmt || yenA;
    var t = String(s), m;
    if (t === '住民税非課税') return 'exempt from residence tax';
    if (t === '住民税非課税で所得が一定以下' || t === '同左') return 'exempt from residence tax, very low income';
    if ((m = /^([\d,]+)万〜([\d,]+)万円$/.exec(t))) return fmt(man(m[1])) + ' to ' + fmt(man(m[2]));
    if ((m = /^([\d,]+)万円以上$/.exec(t))) return fmt(man(m[1])) + ' or more';
    if ((m = /^([\d,]+)万円超$/.exec(t))) return 'over ' + fmt(man(m[1]));
    if ((m = /^([\d,]+)万円以下$/.exec(t))) return fmt(man(m[1])) + ' or less';
    if ((m = /^([\d,]+)万円未満$/.exec(t))) return 'under ' + fmt(man(m[1]));
    return null;
  }
  // 区分の name の年収の部分（「ア（年収約1,160万円〜）」「年収約370万〜約510万円」「年収〜約200万円」「住民税非課税」）→ 英語
  function incomeEn(name) {
    var t = String(name), m;
    if (/住民税非課税/.test(t)) return /一定以下/.test(t) ? 'Exempt from residence tax, very low income (70 and over)' : 'Exempt from residence tax';
    if ((m = /年収約([\d,]+)万〜約([\d,]+)万円/.exec(t))) return 'Income about ' + yenM(man(m[1])) + ' to ' + yenM(man(m[2]));
    if ((m = /年収約([\d,]+)万円〜/.exec(t))) return 'Income about ' + yenM(man(m[1])) + ' or more';
    if ((m = /年収〜約([\d,]+)万円/.exec(t))) return 'Income up to about ' + yenM(man(m[1]));
    return null;
  }
  // 70 歳以上の区分の名前（現役並みⅠ〜Ⅲ・一般・低所得Ⅰ・Ⅱ）→ 英語
  var ROMAN = { 'Ⅰ': ' I', 'Ⅱ': ' II', 'Ⅲ': ' III' };
  function o70En(s) {
    var t = String(s), m;
    if ((m = /^現役並み(Ⅰ|Ⅱ|Ⅲ)?$/.exec(t))) return 'Working-level income' + (m[1] ? ROMAN[m[1]] : '');
    if (t === '一般') return 'General';
    if ((m = /^低所得(Ⅰ|Ⅱ)$/.exec(t))) return 'Low income' + ROMAN[m[1]];
    return null;
  }
  // 区分（値ファイルの 1 行）→ 英語の表示
  function catEn(c) {
    var hyojun = rangeEn(c.kenpo);
    return {
      id: c.id,
      income: incomeEn(c.name),
      hyojun: hyojun,                       // 健康保険（会社員）の標準報酬月額
      nhi: rangeEn(c.kokuho, yenM),         // 国保（旧ただし書き所得）
      o70: o70En(c.o70name),
      o70taxable: rangeEn(c.kouki, yenM),   // 70 歳以上の国保・後期（課税所得）
    };
  }
  // 診療月の表 → 英語の期間
  var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function ymEn(ym) { var p = ym.split('-'); return MON[Number(p[1]) - 1] + ' ' + p[0]; }
  function periodEn(p) {
    if (!p.from) return 'Treatment up to ' + ymEn(p.to);
    if (!p.to) return 'Treatment from ' + ymEn(p.from);
    return 'Treatment from ' + ymEn(p.from) + ' to ' + ymEn(p.to);
  }

  function num(v) { var n = Math.floor(Number(String(v === undefined || v === null ? '' : v).replace(/[,，\s¥]/g, ''))); return isFinite(n) && n > 0 ? Math.min(n, 1e10) : 0; }
  function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }

  function normalizeInput(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var ageplan = pick(r.ageplan, AGEPLANS, 'u70');
    var age = ageplan === 'u70' ? 'u70' : 'o70';
    var rate = Number(r.rate);
    if (V.RATES.indexOf(rate) < 0) rate = K.defaultRate(age, ageplan === 'kouki' ? 'kouki' : 'kenpo');
    return {
      ageplan: ageplan,
      period: K.periodById(r.period) ? r.period : null,
      cat: typeof r.cat === 'string' ? r.cat : '',
      cost: num(r.cost),
      place: pick(r.place, ['in', 'out'], 'in'),
      rate: rate,
      many: !!r.many,
    };
  }

  // 日本語の高額療養費の計算（lib/kogaku.js）の入力の形に直す（本人・1 か所。世帯合算は日本語の画面で）
  function toKogakuInput(d) {
    return {
      plan: d.ageplan === 'kouki' ? 'kouki' : 'kenpo',
      period: d.period, cat: d.cat, many: d.many,
      rows: [{ who: 'self', age: d.ageplan === 'u70' ? 'u70' : 'o70', place: d.place, cost: d.cost, rate: d.rate }],
    };
  }

  // 戻り値 { ready, input, k（lib/kogaku.js の calc の結果）, period, cat, catEn }
  function calc(raw, todayYm) {
    var d = normalizeInput(raw);
    var k = K.calc(toKogakuInput(d), todayYm);
    var out = { input: d, k: k, period: k.period, ready: k.ready };
    out.cat = k.cat;
    out.catEn = k.cat ? catEn(k.cat) : null;
    return out;
  }

  // 選べる区分（70 歳未満では「所得が一定以下・70 歳以上」を出さない。日本語の画面と同じ）
  function catsFor(period, ageplan) {
    return period.cats.filter(function (c) { return !(ageplan === 'u70' && c.o70only); });
  }

  function toExportFile(data, now) {
    return { tool: TOOL_ID, version: FILE_VERSION, exportedAt: (now || new Date()).toISOString(), data: normalizeInput(data) };
  }
  function fromExportFile(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, code: 'notJson' };
    if (obj.tool !== TOOL_ID) return { ok: false, code: 'otherTool' };
    if (typeof obj.version !== 'number' || obj.version > FILE_VERSION) return { ok: false, code: 'newer' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, code: 'empty' };
    return { ok: true, data: normalizeInput(obj.data) };
  }

  var api = {
    TOOL_ID: TOOL_ID, FILE_VERSION: FILE_VERSION,
    rangeEn: rangeEn, incomeEn: incomeEn, o70En: o70En, catEn: catEn, periodEn: periodEn, ymEn: ymEn, yenA: yenA,
    normalizeInput: normalizeInput, toKogakuInput: toKogakuInput, calc: calc, catsFor: catsFor,
    toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (isNode) module.exports = api;
  else root.HighCostMedical = api;
})(this);
