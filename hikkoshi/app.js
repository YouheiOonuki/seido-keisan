// ===========================
// 引越しの手続きの一覧（/seido-keisan/hikkoshi/）— 画面の制御
// 並びと期限は ../lib/hikkoshi.js、項目の文・日数・出典は ../lib/hikkoshi-values.js、保存は ../lib/box.js（区画 hikkoshi）。
// 保存するのは引越しの日・引越しの先・当てはまるもの・済んだ印だけ（自由な文字は無い）。サーバーには何も送らない
// ===========================
(function () {
  'use strict';

  var H = window.Hikkoshi, V = window.HikkoshiValues, B = window.Box, S = window.ScreenParts;
  var $ = function (id) { return document.getElementById(id); };
  var setBar = S.fixbar();

  function todayJst() {
    var d = new Date(Date.now() + 9 * 3600000);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  var TODAY = todayJst();
  var WHEN = { before: '引越しの前', after: '引越しの後' };

  // --- 箱から読む（壊れていても空の入力で始める。元の値は保存し直すまで消さない） ---
  var store = null;
  try { store = window.localStorage; } catch (e) { store = null; }
  var loaded = H.fromBox(B.load(store).box, TODAY);
  var state = loaded.state, year = loaded.year;

  function save() {
    if (!store) return;
    var r = H.toBox(B.load(store).box, state, year, TODAY);
    year = r.year;
    B.save(store, r.box);
  }

  // --- 入力欄を作る ---
  V.KINDS.forEach(function (k) {
    var l = document.createElement('label'); l.className = 'inline';
    var i = document.createElement('input'); i.type = 'radio'; i.name = 'kind'; i.value = k.id; i.dataset.kind = '1';
    l.appendChild(i); l.appendChild(document.createTextNode(' ' + k.label));
    $('kinds').appendChild(l);
  });
  V.HAS.forEach(function (h) {
    var l = document.createElement('label'); l.className = 'inline';
    var i = document.createElement('input'); i.type = 'checkbox'; i.value = h.id; i.dataset.has = '1';
    l.appendChild(i); l.appendChild(document.createTextNode(' ' + h.label));
    $('has').appendChild(l);
  });
  function fillForm() {
    $('move-date').value = state.moveDate;
    document.querySelectorAll('[data-kind]').forEach(function (el) { el.checked = el.value === state.kind; });
    document.querySelectorAll('[data-has]').forEach(function (el) { el.checked = !!state.has[el.value]; });
  }

  function onField(e) {
    var el = e.target;
    if (el.id === 'move-date') state.moveDate = el.value;
    else if (el.dataset.kind) state.kind = el.value;
    else if (el.dataset.has) state.has[el.value] = el.checked;
    else if (el.dataset.done) {
      var i = state.done.indexOf(el.value);
      if (el.checked && i < 0) state.done.push(el.value);
      if (!el.checked && i >= 0) state.done.splice(i, 1);
    } else return;
    state = H.normalize(state);
    render();
    save();
  }
  document.addEventListener('change', onField);
  $('move-date').addEventListener('input', onField);

  function basisText(basis) {
    return basis.map(function (x) { var s = V.SOURCES[x[0]]; return (s.short || s.label) + (x[1] ? ' ' + x[1] : ''); }).join('・');
  }

  function render() {
    var b = H.build(state, TODAY);
    // 結果
    $('r-big').textContent = '残り ' + b.left + ' 件';
    if (!b.left) $('r-detail').textContent = '並んだ手続きに印が付きました。';
    else if (b.next) $('r-detail').textContent = '次の期限は ' + H.ja(b.next.due) + '（' + b.next.name + '）です。';
    else $('r-detail').textContent = state.moveDate ? '日付の出る期限は過ぎたか、済んでいます。' : '引越しの日を入れると、期限が日付で出ます。';
    setBar('残り ' + b.left + ' 件');
    var on = V.HAS.filter(function (h) { return state.has[h.id]; }).length;
    $('has-state').textContent = V.HAS.length + ' 項目のうち ' + on;

    // 一覧
    var list = $('list');
    list.textContent = '';
    b.groups.forEach(function (g) {
      var h = document.createElement('h3'); h.className = 'h-group'; h.textContent = WHEN[g.when];
      var ol = document.createElement('ol'); ol.className = 'steps-list';
      g.items.forEach(function (it) {
        var li = document.createElement('li');
        li.className = 'step' + (it.done ? ' is-done' : '') + (it.overdue ? ' is-overdue' : '');
        var lab = document.createElement('label'); lab.className = 'step-head';
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = it.id; cb.dataset.done = '1'; cb.checked = it.done;
        var nm = document.createElement('span');
        var n = document.createElement('span'); n.className = 'step-name'; n.textContent = it.name;
        var due = document.createElement('span'); due.className = 'step-due';
        var bd = document.createElement('b'); bd.textContent = it.deadlineText + (it.overdue ? '（過ぎています）' : '');
        due.appendChild(bd);
        nm.appendChild(n); nm.appendChild(due);
        lab.appendChild(cb); lab.appendChild(nm);
        var body = document.createElement('div'); body.className = 'step-body';
        var p = document.createElement('p'); p.textContent = it.text;
        var meta = document.createElement('p'); meta.className = 'step-meta';
        meta.textContent = '窓口: ' + it.where + (it.basis.length ? '。根拠: ' + basisText(it.basis) : '');
        body.appendChild(p); body.appendChild(meta);
        li.appendChild(lab); li.appendChild(body);
        ol.appendChild(li);
      });
      list.appendChild(h); list.appendChild(ol);
    });
    $('print-note').textContent = (state.moveDate ? '引越しの日 ' + H.ja(state.moveDate) + '・' : '') + H.ja(TODAY) + ' に yorozu-craft.com/seido-keisan/hikkoshi/ で作成。期限と要否は、それぞれの窓口が決めます。';
    window.yzUsed?.();
  }

  $('print').addEventListener('click', function () { window.print(); });

  // --- ファイルへの書き出し・読み込み（箱ごと。D31） ---
  function fileMsg(t) { $('file-msg').textContent = t; }
  function download(name, blob) {
    var a = document.createElement('a');
    a.download = name;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  $('export').addEventListener('click', function () {
    var cur = H.toBox(B.load(store).box, state, year, TODAY).box;
    var name = B.exportFileName();
    download(name, new Blob([JSON.stringify(B.toExportFile(cur), null, 2)], { type: 'application/json' }));
    fileMsg('書き出しました（' + name + '）。同じ箱を使うほかの道具（医療費控除の明細書など）の入力も入っています。');
  });
  $('import').addEventListener('click', function () { $('import-file').click(); });
  $('import-file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { fileMsg('ファイルが大きすぎます（この画面で書き出したファイルを選んでください）。'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(String(reader.result)); } catch (err) { fileMsg('ファイルを読み込めませんでした（JSON の形式ではありません）。'); return; }
      var res = B.fromExportFile(obj);
      if (!res.ok) { fileMsg(res.message); return; }
      if (!window.confirm('今の入力内容を、ファイルの内容で置き換えます。よろしいですか？')) { fileMsg('読み込みをやめました。'); return; }
      if (store) B.save(store, res.data);
      var l = H.fromBox(res.data, TODAY);
      state = l.state; year = l.year;
      fillForm(); render();
      fileMsg('読み込みました（' + f.name + '）。');
    };
    reader.onerror = function () { fileMsg('ファイルを読み込めませんでした。'); };
    reader.readAsText(f);
  });
  // 保存を消すのは全ツール共通の「保存した内容をすべて消す」ボタン（../reset-storage.js）。箱ごと消える（医療費控除の明細書と同じ）

  // --- 確認日（一定期間たったら注意） ---
  (function () {
    var c = V.CHECKED.split('-');
    $('asof-date').textContent = c[0] + '年' + (+c[1]) + '月' + (+c[2]) + '日';
    var now = new Date();
    if ((now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]) >= V.STALE_MONTHS) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode('。確認日から時間がたっています。最新の手続きは市区町村の案内をご確認ください'));
    }
  })();

  fillForm();
  render();
})();
