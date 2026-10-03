// ===========================
// 育休・産休の計算の使い方（英語）— 本文の率・上限・日数・確認日を値ファイルから入れる（値を HTML に写さない）
// HTML の中の数字は JS が動かないときの控え。値ファイルを直せば画面と使い方ページが一緒に変わる
// ===========================
(function () {
  'use strict';
  var IV = window.IkukyuValues;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function n(x) { return Number(x).toLocaleString('en-US'); }
  function dateEn(iso) { var p = iso.split('-'); return MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0]; }
  var k = IV.koyo;
  var v = {
    checked: dateEn(IV.CHECKED), validFrom: dateEn(k.validFrom), validTo: dateEn(k.validTo),
    dailyMax: n(k.dailyMax), dailyMin: n(k.dailyMin),
    high: String(k.rateHigh), low: String(k.rateLow), highDays: String(k.highDays),
    maxHigh: n(Math.floor(k.dailyMax * k.unitDays * k.rateHigh / 100)),
    maxLow: n(Math.floor(k.dailyMax * k.unitDays * k.rateLow / 100)),
    sanzen: String(IV.kenpo.sanzen), sango: String(IV.kenpo.sango),
    shien: String(k.shien.rate), ichiji: n(IV.kenpo.ichiji.sanka),
  };
  document.querySelectorAll('[data-v]').forEach(function (el) {
    var key = el.getAttribute('data-v');
    if (v[key] !== undefined) el.textContent = v[key];
    if (key === 'checked') el.setAttribute('datetime', IV.CHECKED);
  });
})();
