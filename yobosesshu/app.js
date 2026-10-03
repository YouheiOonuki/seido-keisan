// 子どもの予防接種スケジュールの画面。計算は ../lib/yobosesshu.js、値は ../lib/yobosesshu-values.js
// 生年月日は保存しない（localStorage も # も使わない）
(function () {
  'use strict';
  var Y = window.Yobosesshu, V = window.YobosesshuValues, S = window.ScreenParts;
  var $ = function (id) { return document.getElementById(id); };
  var setBar = S.fixbar();

  function todayJst() {
    var d = new Date(Date.now() + 9 * 3600000);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  var STATUS = { now: 'いま標準の時期', before: 'これから', late: '標準の時期を過ぎた', ended: '期間が終わった', follow: '前の回から' };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function names(rows) { return rows.map(function (r) { return r.short + '（' + r.dose + '）'; }).join('・'); }

  function render() {
    var today = todayJst();
    var s = Y.schedule($('birth').value, today);
    var tb = $('sched').tBodies[0];
    if (!s || $('birth').value > today) {
      $('r-big').textContent = '—';
      $('r-detail').textContent = s ? '生年月日が今日より後です。' : '生年月日を入れると出ます。';
      $('r-late').innerHTML = '';
      tb.innerHTML = '<tr><td colspan="2">—</td></tr>';
      setBar('');
      return;
    }
    if (s.now.length) {
      $('r-big').textContent = names(s.now);
      $('r-big').classList.toggle('long', names(s.now).length > 12);
      $('r-detail').textContent = '今日（' + Y.ja(today) + '）が標準的な時期に入っている回です。' + (s.next ? '次は ' + Y.ja(s.next.date) + ' から ' + names(s.next.rows) + '。' : '');
      setBar('いま: ' + s.now.map(function (r) { return r.short; }).join('・'));
    } else if (s.next) {
      $('r-big').textContent = Y.ja(s.next.date) + ' から';
      $('r-big').classList.remove('long');
      $('r-detail').textContent = '次に標準的な時期に入るのは ' + names(s.next.rows) + ' です。';
      setBar('次: ' + Y.short(s.next.date));
    } else {
      $('r-big').textContent = '標準的な時期はすべて過ぎています';
      $('r-detail').textContent = '下の一覧で、定期接種の期間の終わりを確かめてください。';
      setBar('');
    }
    $('r-late').innerHTML = s.late.length
      ? '<li>標準の時期を過ぎて、まだ定期接種の期間内: ' + s.late.map(function (r) { return esc(r.short + '（' + r.dose + '）' + Y.short(r.target.to) + 'まで'); }).join('、') + '。受けたかどうかは母子健康手帳で確かめてください。</li>'
      : '';
    // ワクチンごとに 1 行。回ごとの日付と間隔は行の中に並べる
    var groups = [];
    s.rows.forEach(function (r) { if (r.first) groups.push([r]); else groups[groups.length - 1].push(r); });
    tb.innerHTML = groups.map(function (g) {
      var f = g[0];
      var lines = g.map(function (r) {
        var when = r.std ? Y.short(r.std.from) + '〜' + Y.short(r.std.to) : '';
        var sub = (r.std && r.stdText ? esc(r.stdText) : '') + (r.std && r.stdText && r.gap ? '。' : '') + (r.gap ? esc(r.gap) : '');
        var st = r.status === 'follow' ? '' : '<span class="st st-' + r.status + '">' + esc(STATUS[r.status]) + '</span>';
        return '<li><span class="dose">' + esc(r.dose) + '</span> ' + (when ? '<b>' + when + '</b>' : '') + st + (sub ? '<small>' + sub + '</small>' : '') + '</li>';
      }).join('');
      var cls = g.some(function (r) { return r.status === 'now'; }) ? 'now' : f.status === 'ended' ? 'ended' : '';
      return '<tr class="' + cls + '"><th scope="row">' + esc(f.name) + '<small>定期接種 ' + Y.short(f.target.to) + 'まで</small><small class="tt">' + esc(f.targetText) + '</small></th><td><ul class="doses">' + lines + '</ul></td></tr>';
    }).join('');
    $('print-note').textContent = '生年月日 ' + Y.ja(s.birth) + '・' + Y.ja(today) + ' に yorozu-craft.com/seido-keisan/yobosesshu/ で作成。厚生労働省「定期接種実施要領」（' + V.YOURYOU_REVISION + '）と予防接種法施行令による。実際の接種の日は市区町村の案内とかかりつけの医師が決めます。';
  }

  $('oos').innerHTML = V.OUT_OF_SCOPE.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
  $('birth').addEventListener('change', render);
  $('birth').addEventListener('input', render);
  $('print').addEventListener('click', function () { window.print(); });

  // 確認日から一定期間たったら注意
  (function () {
    var c = V.CHECKED.split('-');
    $('asof-date').textContent = c[0] + '年' + (+c[1]) + '月' + (+c[2]) + '日';
    var now = new Date();
    var months = (now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]);
    if (months >= V.STALE_MONTHS) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode('。確認日から時間がたっています。最新の定期接種は市区町村・厚生労働省の案内をご確認ください'));
    }
  })();
  render();
})();
