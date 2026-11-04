// ===========================
// 傷病手当金の計算（画面から切り離した純粋関数。yorozu-plans ROADMAP 7.165 K210）
// 1 日あたりの額は健康保険法 99 条 2 項。式と端数・全被保険者の平均は出産手当金と同じなので lib/ikukyu.js の teateDaily を使い、
// 標準報酬月額の等級も ikukyu の hyojunFromSalary（協会けんぽの保険料額表）を使う。ここが持つのは
// 「12 か月の並べ方」「待期 3 日」「休んだ日に出た給与との差額（108 条 1 項）」だけ。
// 支給開始日は、休み始めた日から連続して 3 日休んだ次の日（初めて受けるとき）とする。
// DOM や localStorage には触らない。ブラウザでは window.Shobyo、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var NODE = typeof module !== 'undefined' && module.exports;
  var I = NODE ? require('./ikukyu.js') : root.Ikukyu;

  var CHECKED = '2026-11-03';  // 健康保険法 99 条・108 条（e-Gov）と協会けんぽ「傷病手当金」を最後に原文で確かめた日
  var TOOL_ID = 'seido-keisan-shobyo';
  var FILE_VERSION = 1;
  var MONTHS = 12;             // 支給開始日の属する月以前の直近の継続した 12 か月（99条2項）
  var TAIKI = 3;               // 待期: 労務に服することができなくなった日から起算して 3 日（99条1項）
  var STALE_MONTHS = 12;       // 確認日からこの月数がたったら画面に注意を出す
  var MIN_DATE = '2024-01-01'; // これより前の支給開始は扱わない（全被保険者の平均は令和7年3月31日以前 30 万円までしか持たない）

  // --- 入力の正規化（保存・ファイル読み込み・計算の前に必ず通す）。空欄は null ---
  function amount(v, max) {
    if (v === undefined || v === null) return null;
    var s = String(v).replace(/[,，\s円]/g, '');
    if (s === '') return null;
    var n = Math.floor(Number(s));
    if (!isFinite(n)) return null;
    return Math.min(Math.max(0, n), max);
  }
  function date(v) {
    var s = String(v || '');
    return I.parseDate(s) === null || s < MIN_DATE || s > '2099-12-31' ? null : s;
  }
  function normalizeInput(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var m = amount(r.months, MONTHS);
    var by = [];
    for (var i = 0; i < MONTHS; i++) by.push(amount(r.byMonth && r.byMonth[i], 1e8));
    return {
      from: date(r.from),            // 仕事を休み始めた日（労務に服することができなくなった日）
      to: date(r.to),                // 休んだ最後の日
      hyojun: amount(r.hyojun, 1e8), // 標準報酬月額（給与の総支給額を入れたら等級に直す）
      months: m === null || m < 1 ? MONTHS : m,   // 加入している月数（12 は 12 か月以上）
      byMonth: by,                   // 月ごとの標準報酬月額。0 番が支給開始日の月、i 番がその i か月前。null は hyojun と同じ
      kyuyo: amount(r.kyuyo, 1e7),   // 休んだ日に会社から出た給与（1 日あたり）
    };
  }

  function monthOf(dayNum) { var s = I.fmt(dayNum); return (+s.slice(0, 4)) * 12 + (+s.slice(5, 7) - 1); }
  function monthLabel(mi) { return Math.floor(mi / 12) + '年' + (mi % 12 + 1) + '月'; }

  /**
   * @param {object} raw 入力（normalizeInput を通す）
   * @param {string} [today] 'YYYY-MM-DD'。休み始めた日が空のとき、支給開始日の代わりに使う
   * @returns {object} { input, empty, start, startAssumed, months:[{label, hyojun}], under12, avg, per30, cap, capPer30, daily, rule,
   *   days, paidDays, perDay, total }
   */
  function calc(raw, today) {
    var d = normalizeInput(raw);
    var startDay = d.from ? I.parseDate(d.from) + TAIKI : I.parseDate(today || I.fmt(Math.floor(Date.now() / 864e5)));
    var start = I.fmt(startDay);
    var sm = monthOf(startDay);
    var months = [];
    for (var i = d.months - 1; i >= 0; i--) {
      var v = d.byMonth[i] !== null ? d.byMonth[i] : d.hyojun;
      months.push({ label: monthLabel(sm - i), hyojun: v === null ? null : I.hyojunFromSalary(v) });
    }
    var empty = months.some(function (m) { return m.hyojun === null; });
    var under12 = d.months < MONTHS;
    var r = {
      input: d, empty: empty, start: start, startAssumed: !d.from, months: months, under12: under12,
      cap: I.under12Amount(start), days: null, paidDays: null, perDay: null, total: null,
    };
    r.capPer30 = Math.floor(r.cap / 30 / 10 + 0.5) * 10;
    if (empty) return r;

    var sum = months.reduce(function (a, m) { return a + m.hyojun; }, 0);
    r.avg = sum / months.length;
    var t = I.teateDaily(r.avg, under12, start);
    r.per30 = Math.floor(r.avg / 30 / 10 + 0.5 + 1e-9) * 10;  // 加入期間の平均 ÷ 30（12 か月未満のときに全被保険者の平均と並べて見せる）
    r.daily = t.daily;
    r.rule = t.rule;

    if (d.from && d.to && d.to >= d.from) {
      r.days = I.parseDate(d.to) - I.parseDate(d.from) + 1;
      r.paidDays = Math.max(0, r.days - TAIKI);
    }
    r.perDay = d.kyuyo === null ? r.daily : Math.max(0, r.daily - d.kyuyo);
    if (r.paidDays !== null) r.total = r.perDay * r.paidDays;
    return r;
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
  function toExportFile(data, now) {
    return { tool: TOOL_ID, version: FILE_VERSION, exportedAt: (now || new Date()).toISOString(), data: normalizeInput(data) };
  }
  function fromExportFile(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, message: 'ファイルの形式が違います（JSON ではありません）。' };
    if (obj.tool !== TOOL_ID) return { ok: false, message: 'このツール（傷病手当金の計算）で書き出したファイルではありません。' };
    if (typeof obj.version !== 'number' || obj.version > FILE_VERSION) return { ok: false, message: '新しい版のファイルのため読み込めません。ページを再読み込みしてからお試しください。' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, message: 'ファイルに入力内容がありません。' };
    return { ok: true, data: normalizeInput(obj.data), exportedAt: obj.exportedAt };
  }

  var api = {
    CHECKED: CHECKED, TOOL_ID: TOOL_ID, FILE_VERSION: FILE_VERSION, MONTHS: MONTHS, TAIKI: TAIKI, STALE_MONTHS: STALE_MONTHS,
    calc: calc, normalizeInput: normalizeInput, toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (NODE) module.exports = api;
  else root.Shobyo = api;
})(this);
