// ===========================
// 脱退一時金（Japan pension refund / Lump-sum Withdrawal Payment）の計算（画面から切り離した純粋関数）
// 手順は日本年金機構「脱退一時金の制度」「国民年金の脱退一時金額」、請求書（英語）、国税庁「退職所得の選択課税の記載例」のとおり:
//   国民年金 = 基準月（最後に保険料を納付した月）の年度の表の額（数 = 保険料納付済期間等の月数を 6 月ごとに切り捨て、上限 60/36）
//   厚生年金 = 平均標準報酬額 × 支給率（最終月の表。数は同じく 6 月ごと、上限 60/36）。20.42% を源泉徴収（1円未満切り捨て）
//   両制度は合算しない（それぞれ 6 月以上）。還付の目安 = 源泉 −（退職所得の選択課税の税額）
// 値は lib/dattai-values.js にだけ置く。文言は lib/pension-refund-text.js（日英）。DOM や localStorage には触らない。
// ブラウザでは window.PensionRefund、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var NODE = typeof module !== 'undefined' && module.exports;
  var V = NODE ? require('./dattai-values.js') : root.DattaiValues;

  var TOOL_ID = 'seido-keisan-dattai';
  var FILE_VERSION = 1;

  // --- 年月 ---
  // "2026-08"・"2026/8"・"2026.8" を受け付けて "2026-08" にする。読めなければ null
  function parseYm(v) {
    if (v === undefined || v === null) return null;
    var m = String(v).trim().match(/^(\d{4})\s*[-\/.年]\s*(\d{1,2})\s*月?$/);
    if (!m) return null;
    var y = +m[1], mo = +m[2];
    if (y < 1990 || y > 2100 || mo < 1 || mo > 12) return null;
    return y + '-' + (mo < 10 ? '0' : '') + mo;
  }
  function parseDate(v) {
    if (v === undefined || v === null) return null;
    var m = String(v).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
    return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
  }
  function ymIndex(ym) { var p = ym.split('-'); return +p[0] * 12 + (+p[1] - 1); }
  // 年度（4 月始まり）
  function fiscalYear(ym) { var p = ym.split('-'); return +p[1] >= 4 ? +p[0] : +p[0] - 1; }
  // 日付から 2 年後の同じ月日（2 月 29 日は 2 月 28 日にする）
  function addYears(date, n) {
    var p = date.split('-'), y = +p[0] + n, mo = +p[1], d = +p[2];
    var last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    if (d > last) d = last;
    return y + '-' + p[1] + '-' + (d < 10 ? '0' : '') + d;
  }

  // --- 入力の正規化（保存・ファイル読み込み・計算の前に必ず通す） ---
  // 数は 0 以上の整数。空欄は null（「入れていない」と 0 を分ける）
  function num(v, max) {
    if (v === undefined || v === null) return null;
    var s = String(v).replace(/[,，\s円¥]/g, '');
    if (s === '') return null;
    var n = Math.floor(Number(s));
    if (!isFinite(n)) return null;
    return Math.min(Math.max(0, n), max);
  }
  var KYOTEI_KEYS = V.kyotei.map(function (k) { return k[0]; });

  function normalizeInput(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var ep = r.ep && typeof r.ep === 'object' ? r.ep : {};
    var np = r.np && typeof r.np === 'object' ? r.np : {};
    return {
      ep: {
        months: num(ep.months, 600),            // 厚生年金の被保険者期間の月数
        last: parseYm(ep.last),                 // 最終月（資格を失った日の属する月の前月）
        salary: num(ep.salary, 1e8),            // 平均の月給（額面）→ 等級表で標準報酬月額に
        avg: num(ep.avg, 1e8),                  // 平均標準報酬額を直接入れるとき（月給・賞与より優先）
        bonus: num(ep.bonus, 1e9),              // 賞与 1 回の額（額面）
        bonusCount: num(ep.bonusCount, 200),    // 期間中に賞与を受けた回数
      },
      np: {
        months: num(np.months, 600),            // 国民年金の保険料を全額納めた月数（第 1 号被保険者）
        last: parseYm(np.last),                 // 最後に保険料を納めた月（基準月）
        q1: num(np.q1, 600),                    // 4 分の 1 免除の月数
        half: num(np.half, 600),                // 半額免除の月数
        q3: num(np.q3, 600),                    // 4 分の 3 免除の月数
      },
      left: parseDate(r.left),                  // 日本に住所を有しなくなった日（転出日。予定でもよい）
      japanese: !!r.japanese,                   // 日本国籍がある → 請求できない
      disability: !!r.disability,               // 障害年金などを受ける権利を有したことがある → 請求できない
      country: KYOTEI_KEYS.indexOf(r.country) >= 0 ? r.country : '',   // 出身国（協定の注意だけに使う。額は変えない）
      refund: r.refund === undefined ? true : !!r.refund,              // 還付の目安を出す
      otherRetirement: !!r.otherRetirement,     // 同じ年に会社の退職金なども受けた → 目安を出さない（合算が要る）
    };
  }

  // --- 厚生年金 ---
  // 報酬月額 → 標準報酬月額（1〜32 等級）
  function gradeOf(salary) {
    var t = V.grades;
    for (var i = 0; i < t.length; i++) if (salary < t[i][0]) return t[i][1];
    return t[t.length - 1][1];
  }
  // 賞与 1 回 → 標準賞与額（1,000円未満切り捨て、150万円まで）
  function bonusStd(bonus) { return Math.min(Math.floor(bonus / V.bonus.unit) * V.bonus.unit, V.bonus.cap); }
  // 最終月の支給率の表と上限
  function rateTable(last) {
    if (ymIndex(last) >= ymIndex(V.cap60From)) return { table: V.shikyuritsu.from202104, cap: 60 };
    if (ymIndex(last) >= ymIndex(V.kouseiFrom)) return { table: V.shikyuritsu.from201709, cap: 36 };
    return null;
  }
  // 支給率を 保険料率 × 1/2 × 数（小数点以下 1 位に四捨五入）で出す（表との突き合わせ用）
  function rateFromHokenryo(pct, n) { return Math.round(pct * n / 2 / 100 * 10 + 1e-9) / 10; }
  // 数（6・12・…）: 月数を 6 月ごとに切り捨て、上限まで
  function kazu(months, cap) { return Math.min(Math.floor(months / V.step) * V.step, cap); }

  function withholding(amount) { return Math.floor(amount * V.gensen / 10000); }

  // --- 退職所得の選択課税（所得税法 30条・89条・171条、国税庁の記載例） ---
  // 収入 amount・勤続年数 years の税額（所得税 ＋ 復興特別所得税）
  function sentakuTax(amount, years) {
    var T = V.taishoku;
    var kojo = Math.max(T.min, T.perYear * years);
    var x = Math.max(0, amount - kojo);
    var shotoku = years <= T.shortYears
      ? Math.floor(Math.min(x, T.shortLimit) / 2) + Math.max(0, x - T.shortLimit)   // 勤続 5 年以下: 300万円を超える部分は 1/2 にしない
      : Math.floor(x / 2);
    var taxable = Math.floor(shotoku / 1000) * 1000;
    var br = V.sokusan.filter(function (b) { return taxable <= b[0]; })[0];
    var kijun = Math.max(0, Math.floor(taxable * br[1] / 100) - br[2]);
    var fukko = Math.floor(kijun * V.fukkou / 1000);
    return { years: years, kojo: kojo, x: x, shotoku: shotoku, taxable: taxable, pct: br[1], minus: br[2], kijun: kijun, fukko: fukko, total: kijun + fukko, short: years <= T.shortYears };
  }

  function calcKousei(d, missing) {
    var e = d.ep;
    var r = { status: 'none', months: e.months };
    if (!e.months) return r;
    if (e.last === null) missing.push('ep.last');
    if (e.avg === null && e.salary === null) missing.push('ep.salary');
    if (e.last === null || (e.avg === null && e.salary === null)) { r.status = 'missing'; return r; }
    r.last = e.last;
    var rt = rateTable(e.last);
    if (!rt) { r.status = 'outOfScope'; return r; }
    r.cap = rt.cap;
    r.overCap = e.months > rt.cap;
    if (e.months < V.minMonths) { r.status = 'short'; return r; }
    r.n = kazu(e.months, rt.cap);
    r.rate = rt.table[r.n / V.step - 1];
    var r10 = Math.round(r.rate * 10);
    if (e.avg !== null) {
      r.avgSource = 'direct';
      r.avg = e.avg;
      r.amount = Math.floor(e.avg * r10 / 10);
    } else {
      r.avgSource = 'salary';
      r.grade = gradeOf(e.salary);
      r.bonusStd = e.bonus && e.bonusCount ? bonusStd(e.bonus) : 0;
      r.bonusCount = e.bonus && e.bonusCount ? e.bonusCount : 0;
      r.bonusTotal = r.bonusStd * r.bonusCount;
      var sum = r.grade * e.months + r.bonusTotal;     // 標準報酬月額の総額（全月同じ等級とみなす）＋ 標準賞与額の総額
      r.avg = Math.floor(sum / e.months);              // 表示用（1円未満切り捨て）
      r.amount = Math.floor(sum * r10 / (10 * e.months));
      r.newGradeTable = ymIndex(e.last) > ymIndex(V.gradeTableTo);
    }
    r.withheld = withholding(r.amount);
    r.net = r.amount - r.withheld;
    r.status = 'ok';
    return r;
  }

  function calcKokunen(d, missing) {
    var p = d.np;
    var units = (p.months || 0) * 4 + (p.q1 || 0) * V.exempt.q1 + (p.half || 0) * V.exempt.half + (p.q3 || 0) * V.exempt.q3;   // 4 分の 1 月の単位
    var r = { status: 'none', units: units, months: units / 4 };
    if (!units) return r;
    if (p.last === null) { missing.push('np.last'); r.status = 'missing'; return r; }
    r.last = p.last;
    r.fy = fiscalYear(p.last);
    if (r.fy < V.kokunenFromFY) { r.status = 'outOfScope'; return r; }
    var table = V.kokunen[r.fy];
    if (!table) { r.status = 'notPublished'; return r; }
    r.cap = table.length * V.step;
    r.overCap = units > r.cap * 4;
    if (units < V.minMonths * 4) { r.status = 'short'; return r; }
    r.n = kazu(units / 4, r.cap);
    r.amount = table[r.n / V.step - 1];
    r.status = 'ok';
    return r;
  }

  /**
   * 脱退一時金の額と、還付の目安・請求期限・協定の注意を出す
   * @returns {object} { ready, missing[], blocked[], ep, np, gross, withheld, total, tax, deadline, kyotei, input }
   */
  function calc(input) {
    var d = normalizeInput(input);
    var missing = [];
    var ep = calcKousei(d, missing);
    var np = calcKokunen(d, missing);
    if (!d.ep.months && !np.units) missing.push('any');

    // 請求できない理由（両制度に共通）
    var blocked = [];
    if (d.japanese) blocked.push('japanese');
    if (d.disability) blocked.push('disability');
    var qualify = (d.ep.months || 0) + (d.np.months || 0) + (d.np.q1 || 0) + (d.np.half || 0) + (d.np.q3 || 0);
    if (qualify >= V.qualifyMonths) blocked.push('qualify');

    var res = { input: d, missing: missing, blocked: blocked, ep: ep, np: np, qualifyMonths: qualify };
    var epOk = ep.status === 'ok' && !blocked.length, npOk = np.status === 'ok' && !blocked.length;
    res.ready = ep.status !== 'none' && ep.status !== 'missing' || np.status !== 'none' && np.status !== 'missing';
    res.ready = res.ready && missing.length === 0;
    res.payable = epOk || npOk;
    res.gross = (epOk ? ep.amount : 0) + (npOk ? np.amount : 0);
    res.withheld = epOk ? ep.withheld : 0;
    res.total = res.gross - res.withheld;           // 振り込まれる額（厚生年金は源泉徴収の後）

    // 還付の目安（厚生年金の分だけ。国民年金は源泉徴収されない）
    res.tax = null;
    if (epOk && d.refund && !d.otherRetirement) {
      var base = Math.ceil(Math.min(ep.months, ep.cap) / 12);   // 上限（60/36 月）までの月数で数えた勤続年数（1 年未満は切り上げ）
      var all = Math.ceil(ep.months / 12);           // 全期間で数えた勤続年数（上限を超える人だけ違う。企画書 16 の開いた問い 1）
      var a = sentakuTax(ep.amount, base);
      var b = all !== base ? sentakuTax(ep.amount, all) : null;
      var ra = Math.max(0, ep.withheld - a.total), rb = b ? Math.max(0, ep.withheld - b.total) : ra;
      res.tax = { cases: b ? [a, b] : [a], refundMin: Math.min(ra, rb), refundMax: Math.max(ra, rb), range: !!b && ra !== rb };
    }

    // 請求の期限（日本に住所を有しなくなった日から 2 年）
    res.deadline = d.left ? { from: d.left, to: addYears(d.left, V.deadlineYears) } : null;

    // 社会保障協定（出身国を入れた人だけ。額は変えない）
    res.kyotei = null;
    V.kyotei.forEach(function (k) {
      if (k[0] === d.country) res.kyotei = { key: k[0], en: k[1], ja: k[2], since: k[3], totalize: k[4] };
    });
    return res;
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
  function toExportFile(data, now) {
    return { tool: TOOL_ID, version: FILE_VERSION, exportedAt: (now || new Date()).toISOString(), data: normalizeInput(data) };
  }
  function fromExportFile(obj) {
    if (!obj || typeof obj !== 'object' || obj.tool !== TOOL_ID) return { ok: false, code: 'notThisTool' };
    if (typeof obj.version !== 'number' || obj.version > FILE_VERSION) return { ok: false, code: 'newerVersion' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, code: 'noData' };
    return { ok: true, data: normalizeInput(obj.data), exportedAt: obj.exportedAt };
  }

  var api = {
    TOOL_ID: TOOL_ID, FILE_VERSION: FILE_VERSION,
    parseYm: parseYm, parseDate: parseDate, fiscalYear: fiscalYear, addYears: addYears,
    gradeOf: gradeOf, bonusStd: bonusStd, rateTable: rateTable, rateFromHokenryo: rateFromHokenryo, kazu: kazu,
    withholding: withholding, sentakuTax: sentakuTax,
    normalizeInput: normalizeInput, calc: calc, toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (NODE) module.exports = api;
  else root.PensionRefund = api;
})(this);
