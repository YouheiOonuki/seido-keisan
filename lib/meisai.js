// ===========================
// 医療費控除の明細書【内訳書】を作る（画面から切り離した純粋関数）
// 行の形と保存は lib/box.js、列の名前と出典は lib/iryohi-values.js の MEISAI・SOURCES、控除と税金は lib/iryohi.js。
// 規則は様式と記載要領・Excel 版の式のとおり:
//   (5) 補塡される金額は行ごとに (4) 支払った医療費の額が上限（ほかの医療費からは引かない）
//   A ＝ (4) の合計、B ＝ (5) の合計、C ＝ A − B（マイナスは 0）
//   所得を入れないときは「10 万円を超えた分」＝ C − 10 万円（0 未満は 0、最高 200 万円）
//   所得を入れたときは lib/iryohi.js の calc（F ＝ min(所得 × 5%, 10 万円)、戻る税金の目安）
// DOM や localStorage には触らない。ブラウザでは window.Meisai、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var NODE = typeof module !== 'undefined' && module.exports;
  var V = NODE ? require('./iryohi-values.js') : root.IryohiValues;
  var I = NODE ? require('./iryohi.js') : root.Iryohi;
  var B = NODE ? require('./box.js') : root.Box;

  // 何か入っている行だけを数える（空の行は表の入力欄として残すが、合計・CSV・印刷には出さない）
  function isFilled(r) { return !!(r.who || r.payee || r.kubun.length || r.amount !== null || r.hoten !== null); }
  function rowHoten(r) { return Math.min(r.hoten || 0, r.amount || 0); }

  /** 行の合計。rows は Box.normalizeRow を通した形でも生の形でもよい */
  function totals(rows) {
    var list = (rows || []).map(B.normalizeRow).filter(isFilled);
    var a = 0, b = 0, over = [];
    list.forEach(function (r, i) {
      a += r.amount || 0;
      b += rowHoten(r);
      if ((r.hoten || 0) > (r.amount || 0)) over.push(i);
    });
    return { rows: list, count: list.length, a: a, b: b, c: Math.max(0, a - b), over: over };
  }

  /** 所得を入れないときの「10 万円を超えた分」（総所得金額等が 200 万円以上の人の控除額と同じ） */
  function overFloor(t) {
    var raw = Math.max(0, t.c - V.iryohi.floor);
    return { floor: V.iryohi.floor, value: Math.min(raw, V.iryohi.cap), capped: raw > V.iryohi.cap };
  }

  /** 戻る税金の目安。iryohi の画面と同じ入力（給与の収入・所得控除の合計）で lib/iryohi.js の calc を呼ぶ */
  function estimate(t, income, kojo) {
    return I.calc({ hiyo: t.a, hoten: t.b, mode: 'kyuyo', income: income, kojo: kojo });
  }

  function kubunLabel(codes) {
    return B.KUBUN.filter(function (k) { return codes.indexOf(k.code) >= 0; }).map(function (k) { return k.label; }).join('／');
  }

  // --- CSV（明細書の「2 医療費の明細」の列の順。Excel で開けるように UTF-8 の BOM と CRLF） ---
  function cell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;                 // 表計算ソフトで式として動かさない
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvRows(rows) {
    var t = totals(rows);
    var out = [V.MEISAI.columns.slice()];
    t.rows.forEach(function (r) {
      out.push([r.who, r.payee, kubunLabel(r.kubun), r.amount === null ? '' : r.amount, r.hoten === null ? '' : rowHoten(r)]);
    });
    out.push([V.MEISAI.total, '', '', t.a, t.b]);
    return out;
  }
  function toCsv(rows) {
    return '﻿' + csvRows(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
  }
  function csvFileName(year) { return 'iryohi-meisai-' + year + '.csv'; }

  // 「医療を受けた方」の候補（自分で打った名前だけ。出てきた順、重複なし）
  function names(rows) {
    var seen = [];
    (rows || []).forEach(function (r) { var n = B.normalizeRow(r).who; if (n && seen.indexOf(n) < 0) seen.push(n); });
    return seen;
  }

  // 行の並べ替え（新しい配列を返す）
  function move(rows, i, d) {
    var a = rows.slice(), j = i + d;
    if (i < 0 || i >= a.length || j < 0 || j >= a.length) return a;
    var x = a[i]; a[i] = a[j]; a[j] = x;
    return a;
  }

  var api = {
    isFilled: isFilled, rowHoten: rowHoten, totals: totals, overFloor: overFloor, estimate: estimate,
    kubunLabel: kubunLabel, cell: cell, csvRows: csvRows, toCsv: toCsv, csvFileName: csvFileName, names: names, move: move,
  };
  if (NODE) module.exports = api;
  else root.Meisai = api;
})(this);
