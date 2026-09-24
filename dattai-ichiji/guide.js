// ===========================
// 脱退一時金の計算の使い方ページ（日英）: 確認日・国民年金の表の年度・出典の一覧を ../lib/dattai-values.js から入れる
// 値を 2 か所に持たない（GLOBAL 3.2）。HTML の中の同じ文字は、スクリプトが動かないときの表示
// ===========================
(function () {
  'use strict';
  var V = window.DattaiValues;
  var LANG = document.documentElement.lang === 'ja' ? 'ja' : 'en';
  var T = window.PensionRefundText[LANG];
  var fy = Math.max.apply(null, Object.keys(V.kokunen).map(Number));
  var vals = { checked: T.date(V.CHECKED), fy: String(fy), fy1: String(fy + 1) };
  document.querySelectorAll('[data-v]').forEach(function (el) {
    var v = vals[el.getAttribute('data-v')];
    if (v !== undefined && el.textContent !== v) el.textContent = v;
  });
  var list = document.getElementById('sources');
  if (list) {
    list.textContent = '';
    V.SOURCES.forEach(function (s) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = LANG === 'ja' ? s.label : s.en;
      li.appendChild(a);
      if (LANG === 'ja') li.appendChild(document.createTextNode('（' + s.where + '）'));
      list.appendChild(li);
    });
  }
})();
