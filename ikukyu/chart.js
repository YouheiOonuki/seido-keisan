// ===========================
// 育休・産休 — 月ごとの受け取りの棒と、育休の終わりの日の印の位置・動かせる範囲（純粋関数）
// 棒は lib/ikukyu.js の calc が返す months（月ごとの表と同じ行）の receiptTotal・exempt をそのまま使う。ここでは足さない。
// 終わりの日の 1 か月先・前は lib の ouDate（応当日。その月に無い日は月末）。動かした先は calc を呼んで確かめる。
// ブラウザでは window.IkukyuChart、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  // 棒の 1 本 ＝ months の 1 行
  function bars(r) {
    return r.months.map(function (m) { return { mi: m.mi, label: m.label, total: m.receiptTotal, exempt: m.exempt }; });
  }
  // 日（1970-01-01 からの日数）→ 月の番号（months の mi と同じ数え方: 年 × 12 ＋ 月 − 1）
  function miOf(I, day) { var s = I.fmt(day).split('-'); return +s[0] * 12 + (+s[1] - 1); }

  // 計算が使っている育休の終わりの日（欄が空なら calc の既定＝子が1歳になる前日）。育休が出ないときは null
  function endDay(r) { return r.ok && r.leave ? r.leave.end : null; }

  // 図を出すのは、結果が出ていて月の行があるとき
  function shows(r) { return !!(r && r.ok && r.months && r.months.length); }

  // 終わりの日を day にしたときに、計算が通るか。min・max は欄の属性（'YYYY-MM-DD'。空なら端なし）。
  // 今の結果に無かった文（終了日が開始日より前・1歳を過ぎた分は対象外）が出る日へは動かさない
  function allowed(I, state, day, r, min, max) {
    var s = I.fmt(day);
    if ((min && s < min) || (max && s > max)) return false;
    var d = I.normalizeInput(state);
    d.leaveEnd = I.fmt(day);
    var r2 = I.calc(d);
    return !!(r2.ok && r2.leave && r2.messages.length <= r.messages.length);
  }

  // from の日から k か月（符号つき）動かす。1 か月ずつ進み、通らない月の手前で止まる（またいで飛ばない）。動けなければ from
  function stepTo(I, state, from, k, r, min, max) {
    var cur = from, dir = k > 0 ? 1 : -1;
    for (var i = 1; i <= Math.abs(k); i++) {
      var next = I.ouDate(from, dir * i);
      if (!allowed(I, state, next, r, min, max)) break;
      cur = next;
    }
    return cur;
  }

  // キーの 1 歩。← → で 1 か月。ほかのキーは 0
  function keyStep(key) { return key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0; }

  var api = { bars: bars, miOf: miOf, endDay: endDay, shows: shows, allowed: allowed, stepTo: stepTo, keyStep: keyStep };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IkukyuChart = api;
})(this);
