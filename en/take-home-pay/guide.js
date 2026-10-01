// ===========================
// 手取りの計算の使い方（英語）— 本文の率・上限・確認日を値ファイルから入れる（値を HTML に写さない）
// HTML の中の数字は JS が動かないときの控え。値ファイルを直せば画面と使い方ページが一緒に変わる
// ===========================
(function () {
  'use strict';
  var TV = window.TakeHomeValues, TAX = window.TaxValues, JV = window.JuminzeiValues;
  var IV = window.IkukyuValues, SV = window.ShienkinValues, DV = window.DattaiValues;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function n(x) { return Number(x).toLocaleString('en-US'); }
  function pct(x) { return String(Math.round(x * 1000) / 1000); }

  var ty = TAX.years[TV.taxYear];
  var nd = JV.nendo[TV.juminNendo];
  var p = TV.CHECKED.split('-');
  var v = {
    checked: MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0],
    tokyo: IV.hoken.kyokai.tokyo[1].toFixed(2),
    kaigo: pct(IV.hoken.kaigoRate),
    shien: pct(SV.rate),
    kounen: pct(IV.hoken.kounenRate),
    koyo: pct(TV.koyo.perMille / 10),
    kiso: n(ty.kiso[0][1]),
    kisoLine: n(ty.kiso[0][0]),
    kinto: n(nd.kinto.pref + nd.kinto.city + nd.shinrin),
    hCap: n(SV.bonusCapYear),
    pCap: n(DV.bonus.cap),
    incomeYear: String(nd.incomeYear),
    nendo: String(TV.juminNendo),
    nendo1: String(TV.juminNendo + 1),
    taxYear: String(TV.taxYear),
  };
  document.querySelectorAll('[data-v]').forEach(function (el) {
    var k = el.getAttribute('data-v');
    if (v[k] !== undefined) el.textContent = v[k];
    if (k === 'checked') el.setAttribute('datetime', TV.CHECKED);
  });
})();
