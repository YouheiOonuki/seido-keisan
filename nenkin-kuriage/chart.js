// ===========================
// 年金の繰上げ・繰下げ — 受け取る額の累計の図（60〜100歳）とつまみの 1 行（純粋関数）
// 累計は lib/kuriage.js の cumulativeTo（calc の累計の表と同じ関数）で出す。ここでは足さない。
// calc と同じ受け取り方（繰上げのときは在職を入れない）を使うので、表の年齢では 図の数 ＝ 表の数（tests/kuriage.test.js）。
// ブラウザでは window.KuriageChart、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var FROM_AGE = 60, TO_AGE = 100;
  var T0 = (FROM_AGE - 65) * 12, T1 = (TO_AGE - 65) * 12;   // 65歳に達した月を 0 とする月の番号

  function man(n) { return (Math.round(n / 1000) / 10).toLocaleString('ja-JP') + '万円'; }

  // r は C.calc の結果（ready のときだけ）。opt・base は 60歳〜100歳に達した月の分までの累計（月ごと、481 個）
  function series(C, r) {
    var d = r.input, dd = d;
    if (Math.min(r.k1, r.k2) < 0) { dd = {}; for (var k in d) dd[k] = d[k]; dd.wage = 0; }
    var opt = C.plan(dd, r.k1, r.k2), base = C.plan(dd, 0, 0);
    var fromT = Math.min(r.k1, r.k2, 0) + 1;
    var o = [], b = [];
    for (var t = T0; t <= T1; t++) { o.push(C.cumulativeTo(opt, fromT, t)); b.push(C.cumulativeTo(base, fromT, t)); }
    return { t0: T0, opt: o, base: b };
  }
  // その年齢に達した月の分までの累計を、表と同じ丸めで
  function at(s, age) {
    var i = (age - 65) * 12 - s.t0;
    var o = Math.round(s.opt[i]), b = Math.round(s.base[i]);
    return { age: age, opt: o, base: b, diff: o - b };
  }
  // つまみの既定: 逆転する年齢（か月があれば次の歳）、無ければ表のいちばん上の年齢
  function defaultAge(r) {
    var be = r.breakEven;
    var a = be && !be.never ? be.age.y + (be.age.m ? 1 : 0) : r.totals[0].age;
    return Math.max(FROM_AGE, Math.min(TO_AGE, a));
  }
  // 1 行（表の列と同じ語・同じ書き方）
  function line(x) {
    return x.age + '歳まで　この受け取り方 ' + man(x.opt) + '・65歳から ' + man(x.base) + '・差 ' + (x.diff >= 0 ? '＋' : '−') + man(Math.abs(x.diff));
  }

  var api = { FROM_AGE: FROM_AGE, TO_AGE: TO_AGE, man: man, series: series, at: at, defaultAge: defaultAge, line: line };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KuriageChart = api;
})(this);
