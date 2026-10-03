// ===========================
// 引越し・在留の手続きリストの使い方（英語）— 日数・確認日・出典の一覧を値ファイルから入れる（値を HTML に写さない）
// ===========================
(function () {
  'use strict';
  var V = window.MovingChecklistValues;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var c = V.CHECKED.split('-');
  var v = {
    checked: MONTHS[Number(c[1]) - 1] + ' ' + Number(c[2]) + ', ' + c[0],
    notice: String(V.DAYS.notice), renew: String(V.DAYS.renewMonths), minStay: String(V.DAYS.renewMinStay),
    grace: String(V.DAYS.graceMonths), reentry: String(V.DAYS.reentryYears),
  };
  document.querySelectorAll('[data-v]').forEach(function (el) {
    var k = el.getAttribute('data-v');
    if (v[k] !== undefined) el.textContent = v[k];
    if (k === 'checked') el.setAttribute('datetime', V.CHECKED);
  });
  // 出典の一覧（項目ごとの条文をまとめる）
  var arts = {};
  V.ITEMS.forEach(function (it) { it.basis.forEach(function (b) { if (b[1]) (arts[b[0]] = arts[b[0]] || []).push(b[1].replace(/^Art\. /, '')); }); });
  var ul = document.getElementById('sources');
  Object.keys(V.SOURCES).forEach(function (k) {
    var s = V.SOURCES[k], li = document.createElement('li'), a = document.createElement('a');
    a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = s.label;
    li.appendChild(a);
    if (arts[k]) li.appendChild(document.createTextNode(': Art. ' + arts[k].filter(function (x, i, l) { return l.indexOf(x) === i; }).join(', ')));
    ul.appendChild(li);
  });
})();
