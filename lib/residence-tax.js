// ===========================
// 住民税の計算（Japan residence tax calculator、英語ページ。K60）— 画面から切り離した純粋関数
// 英語の入力（年・給与・社会保険料・iDeCo・市区町村・配偶者・子ども）を、日本語の住民税の計算（lib/juminzei.js）の
// 入力に直して、そのまま calc を呼ぶだけ。税率・控除額・非課税の基準は lib/juminzei-values.js にだけある（値を写さない。
// ACCEPTANCE 3 章 K60）。
// 社会保険料を空にしたときの見積もりは、手取りの計算（lib/take-home.js。協会けんぽ東京・40 歳未満・賞与なし・
// 2026 年 4 月からの率）の年額を使う。
// ブラウザでは window.ResidenceTax、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var J = isNode ? require('./juminzei.js') : root.Juminzei;
  var JV = isNode ? require('./juminzei-values.js') : root.JuminzeiValues;
  var T = isNode ? require('./take-home.js') : root.TakeHome;

  var TOOL_ID = 'seido-keisan-residence-tax';
  var FILE_VERSION = 1;
  var MAX_INCOME = 100000000;   // juminzei.js と同じ（給与の収入 1 億円まで）
  var MAX_KIDS = 10;
  var NENDOS = [JV.CURRENT, JV.PREVIOUS];

  function num(v, max) {
    var n = Math.floor(Number(String(v === undefined || v === null ? '' : v).replace(/[,，\s¥円]/g, '')));
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(n, max || 1e10);
  }
  // 空欄は「見積もる」（null）。0 は 0 円として扱う
  function numOrNull(v) {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    return num(v);
  }
  function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }

  function normalizeInput(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var sp = r.spouse || {}, k = r.kids || {};
    return {
      nendo: pick(Number(r.nendo), NENDOS, JV.CURRENT),
      salary: num(r.salary, MAX_INCOME),
      si: numOrNull(r.si),
      ideco: num(r.ideco),
      designated: !!r.designated,
      grade: pick(Number(r.grade), [1, 2, 3], 1),
      spouse: { has: !!sp.has, income: num(sp.income) },
      kids: { u16: num(k.u16, MAX_KIDS), a16: num(k.a16, MAX_KIDS), a19: num(k.a19, MAX_KIDS) },
    };
  }

  // 社会保険料の見積もり（手取りの計算の年額。年収 2,000 万円を超えると手取りの計算が出さないので null）
  function estimateSi(salary) {
    if (!salary) return 0;
    var r = T.calc({ period: 'year', amount: salary, bonus: 0 });
    return r.ready ? r.year.si : null;
  }

  // 日本語の住民税の計算（lib/juminzei.js）の入力の形に直す
  function toJuminzeiInput(d, si) {
    var fam = T.familyInput(d);
    return {
      income: d.salary, shakai: si, shokibo: d.ideco,
      spouse: fam.spouse, relatives: fam.relatives,
      city: { shitei: d.designated, kyuchi: d.grade },
    };
  }

  /**
   * 住民税を計算する
   * 戻り値 { ready, input, si, siEstimated, j（lib/juminzei.js の calc の結果）, error }
   */
  function calc(raw) {
    var d = normalizeInput(raw);
    var out = { input: d, ready: false };
    if (!d.salary) return out;
    var si = d.si;
    out.siEstimated = si === null;
    if (si === null) {
      si = estimateSi(d.salary);
      if (si === null) { out.error = 'needSi'; return out; }
    }
    out.si = si;
    out.j = J.calc(toJuminzeiInput(d, si), d.nendo);
    out.ready = true;
    return out;
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
    TOOL_ID: TOOL_ID, FILE_VERSION: FILE_VERSION, NENDOS: NENDOS,
    normalizeInput: normalizeInput, estimateSi: estimateSi, toJuminzeiInput: toJuminzeiInput,
    calc: calc, toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (isNode) module.exports = api;
  else root.ResidenceTax = api;
})(this);
