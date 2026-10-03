// ===========================
// 引越し・在留の手続きリスト（英語ページ。K69）— 画面の制御
// 項目と並びは ../../lib/moving-checklist.js、項目の文・日数・出典は lib/moving-checklist-values.js にだけ置く
// ===========================
(function () {
  'use strict';

  var M = window.MovingChecklist;
  var V = window.MovingChecklistValues;
  var S = window.ScreenParts;

  var KEY_PREFIX = 'seido-keisan_';
  var DRAFT = 'movingchecklist_draft';
  var store = {
    get: function (name, fallback) {
      try { var v = localStorage.getItem(KEY_PREFIX + name); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (name, value) { try { localStorage.setItem(KEY_PREFIX + name, JSON.stringify(value)); } catch (e) { /* 続ける */ } },
  };

  var $ = function (id) { return document.getElementById(id); };
  var state = store.get(DRAFT, {});
  if (!state || typeof state !== 'object') state = {};
  var setBar = S.fixbar();

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dateEn(iso) { var p = iso.split('-'); return MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0]; }
  var WHEN = { before: 'Before you move or leave', depart: 'When you leave Japan', after: 'After you move', renew: 'Before your period of stay ends' };

  // 場面のチェックボックス
  V.SITUATIONS.forEach(function (s) {
    var l = document.createElement('label');
    var i = document.createElement('input'); i.type = 'checkbox'; i.value = s.id; i.dataset.sit = '1';
    l.appendChild(i); l.appendChild(document.createTextNode(s.label));
    $('sits').appendChild(l);
  });

  function fillForm() {
    var d = M.normalizeInput(state);
    document.querySelectorAll('[data-sit]').forEach(function (el) { el.checked = d.situations.indexOf(el.value) >= 0; });
    document.querySelectorAll('[data-k]').forEach(function (el) {
      var v = d[el.dataset.k];
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v || '';
    });
  }

  function onField(e) {
    var el = e.target;
    if (el.dataset.sit) {
      state.situations = Array.prototype.filter.call(document.querySelectorAll('[data-sit]'), function (x) { return x.checked; }).map(function (x) { return x.value; });
    } else if (el.dataset.k) {
      state[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
    } else return;
    update();
  }
  document.addEventListener('input', onField);
  document.addEventListener('change', onField);

  function render() {
    var b = M.build(state), d = b.input;
    var list = $('list');
    list.textContent = '';
    S.setText('r-empty', b.count ? '' : 'Choose your situation to see the list.');
    $('print').disabled = !b.count;
    $('print-name').hidden = !d.name;
    S.setText('print-name', d.name ? 'For: ' + d.name : '');
    S.setText('st-dates', [d.moveDate ? 'moving ' + dateEn(d.moveDate) : '', d.expiryDate ? 'stay ends ' + dateEn(d.expiryDate) : ''].filter(Boolean).join(', ') || 'none');
    S.setText('st-more', (d.hasCard ? 'I have a card' : 'no card') + (d.name ? ', ' + d.name : ''));
    b.groups.forEach(function (g) {
      var sec = document.createElement('div'); sec.className = 'cl-group';
      var h = document.createElement('h3'); h.textContent = WHEN[g.when]; sec.appendChild(h);
      var ul = document.createElement('ul'); ul.className = 'cl';
      g.items.forEach(function (it) {
        var li = document.createElement('li');
        var box = document.createElement('span'); box.className = 'box'; box.setAttribute('aria-hidden', 'true');
        var body = document.createElement('div');
        var p = document.createElement('p'); p.className = 'what'; p.textContent = it.text;
        if (it.link) { p.appendChild(document.createTextNode(' ')); var a = document.createElement('a'); a.href = it.link.href; a.textContent = it.link.text; p.appendChild(a); }
        var meta = document.createElement('p'); meta.className = 'meta';
        if (it.due) {
          var due = document.createElement('span'); due.className = 'due';
          due.textContent = (it.from ? 'From ' + dateEn(it.from) + ' to ' : 'By ') + dateEn(it.due) + '. ';
          meta.appendChild(due);
        }
        var basis = it.basis.map(function (x) { return V.SOURCES[x[0]].label.replace(/ \(e-Gov\)$/, '') + (x[1] ? ' ' + x[1] : ''); }).join('; ');
        meta.appendChild(document.createTextNode([it.where ? 'Where: ' + it.where + '.' : '', basis ? 'Basis: ' + basis + '.' : ''].filter(Boolean).join(' ')));
        body.appendChild(p); body.appendChild(meta);
        li.appendChild(box); li.appendChild(body); ul.appendChild(li);
      });
      sec.appendChild(ul); list.appendChild(sec);
    });
    setBar(b.count ? b.count + (b.count === 1 ? ' step' : ' steps') : '');
  }

  var saveTimer = null, lastSig = '';
  function update() {
    var sig = JSON.stringify(state);
    if (sig === lastSig) return;
    lastSig = sig;
    render();
    clearTimeout(saveTimer);
    if (Object.keys(state).length) saveTimer = setTimeout(function () { store.set(DRAFT, M.normalizeInput(state)); }, 300);
  }

  $('print').addEventListener('click', function () { window.print(); });

  // --- ファイルへの書き出し・読み込み（D31） ---
  var MSG = { notJson: 'This file is not JSON.', otherTool: 'This file was not exported from this checklist.', newer: 'This file is from a newer version. Reload the page and try again.', empty: 'This file has no inputs.' };
  function fileMsg(t) { $('file-msg').textContent = t; }
  function hasInput() { return JSON.stringify(M.normalizeInput(state)) !== JSON.stringify(M.normalizeInput({})); }
  $('export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(M.toExportFile(state), null, 2)], { type: 'application/json' });
    var a = document.createElement('a'), dt = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = M.TOOL_ID + '-backup-' + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + '.json';
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    fileMsg('Saved ' + a.download + '.');
  });
  $('import').addEventListener('click', function () { $('import-file').click(); });
  $('import-file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 1024 * 1024) { fileMsg('This file is too large.'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(String(reader.result)); } catch (err) { fileMsg(MSG.notJson); return; }
      var res = M.fromExportFile(obj);
      if (!res.ok) { fileMsg(MSG[res.code]); return; }
      if (hasInput() && !window.confirm('Replace your current inputs with the file?')) { fileMsg('Cancelled.'); return; }
      state = res.data; fillForm(); update();
      fileMsg('Loaded ' + f.name + '.');
    };
    reader.onerror = function () { fileMsg('Could not read the file.'); };
    reader.readAsText(f);
  });

  (function () {
    $('asof-date').textContent = dateEn(V.CHECKED);
    var c = V.CHECKED.split('-'), now = new Date();
    if ((now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]) >= V.STALE_MONTHS) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode(' Some rules may have changed since then.'));
    }
  })();

  fillForm();
  update();
  document.documentElement.classList.remove('js-loading');
})();
