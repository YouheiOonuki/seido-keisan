// ===========================
// 保険料控除の計算（画面から切り離した純粋関数。yorozu-plans ROADMAP 7.165 K209）
// 生命保険料控除・地震保険料控除の額を、令和8年分「給与所得者の保険料控除申告書」の欄（A〜E・①〜⑧・㋑㋺㋩・Ⓑ Ⓒ）の形で出す。
// 控除額そのものは年末調整の lib/nenmatsu.js（所得税）と住民税の lib/juminzei.js（令和9年度）が計算する。
// ここが持つのは申告書の途中の欄（①〜⑧）の並べ方だけで、上限や「いずれか大きい金額」の規則は二重に持たない。
// DOM や localStorage には触らない。ブラウザでは window.Hoken、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var NODE = typeof module !== 'undefined' && module.exports;
  var TAX = NODE ? require('./tax2026.js') : root.TaxValues;
  var JV = NODE ? require('./juminzei-values.js') : root.JuminzeiValues;
  var N = NODE ? require('./nenmatsu.js') : root.Nenmatsu;
  var J = NODE ? require('./juminzei.js') : root.Juminzei;

  var CHECKED = '2026-11-02';  // 申告書の欄と記載例（国税庁 nencho2026/pdf/307.pdf）を最後に原文で確かめた日
  var TOOL_ID = 'seido-keisan-hoken';
  var FILE_VERSION = 1;
  var Y = TAX.CURRENT;         // 所得税: 令和8年分
  var NENDO = JV.CURRENT;      // 住民税: 令和9年度（令和8年に払った保険料）

  // --- 入力の正規化（保存・ファイル読み込み・計算の前に必ず通す）。空欄は null ---
  function amount(v) {
    if (v === undefined || v === null) return null;
    var s = String(v).replace(/[,，\s円]/g, '');
    if (s === '') return null;
    var n = Math.floor(Number(s));
    if (!isFinite(n)) return null;
    return Math.min(Math.max(0, n), 1e9);
  }
  function normalizeInput(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    return {
      a: amount(r.a),          // 一般の生命保険料のうち新保険料等の合計（A）
      b: amount(r.b),          // 同 旧保険料等の合計（B）
      u23: !!r.u23,            // 年齢23歳未満の扶養親族がいる（計算式Ⅱ）
      c: amount(r.c),          // 介護医療保険料の合計（C）
      d: amount(r.d),          // 個人年金保険料のうち新保険料等の合計（D）
      e: amount(r.e),          // 同 旧保険料等の合計（E）
      jishin: amount(r.jishin),  // 地震保険料の合計（Ⓑ）
      kyucho: amount(r.kyucho),  // 旧長期損害保険料の合計（Ⓒ）
    };
  }

  /**
   * @returns {object} { input, empty, shotoku: { cols, ippan, kaigo, nenkin, seimei, jishin, total, u23 }, jumin: { ippan, kaigo, nenkin, seimei, jishin, total } }
   *   cols は申告書の欄の記号 → 金額（その欄を書かないときは無い）
   */
  function calc(raw) {
    var d = normalizeInput(raw);
    var v = function (x) { return x || 0; };
    var s = TAX.years[Y].seimei, jy = TAX.years[Y].jishin;
    var u23 = d.u23 && s.u23Special;
    var p = { newIppan: v(d.a), oldIppan: v(d.b), kaigo: v(d.c), newNenkin: v(d.d), oldNenkin: v(d.e) };
    var q = { jishin: v(d.jishin), oldLong: v(d.kyucho) };

    // 所得税（年末調整・確定申告）
    var sei = N.seimeiKojo(p, u23, Y);
    var ji = N.jishinKojo(q, Y);
    var cols = {};
    if (d.a !== null) { cols.A = d.a; if (u23) cols['②'] = N.shiki(d.a, s.shiki2); else cols['①'] = N.shiki(d.a, s.shiki1); }
    if (d.b !== null) { cols.B = d.b; cols['③'] = N.shiki(d.b, s.shiki3); }
    if (d.a !== null || d.b !== null) {
      var first = u23 ? cols['②'] || 0 : cols['①'] || 0;
      cols[u23 ? '⑤' : '④'] = Math.min(first + (cols['③'] || 0), u23 ? s.bothCapU23 : s.bothCap);
      cols['㋑'] = sei.ippan;
    }
    if (d.c !== null) { cols.C = d.c; cols['㋺'] = sei.kaigo; }
    if (d.d !== null) { cols.D = d.d; cols['⑥'] = N.shiki(d.d, s.shiki1); }
    if (d.e !== null) { cols.E = d.e; cols['⑦'] = N.shiki(d.e, s.shiki3); }
    if (d.d !== null || d.e !== null) {
      cols['⑧'] = Math.min((cols['⑥'] || 0) + (cols['⑦'] || 0), s.bothCap);
      cols['㋩'] = sei.nenkin;
    }
    if (d.jishin !== null) cols['Ⓑ'] = d.jishin;
    if (d.kyucho !== null) { cols['Ⓒ'] = d.kyucho; cols['Ⓒ式'] = N.shiki(d.kyucho, jy.oldLong); }

    // 住民税（令和9年度。地方税法 314条の2。計算式Ⅱの特例は住民税には無い）
    var jsei = J.seimeiKojo(p, NENDO);
    var jji = J.jishinKojo(q, NENDO);

    var empty = ['a', 'b', 'c', 'd', 'e', 'jishin', 'kyucho'].every(function (k) { return d[k] === null; });
    return {
      input: d, empty: empty, year: TAX.years[Y].label, nendo: JV.nendo[NENDO].label,
      shotoku: { cols: cols, ippan: sei.ippan, kaigo: sei.kaigo, nenkin: sei.nenkin, seimei: sei.total, jishin: ji, total: sei.total + ji, u23: u23 },
      jumin: { ippan: jsei.ippan, kaigo: jsei.kaigo, nenkin: jsei.nenkin, seimei: jsei.total, jishin: jji, total: jsei.total + jji },
    };
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
  function toExportFile(data, now) {
    return { tool: TOOL_ID, version: FILE_VERSION, exportedAt: (now || new Date()).toISOString(), data: normalizeInput(data) };
  }
  function fromExportFile(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, message: 'ファイルの形式が違います（JSON ではありません）。' };
    if (obj.tool !== TOOL_ID) return { ok: false, message: 'このツール（保険料控除の計算）で書き出したファイルではありません。' };
    if (typeof obj.version !== 'number' || obj.version > FILE_VERSION) return { ok: false, message: '新しい版のファイルのため読み込めません。ページを再読み込みしてからお試しください。' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, message: 'ファイルに入力内容がありません。' };
    return { ok: true, data: normalizeInput(obj.data), exportedAt: obj.exportedAt };
  }

  var api = { CHECKED: CHECKED, TOOL_ID: TOOL_ID, FILE_VERSION: FILE_VERSION, calc: calc, normalizeInput: normalizeInput, toExportFile: toExportFile, fromExportFile: fromExportFile };
  if (NODE) module.exports = api;
  else root.Hoken = api;
})(this);
