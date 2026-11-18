// ===========================
// 高額療養費 — 医療費と払う額の図（窓口の負担・自己負担の 2 本の線）と、医療費の印の位置・動かせる範囲（純粋関数）
// 線の点は lib/kogaku.js の calc を、今の入力の 1 行目の医療費だけを変えて呼んだ値（paid ＝ 窓口の負担、self ＝ 自己負担）。
// 上限の式はここに書かない。印の所では 図の数 ＝ 結果の数（tests/kogaku.test.js）。
// ブラウザでは window.KogakuChart、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var STEP = 10000, BIG = 100000;   // ← → で 1 万円、Shift と ← → で 10 万円。引いたときも 1 万円きざみ
  var N = 160;                      // 線の点の数（横の端まで等分）
  var SCAN_MAX = 1e9;               // 戻る額が出はじめる医療費を探す上の端

  // 今の入力のまま、1 行目の医療費だけを cost にして calc を呼ぶ
  function at(C, state, todayYm, cost) {
    var d = C.normalizeInput(state);
    d.rows[0].cost = cost;
    var r = C.calc(d, todayYm);
    return r.ready ? { cost: cost, paid: r.paid, self: r.self, refund: r.refund } : null;
  }

  // 図を出すのは、結果が出ていて、行が 1 つ（世帯合算の行が無い）ときだけ
  function shows(r) { return !!(r && r.ready && r.input.rows.length === 1); }

  // 線が折れる医療費: 戻る額が出はじめる所（calc を二分して探す）と、上限額に 1% が足される所（区分の値の thr）
  function bends(C, state, todayYm, r) {
    var out = [];
    var hi = SCAN_MAX, top = at(C, state, todayYm, hi);
    if (top && top.refund > 0) {
      var lo = 1;
      while (hi - lo > 1) { var mid = Math.floor((lo + hi) / 2), p = at(C, state, todayYm, mid); if (p && p.refund > 0) hi = mid; else lo = mid; }
      out.push(hi);
    }
    var l = r.input.rows[0].age === 'o70' ? r.cat.o70 : r.cat.u70;
    if (l.thr && !(r.many && l.many !== null)) out.push(l.thr);
    return out;
  }

  function niceStep(max, n) {
    var raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  // 図の枠。横の端は、今の医療費の 2 倍と、線が折れる医療費の少し先（1.15 倍）の大きいほう。xMax を渡すとその端のまま（引いている間）
  function frame(C, state, todayYm, r, xMax) {
    var cost = r.input.rows[0].cost, bs = bends(C, state, todayYm, r);
    if (!xMax) {
      var want = cost * 2;
      bs.forEach(function (b) { want = Math.max(want, b * 1.15); });
      var xs = niceStep(want, 4);
      xMax = Math.ceil(want / xs) * xs;
    }
    var xStep = niceStep(xMax, 4);
    var pts = [];
    for (var i = 0; i <= N; i++) pts.push(Math.round(xMax * i / N));
    bs.concat([cost]).forEach(function (b) { if (b < xMax && pts.indexOf(b) < 0) pts.push(b); });
    pts.sort(function (a, b) { return a - b; });
    var line = pts.map(function (c) { return at(C, state, todayYm, c); }).filter(Boolean);
    if (!line.length || line[0].cost !== 0) line.unshift({ cost: 0, paid: 0, self: 0, refund: 0 });
    var top = Math.max(line[line.length - 1].paid, 1);
    var yStep = niceStep(top, 4), yMax = Math.ceil(top / yStep) * yStep;
    return { xMax: xMax, xStep: xStep, yMax: yMax, yStep: yStep, line: line };
  }

  // 横の位置の割合（0〜1）→ 医療費（1 万円きざみ）
  function costAtRatio(t, f) { return Math.round(f.xMax * Math.max(0, Math.min(1, t)) / STEP) * STEP; }

  // キーの 1 歩。← → で 1 万円、Shift と ← → で 10 万円。ほかのキーは 0
  function keyStep(key, shift) {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return 0;
    return (shift ? BIG : STEP) * (key === 'ArrowRight' ? 1 : -1);
  }

  // 動かしてよい医療費か。min・max は欄の属性（空なら端なし）。calc が結果を出せない額（0 円など）へは動かさない
  function allowed(C, state, todayYm, cost, min, max) {
    if (min !== '' && min !== null && min !== undefined && cost < Number(min)) return false;
    if (max !== '' && max !== null && max !== undefined && cost > Number(max)) return false;
    return !!at(C, state, todayYm, cost);
  }

  var api = { STEP: STEP, BIG: BIG, at: at, shows: shows, bends: bends, frame: frame, costAtRatio: costAtRatio, keyStep: keyStep, allowed: allowed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KogakuChart = api;
})(this);
