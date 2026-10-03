// ===========================
// 育休・産休の給付の計算（Japan childcare leave benefit calculator、英語ページ。K63）— 画面から切り離した純粋関数
// 英語の入力を日本語の育休・産休の計算（lib/ikukyu.js）の入力に直して、そのまま calc を呼ぶだけ。
// 上限額・率・日数は lib/ikukyu-values.js にだけある（値を写さない。企画書 70・ACCEPTANCE 3 章の束 G）。
// lib/ikukyu.js の messages・steps は日本語の文なので使わず、英語の画面が数字から文を組み立てるための
// 「注意のキー」（notices）をここで同じ条件から作る。
// ブラウザでは window.ChildcareLeave、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var I = isNode ? require('./ikukyu.js') : root.Ikukyu;
  var IV = isNode ? require('./ikukyu-values.js') : root.IkukyuValues;

  var TOOL_ID = 'seido-keisan-childcare-leave';
  var FILE_VERSION = 1;
  var ROLES = ['mother', 'partner'];
  var SPOUSE = ['leave14', 'noLeave', 'notEmployee', 'none'];

  function num(v, max) {
    var n = Math.floor(Number(String(v === undefined || v === null ? '' : v).replace(/[,，\s¥円]/g, '')));
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(n, max || 1e9);
  }
  function dateStr(v) { var n = I.parseDate(v); return n === null ? '' : I.fmt(n); }
  function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }

  function normalizeInput(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var pa = r.papa || {};
    return {
      role: pick(r.role, ROLES, 'mother'),
      salary: num(r.salary, 10000000),
      dueDate: dateStr(r.dueDate),
      birthDate: dateStr(r.birthDate),
      babies: pick(Number(r.babies), [1, 2, 3], 1),
      leaveStart: dateStr(r.leaveStart),
      leaveEnd: dateStr(r.leaveEnd),
      papa: { use: !!pa.use, start: dateStr(pa.start), end: dateStr(pa.end) },
      spouse: pick(r.spouse, SPOUSE, 'leave14'),
      wage6: num(r.wage6, 60000000),
      hyojun: num(r.hyojun, 10000000),
      under12: !!r.under12,
      over40: !!r.over40,
    };
  }

  // 日本語の計算（lib/ikukyu.js）の入力の形に直す。健康保険は協会けんぽ東京（日本語の画面の既定と同じ）
  function toIkukyuInput(d) {
    return {
      role: d.role === 'partner' ? 'father' : 'mother',
      salary: d.salary, hyojun: d.hyojun, wage6: d.wage6, under12: d.under12,
      dueDate: d.dueDate, birthDate: d.birthDate, babies: d.babies, sanka: true,
      leaveStart: d.role === 'partner' ? d.leaveStart : '', leaveEnd: d.leaveEnd,
      papa: d.role === 'partner' ? d.papa : { use: false },
      spouse: d.spouse, pref: 'tokyo', over40: d.over40,
    };
  }

  /**
   * 給付を計算する
   * 戻り値 { ready, input, r（lib/ikukyu.js の calc の結果）, notices: ['papaDates', ...], need }
   */
  function calc(raw) {
    var d = normalizeInput(raw);
    var out = { input: d, ready: false, notices: [] };
    var r = I.calc(toIkukyuInput(d));
    out.r = r;
    if (!r.ok) { out.need = r.need === 'due' ? 'dueDate' : 'salary'; return out; }
    out.ready = true;
    var k = IV.koyo, P = I.parseDate;
    var early = Math.min(r.birth, r.due), late = Math.max(r.birth, r.due);
    // 日本語の calc が messages を出すのと同じ条件（lib/ikukyu.js の本体）
    if (d.role === 'partner' && d.papa.use) {
      var ps = P(d.papa.start), pe = P(d.papa.end);
      if (ps === null || pe === null || pe < ps) out.notices.push('papaDates');
      else if (ps < early || pe > late + k.papaWindowDays) out.notices.push('papaWindow');
      else if (pe - ps + 1 > k.papaMaxDays) out.notices.push('papaOver28');
      if (r.papa && P(d.leaveStart) !== null && P(d.leaveStart) <= r.papa.end) out.notices.push('leaveOverlap');
    }
    if (!r.leave && d.leaveEnd) out.notices.push('leaveOrder');
    if (r.leave && r.leave.end > r.bday1 - 1) out.notices.push('afterOne');
    if (r.leave && r.leave.payEnd > P(k.validTo)) out.notices.push('capYear');
    if (r.wage.capped === 'max') out.notices.push('wageMax');
    if (r.wage.capped === 'min') out.notices.push('wageMin');
    return out;
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
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
    normalizeInput: normalizeInput, toIkukyuInput: toIkukyuInput, calc: calc,
    toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (isNode) module.exports = api;
  else root.ChildcareLeave = api;
})(this);
