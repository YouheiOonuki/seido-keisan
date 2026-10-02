// ===========================
// 住民税の計算の使い方（英語）— 本文の率・均等割・非課税のライン・例の額・確認日を値ファイルと計算から入れる（値を HTML に写さない）
// HTML の中の数字は JS が動かないときの控え。値ファイルを直せば画面と使い方ページが一緒に変わる
// ===========================
(function () {
  'use strict';
  var JV = window.JuminzeiValues, J = window.Juminzei, R = window.ResidenceTax;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function n(x) { return Number(x).toLocaleString('en-US'); }
  function pct(x) { return String(Math.round(x * 1000) / 1000); }

  var cur = JV.nendo[JV.CURRENT], prev = JV.nendo[JV.PREVIOUS];
  // 単身・1 級地・給与だけの非課税のライン（均等割の非課税限度額 → 給与の収入）
  function line(nendo) { return J.incomeLine(J.kintowariLimit(0, 1, nendo), nendo); }
  // FAQ の例: 年収 500 万円、社会保険料は手取りの計算の見積もり
  var ex = R.calc({ salary: 5000000 });
  var p = JV.CHECKED.split('-');
  var v = {
    checked: MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0],
    nendo: String(JV.CURRENT), nendo1: String(JV.CURRENT + 1),
    nendo0: String(JV.PREVIOUS), income0: String(prev.incomeYear),
    kiso: n(cur.kiso[0][1]),
    rate: pct(cur.rate.normal.pref + cur.rate.normal.city),
    pref: pct(cur.rate.normal.pref), city: pct(cur.rate.normal.city),
    prefS: pct(cur.rate.shitei.pref), cityS: pct(cur.rate.shitei.city),
    kinto: n(cur.kinto.pref + cur.kinto.city),
    shinrin: n(cur.shinrin),
    fixed: n(cur.kinto.pref + cur.kinto.city + cur.shinrin),
    line: n(line(JV.CURRENT)), line0: n(line(JV.PREVIOUS)),
    exSi: n(ex.si), exTax: n(ex.j.total),
  };
  document.querySelectorAll('[data-v]').forEach(function (el) {
    var k = el.getAttribute('data-v');
    if (v[k] !== undefined) el.textContent = v[k];
    if (k === 'checked') el.setAttribute('datetime', JV.CHECKED);
  });
})();
