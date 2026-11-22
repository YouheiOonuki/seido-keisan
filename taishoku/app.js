// ===========================
// 退職金の税金と手取りの計算（/seido-keisan/taishoku/。K213）— 画面の制御（yorozu-plans 企画書 114 の 6 章）
// 計算は ../lib/taishoku.js（純粋関数）、値と出典は ../lib/taishoku-values.js、速算表は ../lib/sokusan.js。画面は式を持たない。
// 入れた額は保存しない・送らない（localStorage にも URL にも書かない）。開いた時は欄の既定の値（勤続 30 年・2,500万円）の結果を出す。
// ===========================
(function () {
  'use strict';

  var T = window.Taishoku;
  var V = window.TaishokuValues;
  var $ = function (id) { return document.getElementById(id); };
  var DASH = '—';

  function yen(n) { return n.toLocaleString('ja-JP') + '円'; }
  function setText(id, t) { var e = $(id); if (e.textContent !== t) e.textContent = t; }
  // 2,500万円 のような読み（入力の横）
  function yomi(n) {
    if (!(n >= 10000)) return '';
    var oku = Math.floor(n / 100000000), man = Math.floor((n % 100000000) / 10000);
    return (oku ? oku.toLocaleString('ja-JP') + '億' : '') + (man ? man.toLocaleString('ja-JP') + '万' : '') + '円';
  }

  function input() {
    return {
      amount: $('amount').value === '' ? NaN : Number($('amount').value),
      years: $('years').value === '' ? NaN : Number($('years').value),
      months: $('months').value === '' ? 0 : Number($('months').value),
      yakuin: document.querySelector('input[name="yakuin"]:checked').value === 'yes',
      shogai: $('shogai').checked,
    };
  }

  function band(L, amount) {
    var parts = [['kojo', L.band.kojo], ['half', L.band.half], ['tax', L.band.tax], ['rest', L.band.rest]];
    parts.forEach(function (p) {
      $('b-' + p[0]).style.flexBasis = (amount > 0 ? p[1] / amount * 100 : 0) + '%';
      setText('k-' + p[0], yen(p[1]));
    });
    var names = { kojo: '控除で消える分', half: '1/2 で消える分', tax: L.jumin ? '税' : '所得税及び復興特別所得税', rest: L.jumin ? '手取り' : '住民税と手取り' };
    setText('k-tax-name', names.tax);
    setText('k-rest-name', names.rest);
    $('band').setAttribute('aria-label', parts.map(function (p) { return names[p[0]] + ' ' + yen(p[1]); }).join('、'));
  }
  function clearBand() {
    ['kojo', 'half', 'tax', 'rest'].forEach(function (k) { $('b-' + k).style.flexBasis = '0%'; setText('k-' + k, DASH); });
    $('band').setAttribute('aria-label', '');
  }

  function nearRow(tb, L, isNow) {
    var tr = document.createElement('tr');
    if (isNow) tr.className = 'total';
    var th = document.createElement('th'); th.scope = 'row';
    th.textContent = L.years + '年' + (isNow ? '（入力）' : '');
    tr.appendChild(th);
    [yen(L.kojo), yen(L.gensen), L.jumin ? yen(L.jumin.total) : DASH].forEach(function (t) {
      var td = document.createElement('td'); td.textContent = t; tr.appendChild(td);
    });
    tb.appendChild(tr);
  }

  function render() {
    var d = input();
    var r = T.calc(d);
    var n = T.years(d.years, d.months);
    $('yakuin-box').hidden = !(n !== null && n >= 1 && n <= V.short.years);
    setText('amount-yomi', isFinite(d.amount) ? yomi(d.amount) : '');
    setText('st-shogai', d.shogai ? 'はい' : 'いいえ');

    var tb = $('near');
    tb.textContent = '';
    if (!r.ready) {
      setText('r-lead', '手取り');
      ['r-big', 's-amount', 's-gensen', 's-shi', 's-ken', 's-kojo', 's-years', 's-kazei', 's-tedori', 'sh-yes', 'sh-no'].forEach(function (id) { setText(id, DASH); });
      setText('r-detail', '');
      clearBand();
      return;
    }
    var L = r.now, J = L.jumin;
    setText('r-lead', J ? '手取り' : '所得税及び復興特別所得税を引いた後');
    setText('r-big', yen(J ? L.tedori : r.amount - L.gensen));
    setText('r-detail', J ? '引かれる税金 ' + yen(L.gensen + J.total) : '');
    band(L, r.amount);

    setText('s-amount', yen(r.amount));
    setText('s-gensen', yen(L.gensen));
    setText('s-shi', J ? yen(J.shi) : DASH);
    setText('s-ken', J ? yen(J.ken) : DASH);
    setText('s-kojo', yen(L.kojo));
    setText('s-years', L.years + '年');
    setText('s-kazei', yen(L.kazei));
    setText('s-tedori', J ? yen(L.tedori) : DASH);
    setText('sh-yes', yen(L.gensen));
    setText('sh-no', yen(L.noShinkoku));

    if (r.shorter) nearRow(tb, r.shorter, false);
    nearRow(tb, L, true);
    nearRow(tb, r.longer, false);
    window.yzUsed?.();
  }

  $('form').addEventListener('input', render);
  $('form').addEventListener('change', render);
  $('shogai').addEventListener('change', render);

  // 確認日: 値の表の CHECKED から。12 か月たったら注意の色
  (function () {
    var c = V.CHECKED.split('-');
    setText('asof-date', Number(c[0]) + '年' + Number(c[1]) + '月' + Number(c[2]) + '日');
    var now = new Date();
    if ((now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]) >= V.STALE_MONTHS) $('asof').classList.add('is-stale');
  })();

  render();
})();
