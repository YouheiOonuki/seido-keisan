// ===========================
// 高額療養費の計算（Japan high-cost medical expense benefit calculator、英語ページ）— 画面の制御
// 計算は ../../lib/high-cost-medical.js（入力を直して lib/kogaku.js の calc を呼ぶだけ）、
// 上限額・区分は lib/kogaku-values.js にだけ置く。ここには英語の文言と DOM の操作だけ
// ===========================
(function () {
  'use strict';

  var H = window.HighCostMedical;
  var K = window.Kogaku;
  var V = window.KogakuValues;
  var S = window.ScreenParts;

  var KEY_PREFIX = 'seido-keisan_';
  var DRAFT = 'highcost_draft';
  var store = {
    get: function (name, fallback) {
      try { var v = localStorage.getItem(KEY_PREFIX + name); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (name, value) { try { localStorage.setItem(KEY_PREFIX + name, JSON.stringify(value)); } catch (e) { /* 続ける */ } },
  };

  var $ = function (id) { return document.getElementById(id); };
  var page = document.querySelector('main');
  var now = new Date();
  var todayYm = now.getFullYear() + '-' + (now.getMonth() < 9 ? '0' : '') + (now.getMonth() + 1);
  var state = store.get(DRAFT, {});
  if (!state || typeof state !== 'object') state = {};
  var setBar = S.fixbar();
  var yen = H.yenA;
  function round(n) { return yen(Math.round(n)); }

  function period() { var d = H.normalizeInput(state); return d.period ? K.periodById(d.period) : K.periodFor(todayYm); }
  function formula(l, many) {
    if (many && l.many !== null) return yen(l.many) + ' (4th time on)';
    return l.thr ? yen(l.base) + ' + (cost − ' + yen(l.thr) + ') × 1%' : yen(l.base);
  }
  function catLabel(c, ageplan) {
    var e = H.catEn(c);
    if (ageplan === 'u70') return e.income + (e.hyojun && !/^exempt/.test(e.hyojun) ? ' (remuneration ' + e.hyojun + ')' : '');
    return e.o70 + ' (' + e.income.replace(/ \(70 and over\)$/, '') + ')';
  }

  // --- 選択肢 ---
  V.PERIODS.forEach(function (p) {
    var o = document.createElement('option');
    o.value = p.id;
    o.textContent = H.periodEn(p) + (p.id === K.periodFor(todayYm).id ? ' (this month)' : '');
    $('period').appendChild(o);
  });
  function fillCats() {
    var d = H.normalizeInput(state), sel = $('cat'), p = period();
    sel.textContent = '';
    var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Choose'; sel.appendChild(o0);
    H.catsFor(p, d.ageplan).forEach(function (c) {
      var o = document.createElement('option'); o.value = c.id; o.textContent = catLabel(c, d.ageplan); sel.appendChild(o);
    });
    var ok = H.catsFor(p, d.ageplan).some(function (c) { return c.id === d.cat; });
    if (!ok) state.cat = '';
    sel.value = ok ? d.cat : '';
    S.setText('cat-hint', d.ageplan === 'u70' ? 'Employees: by standard monthly remuneration. See the table below the result.' : 'Age 70 and over: by taxable income. See the table below the result.');
  }

  function fillForm() {
    var d = H.normalizeInput(state);
    $('ageplan').value = d.ageplan;
    $('period').value = period().id;
    fillCats();
    $('cost').value = d.cost ? String(d.cost) : '';
    page.querySelectorAll('input[name=place]').forEach(function (el) { el.checked = el.value === d.place; });
    $('rate').value = String(d.rate);
    page.querySelector('[data-k=many]').checked = d.many;
  }

  page.addEventListener('change', onField);
  page.addEventListener('input', onField);
  function onField(e) {
    var el = e.target, k = el.dataset && el.dataset.k;
    if (!k) return;
    if (el.type === 'radio' && !el.checked) return;
    state[k] = el.type === 'checkbox' ? el.checked : k === 'rate' ? Number(el.value) : el.value;
    // 年齢・区分を変えたら窓口の割合を既定に戻す（日本語の画面と同じ: 70 歳未満 30%、70〜74 歳 20%、75 歳以上 10%、現役並みは 30%）
    if (k === 'ageplan' || k === 'cat' || k === 'period') {
      if (k !== 'cat') fillCats();
      var d = H.normalizeInput(state), c = K.catById(period(), d.cat);
      var age = d.ageplan === 'u70' ? 'u70' : 'o70';
      state.rate = age === 'o70' && c && (c.gairai === null || c.gairai === undefined) ? 0.3 : K.defaultRate(age, d.ageplan === 'kouki' ? 'kouki' : 'kenpo');
      $('rate').value = String(state.rate);
    }
    update();
  }

  function tr(tb, cells) {
    var row = document.createElement('tr');
    cells.forEach(function (c, i) { var e = document.createElement(i === 0 ? 'th' : 'td'); if (i === 0) e.scope = 'row'; e.textContent = c; row.appendChild(e); });
    tb.appendChild(row);
  }
  function renderTable() {
    var p = period(), d = H.normalizeInput(state), tb = $('cat-table').tBodies[0];
    tb.textContent = '';
    p.cats.forEach(function (c) {
      var e = H.catEn(c);
      tr(tb, [e.income, /^exempt/.test(e.hyojun) ? '—' : e.hyojun,
        c.o70only ? '—' : formula(c.u70) + (c.u70.many ? ' (' + yen(c.u70.many) + ')' : ''),
        e.o70 + ': ' + formula(c.o70) + (c.gairai ? ' (outpatient ' + yen(c.gairai) + ')' : ' (no outpatient limit)')]);
    });
    S.setText('table-note', H.periodEn(p) + '. Income is a guide; your insurer decides your category. National Health Insurance uses household income instead of remuneration.' + (d.ageplan === 'u70' ? '' : ''));
  }

  function render() {
    var res = H.calc(state, todayYm);
    var d = res.input, p = res.period, c = res.cat, r = res.k;
    var msgs = $('r-msgs');
    msgs.textContent = '';
    function msg(t) { var li = document.createElement('li'); li.textContent = t; msgs.appendChild(li); }
    page.querySelector('[data-need=cat]').classList.toggle('is-missing', !c);
    page.querySelector('[data-need=cost]').classList.toggle('is-missing', !d.cost);
    S.setText('st-when', H.periodEn(p) + (d.many ? ', 4th time or more' : ''));
    renderTable();

    if (!r.ready) {
      S.setText('r-lead', H.periodEn(p));
      S.setText('r-big', '—');
      S.setText('r-detail', !c ? 'Choose your income category.' : 'Enter the total medical cost.');
      ['paid', 'refund', 'formula', 'year'].forEach(function (k) { S.setText('t-' + k, '—'); });
      setBar('');
      return;
    }
    var e = res.catEn;
    S.setText('r-lead', H.periodEn(p) + ' · ' + (d.ageplan === 'u70' ? e.income : e.o70));
    S.setText('r-big', round(r.self));
    S.setText('r-detail', r.refund > 0
      ? 'Of the ' + round(r.paid) + ' you pay at the counter, ' + round(r.refund) + ' comes back. With a My Number insurance card, the hospital charges only up to the limit.'
      : 'Your share is under the limit, so no high-cost benefit is paid.');
    S.setText('t-paid', round(r.paid));
    S.setText('t-refund', round(r.refund));
    var outer = d.ageplan === 'u70' ? c.u70 : c.o70;
    S.setText('t-formula', formula(outer, d.many) + (r.limit !== null ? ' = ' + round(r.limit) : ''));
    $('row-year').hidden = !r.year;
    if (r.year) S.setText('t-year', yen(r.year.cap) + (r.year.gairaiYear && d.ageplan !== 'u70' ? ' (outpatient, 70 and over: ' + yen(r.year.gairaiYear) + ')' : ''));

    if (r.msgs.indexOf('o1u70') >= 0) msg('“Very low income” is a category for age 70 and over. Under 70, the residence-tax-exempt limit is used.');
    if (r.steps.some(function (s) { return s.kind === 'gairai'; })) {
      var g = r.steps.filter(function (s) { return s.kind === 'gairai'; })[0];
      msg('Outpatient limit for age 70 and over: ' + yen(g.limit) + ' a month per person.');
    }
    if (d.many && d.ageplan !== 'u70' && c.o70.many === null) msg('This category has no lower amount from the 4th time.');
    if (r.year && r.year.cap200) msg('If your income is about ¥2 million or less (remuneration ¥150,000 or less), the yearly cap is ' + yen(r.year.cap200) + ', refunded from August 2027.');
    if (r.year) msg('The yearly cap counts your own costs from August to July. You can claim the amount over it from ' + H.ymEn(V.YEAR_CLAIM_FROM) + '.');
    if (p.id !== K.periodFor(todayYm).id) msg('Calculated with the limits for another month (' + H.periodEn(p) + ').');

    setBar('You pay ' + round(r.self));
  }

  var saveTimer = null, lastSig = '';
  function update() {
    var sig = JSON.stringify(state);
    if (sig === lastSig) return;
    lastSig = sig;
    render();
    clearTimeout(saveTimer);
    if (Object.keys(state).length) saveTimer = setTimeout(function () { store.set(DRAFT, H.normalizeInput(state)); }, 300);
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
  var MSG = {
    notJson: 'This file is not JSON.',
    otherTool: 'This file was not exported from this calculator.',
    newer: 'This file is from a newer version. Reload the page and try again.',
    empty: 'This file has no inputs.',
  };
  function hasInput() { return JSON.stringify(H.normalizeInput(state)) !== JSON.stringify(H.normalizeInput({})); }
  function fileMsg(t) { $('file-msg').textContent = t; }
  $('export').addEventListener('click', function () {
    var data = H.toExportFile(state);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = H.TOOL_ID + '-backup-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '.json';
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    fileMsg('Saved ' + a.download + '. It contains your medical costs, so keep it safe.');
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
      var res = H.fromExportFile(obj);
      if (!res.ok) { fileMsg(MSG[res.code]); return; }
      if (hasInput() && !window.confirm('Replace your current inputs with the file?')) { fileMsg('Cancelled.'); return; }
      state = res.data;
      fillForm();
      update();
      fileMsg('Loaded ' + f.name + '.');
    };
    reader.onerror = function () { fileMsg('Could not read the file.'); };
    reader.readAsText(f);
  });

  // --- 確認日（12 か月たったら注意） ---
  (function () {
    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var c = V.CHECKED.split('-');
    $('asof-date').textContent = MONTHS[Number(c[1]) - 1] + ' ' + Number(c[2]) + ', ' + c[0];
    var months = (now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]);
    if (months >= V.STALE_MONTHS) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode(' The limits may have changed since then. Check with your insurer.'));
    }
  })();

  fillForm();
  update();
  document.documentElement.classList.remove('js-loading');
})();
