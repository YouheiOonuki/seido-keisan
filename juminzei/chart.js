// ===========================
// 住民税 — 給与の収入と住民税の年額の図（線 1 本）と、収入の印の位置・動かせる範囲（純粋関数。Q-509）
// 線の点は lib/juminzei.js の calc を、今の入力の給与の収入だけを変えて呼んだ年税額（total ＝ 画面の #r-big の数）。
// 税の式はここに書かない。非課税の縦の線は calc が返す kintoLine（lib の incomeLine）。印の所では 図の数 ＝ 結果の数（tests/juminzei.test.js）。
// ブラウザでは window.JuminzeiChart、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var STEP = 100000, BIG = 1000000;   // ← → で 10 万円、Shift と ← → で 100 万円。引いたときも 10 万円きざみ
  var N = 40;                         // 線の点の数（横の端まで等分）。calc は画面で 1 回およそ 1 ms で、160 点では描き直しに 178 ms かかった（Q-509）

  // 今の入力のまま、給与の収入だけを income にして calc を呼ぶ
  function at(J, state, nendo, income) {
    var d = J.normalizeInput(state);
    d.income = income;
    var r = J.calc(d, nendo);
    return { income: income, total: r.total };
  }

  // 図を出すのは、給与の収入が入っているときだけ
  function shows(d) { return !!(d && d.income > 0); }

  // 非課税になる収入の上限（calc が返す kintoLine。無ければ -1）。生活保護・障害者などで収入によらず非課税のときは引かない
  function hikazeiLine(r) { return r.special || !(r.kintoLine >= 0) ? -1 : r.kintoLine; }

  function niceStep(max, n) {
    var raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }

  // 図の枠。横の端は、今の収入の 2 倍と、非課税の縦の線の少し先（1.15 倍）の大きいほう。xMax を渡すとその端のまま（引いている間と、印にフォーカスがある間）
  function frame(J, state, nendo, r, xMax) {
    var d = J.normalizeInput(state), income = d.income, line0 = hikazeiLine(r);
    if (!xMax) {
      var want = Math.max(income * 2, line0 > 0 ? line0 * 1.15 : 0);
      var xs = niceStep(want, 4);
      xMax = Math.ceil(want / xs) * xs;
    }
    var xStep = niceStep(xMax, 4);
    var pts = [];
    for (var i = 0; i <= N; i++) pts.push(Math.round(xMax * i / N));
    // 線が跳ぶ所（非課税の境、所得割の境）と今の収入は、点を必ず置く
    [line0, line0 + 1, r.shotokuLine, r.shotokuLine + 1, income].forEach(function (b) { if (b >= 0 && b <= xMax && pts.indexOf(b) < 0) pts.push(b); });
    pts.sort(function (a, b) { return a - b; });
    var line = pts.map(function (x) { return at(J, state, nendo, x); });
    var top = Math.max.apply(null, line.map(function (p) { return p.total; }).concat([1]));
    var yStep = niceStep(top, 4), yMax = Math.ceil(top / yStep) * yStep;
    return { xMax: xMax, xStep: xStep, yMax: yMax, yStep: yStep, line: line, hikazei: line0 };
  }

  // 横の位置の割合（0〜1）→ 収入（10 万円きざみ）
  function incomeAtRatio(t, f) { return Math.round(f.xMax * Math.max(0, Math.min(1, t)) / STEP) * STEP; }

  // キーの 1 歩。← → で 10 万円、Shift と ← → で 100 万円。ほかのキーは 0
  function keyStep(key, shift) {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return 0;
    return (shift ? BIG : STEP) * (key === 'ArrowRight' ? 1 : -1);
  }

  // 印にフォーカスがある間・引いている間に保つ横の端。収入が端を超えたら、その時だけ端を 2 倍ずつ広げる（Q-489 と同じ線）
  function growEnd(xMax, income) {
    if (!(xMax > 0)) return xMax;
    while (income > xMax) xMax *= 2;
    return xMax;
  }

  // 動かしてよい収入か。min・max は欄の属性（空なら端なし）。0 円（図が消える）と、lib が丸める額（上限の外）へは動かさない
  function allowed(J, income, min, max) {
    if (!(income > 0)) return false;
    if (min !== '' && min !== null && min !== undefined && income < Number(min)) return false;
    if (max !== '' && max !== null && max !== undefined && income > Number(max)) return false;
    return J.normalizeInput({ income: income }).income === income;
  }

  var api = { STEP: STEP, BIG: BIG, at: at, shows: shows, hikazeiLine: hikazeiLine, frame: frame, incomeAtRatio: incomeAtRatio, keyStep: keyStep, growEnd: growEnd, allowed: allowed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JuminzeiChart = api;
})(this);
