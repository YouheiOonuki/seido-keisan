// 制度の改定カレンダーの画面の制御: 分類の絞り込み、過ぎた行の印、次の施行日、.ics の保存、確認日の注意
// 一覧そのものは HTML に書き出してある（tools/build-kaitei.mjs）。ここでは表示を変えるだけ。何も保存しない
(function () {
  'use strict';
  var V = window.KaiteiValues, K = window.Kaitei;
  if (!V || !K) return;

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  var today = todayStr();
  var items = Array.prototype.slice.call(document.querySelectorAll('.kt-item'));
  var current = 'all';

  // 過ぎた行（施行日が今日より前）に印を付ける
  items.forEach(function (li) {
    if (li.getAttribute('data-date') < today) {
      li.classList.add('is-past');
      var head = li.querySelector('.kt-head');
      var tag = document.createElement('span'); tag.className = 'kt-past'; tag.textContent = '施行済み';
      head.appendChild(tag);
    }
  });

  // 次の施行日
  var nx = K.nextItem(today);
  var nextEl = document.getElementById('next');
  if (nx && nextEl) {
    var p = nx.date.split('-');
    var days = K.daysBetween(today, nx.date);
    nextEl.textContent = '';
    nextEl.appendChild(document.createTextNode('次に変わるのは ' + p[0] + '年' + (+p[1]) + '月' + (+p[2]) + '日（' + (days === 0 ? '今日' : 'あと' + days + '日') + '）: '));
    var a = document.createElement('a'); a.href = '#i-' + nx.id; a.textContent = nx.title;
    nextEl.appendChild(a);
  }

  // 確認日の注意
  if (K.monthsSince(V.CHECKED, today) >= V.STALE_MONTHS) document.getElementById('stale').hidden = false;

  // 絞り込み
  var chips = document.getElementById('chips');
  var shown = document.getElementById('shown');
  function apply() {
    var n = 0;
    items.forEach(function (li) {
      var on = current === 'all' || li.getAttribute('data-cat') === current;
      li.hidden = !on; if (on) n++;
    });
    // 行がすべて隠れた月の見出しと年の枠も隠す
    document.querySelectorAll('.kt-list').forEach(function (ol) {
      var any = ol.querySelector('.kt-item:not([hidden])');
      ol.hidden = !any; ol.previousElementSibling.hidden = !any;
    });
    document.querySelectorAll('.kt-year').forEach(function (sec) { sec.hidden = !sec.querySelector('.kt-item:not([hidden])'); });
    document.querySelectorAll('.kt-simple li').forEach(function (li) { li.hidden = !(current === 'all' || li.getAttribute('data-cat') === current); });
    shown.textContent = String(n);
    Array.prototype.forEach.call(chips.querySelectorAll('.kt-chip'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-cat') === current)); });
  }
  chips.hidden = false;
  chips.addEventListener('click', function (e) {
    var b = e.target.closest('.kt-chip'); if (!b) return;
    current = b.getAttribute('data-cat'); apply();
  });

  // .ics の保存（この端末の中で作るだけ）
  function save(text, name) {
    var blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  var all = document.getElementById('ics-all');
  all.hidden = false;
  all.addEventListener('click', function () {
    var list = current === 'all' ? V.ITEMS : K.filterCats(V.ITEMS, [current]);
    save(K.buildIcs(K.inRange(list, V.RANGE)), 'seido-kaitei' + (current === 'all' ? '' : '-' + current) + '.ics');
  });
  document.querySelectorAll('.kt-add').forEach(function (b) {
    b.hidden = false;
    b.addEventListener('click', function () {
      var it = K.byId(b.getAttribute('data-id'));
      if (it) save(K.buildIcs([it]), 'seido-kaitei-' + it.id + '.ics');
    });
  });
})();
