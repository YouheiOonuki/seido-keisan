// ===========================
// 高額療養費の使い方（英語）— 上限額の表・FAQ の額・確認日を値ファイルと計算から入れる（値を HTML に写さない）
// HTML の中の数字は JS が動かないときの控え。値ファイルを直せば画面と使い方ページが一緒に変わる
// ===========================
(function () {
  'use strict';
  var V = window.KogakuValues, K = window.Kogaku, H = window.HighCostMedical;
  var yen = H.yenA;
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var p = K.periodById('r8');
  function formula(l) { return l.thr ? yen(l.base) + ' + (cost − ' + yen(l.thr) + ') × 1%' : yen(l.base); }

  // 70 歳未満の表（2026 年 8 月〜。「所得が一定以下・70 歳以上」の行は除く）
  var tb = document.querySelector('#limits-table tbody');
  tb.textContent = '';
  H.catsFor(p, 'u70').forEach(function (c) {
    var e = H.catEn(c);
    var tr = document.createElement('tr');
    var th = document.createElement('th'); th.scope = 'row';
    th.textContent = /^exempt/.test(e.hyojun) ? 'Exempt from residence tax' : e.hyojun;
    var td1 = document.createElement('td'); td1.textContent = formula(c.u70) + (c.u70.many ? ' (' + yen(c.u70.many) + ')' : '');
    var td2 = document.createElement('td'); td2.textContent = c.year ? yen(c.year) : '—';
    tr.appendChild(th); tr.appendChild(td1); tr.appendChild(td2); tb.appendChild(tr);
  });
  var gen = K.catById(p, 'e'), mid = K.catById(p, 'u');
  var c = V.CHECKED.split('-');
  var v = {
    checked: MONTHS[Number(c[1]) - 1] + ' ' + Number(c[2]) + ', ' + c[0],
    gairai: gen.gairai.toLocaleString('en-US'), o70e: gen.o70.base.toLocaleString('en-US'),
    ex: K.limitFor('r8', 'u', 'u70', 1000000, false).toLocaleString('en-US'),
    yearU: mid.year.toLocaleString('en-US'),
    claim: H.ymEn(V.YEAR_CLAIM_FROM),
  };
  document.querySelectorAll('[data-v]').forEach(function (el) {
    var k = el.getAttribute('data-v');
    if (v[k] !== undefined) el.textContent = v[k];
    if (k === 'checked') el.setAttribute('datetime', V.CHECKED);
  });
})();
