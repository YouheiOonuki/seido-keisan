// ===========================
// 制度の改定カレンダー（画面から切り離した純粋関数）
//   - renderList など: lib/kaitei-values.js から一覧の HTML を作る（tools/build-kaitei.mjs が kaitei/index.html に書き込む）
//   - buildIcs: 同じデータから .ics（iCalendar、RFC 5545。終日の予定）を作る（画面のボタンがブラウザの中で作って保存させる）
// DOM や localStorage には触らない。ブラウザでは window.Kaitei、Node（テスト・書き出し）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var NODE = typeof module !== 'undefined' && module.exports;
  var V = NODE ? require('./kaitei-values.js') : root.KaiteiValues;

  var srcByKey = {};
  V.SOURCES.forEach(function (s) { srcByKey[s.key] = s; });
  var catLabel = {};
  V.CATS.forEach(function (c) { catLabel[c.key] = c.label; });

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function parts(date) { var p = date.split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function reiwa(y) { return y - 2018; }
  function ym(date) { return date.slice(0, 7); }

  // 並べ替え（日付 → 元の順）と範囲の絞り込み
  function sorted(items) {
    return items.map(function (it, i) { return { it: it, i: i }; })
      .sort(function (a, b) { return a.it.date < b.it.date ? -1 : a.it.date > b.it.date ? 1 : a.i - b.i; })
      .map(function (x) { return x.it; });
  }
  function inRange(items, range) {
    return items.filter(function (it) { return ym(it.date) >= range.from && ym(it.date) <= range.to; });
  }
  // [{ year, months: [{ ym, items }] }]（行のない月は出さない）
  function group(items, range) {
    var out = [];
    sorted(inRange(items, range || V.RANGE)).forEach(function (it) {
      var y = parts(it.date).y;
      var yg = out[out.length - 1];
      if (!yg || yg.year !== y) { yg = { year: y, months: [] }; out.push(yg); }
      var mg = yg.months[yg.months.length - 1];
      if (!mg || mg.ym !== ym(it.date)) { mg = { ym: ym(it.date), items: [] }; yg.months.push(mg); }
      mg.items.push(it);
    });
    return out;
  }

  function toolsHtml(tools) {
    if (!tools || !tools.length) return '<p class="kt-tools">このサイトのツール: なし</p>';
    return '<p class="kt-tools">このサイトのツール: ' + tools.map(function (t) {
      var tool = V.TOOLS[t.key];
      return '<a href="' + esc(tool.href) + '">' + esc(tool.name) + '</a>' + (t.note ? '（' + esc(t.note) + '）' : '');
    }).join('、') + '</p>';
  }
  function srcHtml(keys) {
    return '<p class="kt-src">出典: ' + keys.map(function (k) {
      var s = srcByKey[k];
      return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.label) + '</a>';
    }).join('、') + '</p>';
  }

  function itemHtml(it) {
    var p = parts(it.date);
    return '<li class="kt-item" id="i-' + esc(it.id) + '" data-cat="' + esc(it.cat) + '" data-date="' + esc(it.date) + '">\n' +
      '  <p class="kt-head"><time datetime="' + esc(it.date) + '">' + p.m + '月' + p.d + '日</time> <span class="kt-cat">' + esc(catLabel[it.cat]) + '</span></p>\n' +
      '  <p class="kt-title">' + esc(it.title) + '</p>\n' +
      '  <p class="kt-what">' + esc(it.what) + '</p>\n' +
      '  <p class="kt-who">対象: ' + esc(it.who) + '</p>\n' +
      '  ' + toolsHtml(it.tools) + '\n' +
      '  ' + srcHtml(it.src) + '\n' +
      '  <button type="button" class="btn-sub kt-add" data-id="' + esc(it.id) + '" hidden>カレンダーに追加（.ics）</button>\n' +
      '</li>';
  }

  // 一覧（年ごとの h2、月ごとの h3）
  function renderList(items, range) {
    return group(items || V.ITEMS, range).map(function (yg) {
      var head = '<section class="card content kt-year" aria-labelledby="y' + yg.year + '">\n' +
        '<h2 id="y' + yg.year + '">' + yg.year + '年（令和' + reiwa(yg.year) + '年）に変わること</h2>\n';
      return head + yg.months.map(function (mg) {
        var p = parts(mg.ym + '-01');
        return '<h3 id="m' + mg.ym + '" class="kt-month">' + p.y + '年' + p.m + '月に変わること</h3>\n' +
          '<ol class="kt-list">\n' + mg.items.map(itemHtml).join('\n') + '\n</ol>';
      }).join('\n') + '\n</section>';
    }).join('\n');
  }

  function renderYearly() {
    return '<ul class="kt-simple">\n' + V.YEARLY.map(function (y) {
      return '<li data-cat="' + esc(y.cat) + '"><strong>' + esc(y.when) + '</strong> ' + esc(y.title) + '。' +
        'このサイト: ' + y.tools.map(function (t) { var tool = V.TOOLS[t.key]; return '<a href="' + esc(tool.href) + '">' + esc(tool.name) + '</a>'; }).join('、') +
        '。出典: ' + y.src.map(function (k) { var s = srcByKey[k]; return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.label) + '</a>'; }).join('、') + '</li>';
    }).join('\n') + '\n</ul>';
  }

  function renderPending() {
    return '<ul class="kt-simple">\n' + V.PENDING.map(function (p) {
      return '<li data-cat="' + esc(p.cat) + '"><span class="kt-status">' + esc(p.status) + '</span> <strong>' + esc(p.title) + '</strong>。' + esc(p.what) + '。' +
        'このサイト: ' + p.tools.map(function (t) { var tool = V.TOOLS[t.key]; return '<a href="' + esc(tool.href) + '">' + esc(tool.name) + '</a>' + (t.note ? '（' + esc(t.note) + '）' : ''); }).join('、') +
        '。出典: ' + p.src.map(function (k) { var s = srcByKey[k]; return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.label) + '</a>'; }).join('、') + '</li>';
    }).join('\n') + '\n</ul>';
  }

  // ページに埋め込む部分（マーカーの間）をまとめて作る
  function renderAll() {
    return {
      list: renderList(),
      yearly: renderYearly(),
      pending: renderPending(),
      count: String(inRange(V.ITEMS, V.RANGE).length),
    };
  }

  // --- .ics（RFC 5545） ---
  // テキストのエスケープ（\ ; , と改行）
  function icsText(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  // 1 行 75 オクテットで折り返す（UTF-8 の文字の途中では切らない。続きの行は空白 1 つで始める）
  function fold(line) {
    var out = [], cur = '', curBytes = 0, limit = 75;
    for (var ch of line) {
      var b = utf8len(ch);
      if (curBytes + b > limit) { out.push(cur); cur = ' '; curBytes = 1; }
      cur += ch; curBytes += b;
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function utf8len(ch) {
    var c = ch.codePointAt(0);
    return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  function ymd(date) { return date.replace(/-/g, ''); }
  function nextDay(date) {
    var p = parts(date);
    var d = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
    return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
  }

  function eventLines(it, stamp) {
    var url = V.SITE + '#i-' + it.id;
    var desc = [it.what, '対象: ' + it.who];
    if (it.tools && it.tools.length) desc.push('このサイトのツール: ' + it.tools.map(function (t) { return V.TOOLS[t.key].name; }).join('、'));
    it.src.forEach(function (k) { desc.push('出典: ' + srcByKey[k].label + ' ' + srcByKey[k].url); });
    desc.push('一覧: ' + url);
    return [
      'BEGIN:VEVENT',
      'UID:kaitei-' + it.id + '@yorozu-craft.com',
      'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + ymd(it.date),
      'DTEND;VALUE=DATE:' + nextDay(it.date),
      'SUMMARY:' + icsText('【' + catLabel[it.cat] + '】' + it.title),
      'DESCRIPTION:' + icsText(desc.join('\n')),
      'URL:' + url,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    ];
  }

  // items: 行の配列。DTSTAMP はデータの確認日（同じデータなら同じファイルになる）
  function buildIcs(items) {
    var stamp = ymd(V.CHECKED) + 'T000000Z';
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//yorozu-craft//seido-keisan kaitei//JA',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:' + icsText('制度の改定カレンダー（yorozu-craft）'),
      'X-WR-TIMEZONE:Asia/Tokyo',
    ];
    sorted(items).forEach(function (it) { lines = lines.concat(eventLines(it, stamp)); });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  function byId(id) {
    for (var i = 0; i < V.ITEMS.length; i++) if (V.ITEMS[i].id === id) return V.ITEMS[i];
    return null;
  }
  function filterCats(items, cats) {
    return items.filter(function (it) { return cats.indexOf(it.cat) >= 0; });
  }
  // 今日より後（当日を含む）で最も近い行
  function nextItem(today) {
    var s = sorted(V.ITEMS).filter(function (it) { return it.date >= today; });
    return s.length ? s[0] : null;
  }
  function daysBetween(a, b) {
    var pa = parts(a), pb = parts(b);
    return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
  }
  // 確認日からの暦の月数（check-site・ほかの画面と同じ数え方）
  function monthsSince(checked, today) {
    var c = parts(checked), t = parts(today);
    return (t.y - c.y) * 12 + (t.m - c.m);
  }

  var api = {
    group: group, sorted: sorted, inRange: inRange, renderList: renderList, renderYearly: renderYearly, renderPending: renderPending, renderAll: renderAll,
    buildIcs: buildIcs, fold: fold, icsText: icsText, nextDay: nextDay, byId: byId, filterCats: filterCats, nextItem: nextItem, daysBetween: daysBetween, monthsSince: monthsSince,
  };
  if (NODE) module.exports = api;
  else root.Kaitei = api;
})(this);
