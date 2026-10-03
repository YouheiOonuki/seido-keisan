// ===========================
// 制度の計算機 — 子どもの定期の予防接種のスケジュール（計算）
// 値は lib/yobosesshu-values.js。日付の決め方はそのファイルの冒頭（厚生労働省の事務連絡 平成26年3月11日）
// 日付は 'YYYY-MM-DD' の文字列で受け渡しする（時刻・時差を持ち込まない）
// ブラウザでは window.Yobosesshu、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var V = typeof module !== 'undefined' && module.exports ? require('./yobosesshu-values.js') : root.YobosesshuValues;

  function parse(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var t = Date.UTC(y, mo - 1, d), dt = new Date(t);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }
  function fmt(o) { return o.y + '-' + (o.m < 10 ? '0' : '') + o.m + '-' + (o.d < 10 ? '0' : '') + o.d; }
  function toUtc(o) { return Date.UTC(o.y, o.m - 1, o.d); }
  function fromUtc(t) { var d = new Date(t); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; }
  function addDays(o, n) { return fromUtc(toUtc(o) + n * 86400000); }
  function lastDay(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  /** 生後 n 月に達した日: n か月後の同じ日の前日。同じ日が無い月は、その月の末日（事務連絡） */
  function reachMonths(b, n) {
    var mi = b.m - 1 + n, y = b.y + Math.floor(mi / 12), m = (mi % 12) + 1;
    if (b.d > lastDay(y, m)) return { y: y, m: m, d: lastDay(y, m) };
    return addDays({ y: y, m: m, d: b.d }, -1);
  }
  /** 年度の初日（4 月 1 日）と末日（3 月 31 日） */
  function fiscalYear(o) { return o.m >= 4 ? o.y : o.y - 1; }
  /** 小学校就学の始期: 6 歳の誕生日（満 6 歳に達した日の翌日）以後の最初の 4 月 1 日（学校教育法 17 条） */
  function schoolStart(b) {
    var bd6 = addDays(reachMonths(b, 72), 1);   // 6 歳の誕生日（2 月 29 日生まれは 3 月 1 日）
    var y = bd6.m < 4 || (bd6.m === 4 && bd6.d === 1) ? bd6.y : bd6.y + 1;
    return { y: y, m: 4, d: 1 };
  }

  /** 1 つの指定（{ m } { y } { d } { fyStart } { fyEnd } { school, end } { birth }）→ 日付 */
  function resolve(b, spec) {
    if (spec.birth) return b;
    if (spec.m != null) return reachMonths(b, spec.m);
    if (spec.y != null) return reachMonths(b, spec.y * 12);
    if (spec.d != null) return addDays(b, spec.d);
    if (spec.fyStart != null) return { y: fiscalYear(reachMonths(b, spec.fyStart * 12)), m: 4, d: 1 };
    if (spec.fyEnd != null) return { y: fiscalYear(reachMonths(b, spec.fyEnd * 12)) + 1, m: 3, d: 31 };
    if (spec.school != null) {
      var s = schoolStart(b), d = { y: s.y + spec.school, m: 4, d: 1 };
      return spec.end ? addDays(d, -1) : d;
    }
    throw new Error('unknown spec');
  }
  function range(b, pair) { return pair ? { from: fmt(resolve(b, pair[0])), to: fmt(resolve(b, pair[1])) } : null; }

  /** いまの状態（today と範囲の比較）。std は標準の時期、target は定期接種の期間 */
  function status(today, std, target) {
    if (target && today > target.to) return 'ended';          // 定期接種の期間が終わった
    if (!std) return 'follow';                                 // 前の回から数える
    if (today < std.from) return 'before';
    if (today <= std.to) return 'now';
    return 'late';                                             // 標準の時期は過ぎたが、定期接種の期間内
  }

  /**
   * 生年月日から一覧を作る
   * @param {string} birth 'YYYY-MM-DD'  @param {string} today 'YYYY-MM-DD'
   * @returns {{rows, now, next}} rows はワクチン・回ごと。now は標準の時期に入っている回、next はこれから始まる最初の回の日
   */
  function schedule(birth, today) {
    var b = parse(birth);
    if (!b) return null;
    var rows = [];
    V.VACCINES.forEach(function (v) {
      var target = range(b, v.target);
      v.doses.forEach(function (d, i) {
        var std = range(b, d.std);
        rows.push({ id: v.id + '-' + i, vaccine: v.id, name: v.name, short: v.short, girls: !!v.girls, dose: d.label, first: i === 0,
          std: std, stdText: d.stdText || '', gap: d.gap || '', target: target, targetText: v.targetText, note: v.note,
          status: today ? status(today, std, target) : null });
      });
    });
    var now = rows.filter(function (r) { return r.status === 'now'; });
    var upcoming = rows.filter(function (r) { return r.status === 'before'; }).sort(function (a, c) { return a.std.from < c.std.from ? -1 : a.std.from > c.std.from ? 1 : 0; });
    var next = upcoming.length ? { date: upcoming[0].std.from, rows: upcoming.filter(function (r) { return r.std.from === upcoming[0].std.from; }) } : null;
    var late = rows.filter(function (r) { return r.status === 'late'; });
    return { birth: birth, rows: rows, now: now, next: next, late: late };
  }

  /** 'YYYY-MM-DD' → '2026年5月10日' */
  function ja(s) { var o = parse(s); return o ? o.y + '年' + o.m + '月' + o.d + '日' : ''; }
  /** 'YYYY-MM-DD' → '2026/5/10'（表用の短い形） */
  function short(s) { var o = parse(s); return o ? o.y + '/' + o.m + '/' + o.d : ''; }

  var api = { parse: parse, fmt: fmt, reachMonths: function (b, n) { return fmt(reachMonths(parse(b), n)); },
    schoolStart: function (b) { return fmt(schoolStart(parse(b))); }, resolve: function (b, spec) { return fmt(resolve(parse(b), spec)); },
    schedule: schedule, status: status, ja: ja, short: short };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Yobosesshu = api;
})(this);
