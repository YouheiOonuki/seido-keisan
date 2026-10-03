// ===========================
// 育休・産休の給付の計算（Japan childcare leave benefit calculator、英語ページ。K63）— 画面の制御
// 計算は ../../lib/childcare-leave.js（入力を直して lib/ikukyu.js の calc を呼ぶだけ）、
// 値は lib/ikukyu-values.js にだけ置く。ここには英語の文言と DOM の操作だけ
// ===========================
(function () {
  'use strict';

  var C = window.ChildcareLeave;
  var I = window.Ikukyu;
  var IV = window.IkukyuValues;
  var S = window.ScreenParts;

  // --- ブラウザへの保存（README「ツールを追加するとき」12） ---
  var KEY_PREFIX = 'seido-keisan_';
  var DRAFT = 'childcareleave_draft';
  var store = {
    get: function (name, fallback) {
      try {
        var v = localStorage.getItem(KEY_PREFIX + name);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set: function (name, value) {
      try { localStorage.setItem(KEY_PREFIX + name, JSON.stringify(value)); } catch (e) { /* 保存できなくても続ける */ }
    },
  };

  var $ = function (id) { return document.getElementById(id); };
  var page = document.querySelector('main');
  var state = store.get(DRAFT, {});
  if (!state || typeof state !== 'object') state = {};

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MON = MONTHS.map(function (m) { return m.slice(0, 3); });
  function yen(n) { return '¥' + Math.round(n).toLocaleString('en-US'); }
  function dateEn(iso) { var p = iso.split('-'); return MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0]; }
  function dayEn(n) { return dateEn(I.fmt(n)); }
  function shortEn(n) { var p = I.fmt(n).split('-'); return MON[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0]; }
  function monthEn(mi) { return MON[mi % 12] + ' ' + Math.floor(mi / 12); }

  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, obj); }
  function setPath(obj, path, v) {
    var ks = path.split('.'), o = obj;
    for (var i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = v;
  }

  function fields() { return page.querySelectorAll('[data-k]'); }
  function fillForm() {
    var d = C.normalizeInput(state);
    fields().forEach(function (el) {
      var k = el.dataset.k, v = getPath(state, k);
      if (el.type === 'radio') el.checked = String(getPath(d, k)) === el.value;
      else if (el.type === 'checkbox') el.checked = !!v;
      else if (el.tagName === 'SELECT') el.value = String(getPath(d, k));
      else el.value = v === undefined || v === null ? '' : String(v);
    });
    updateUi();
  }
  function readField(el) {
    if (el.type === 'radio' && !el.checked) return;
    setPath(state, el.dataset.k, el.type === 'checkbox' ? el.checked : el.value);
  }

  var SPOUSE_SHORT = { leave14: 'takes 14+ days of leave', noLeave: 'takes less than 14 days', notEmployee: 'not an employee', none: 'no partner' };
  function updateUi() {
    var d = C.normalizeInput(state);
    var mother = d.role === 'mother';
    document.querySelectorAll('.mother-only').forEach(function (el) { el.hidden = !mother; });
    document.querySelectorAll('.partner-only').forEach(function (el) { el.hidden = mother; });
    $('papa-row').hidden = !d.papa.use;
    S.setText('st-spouse', SPOUSE_SHORT[d.spouse]);
    S.setText('st-birth', d.babies + (d.babies === 1 ? ' baby' : ' babies') + (d.birthDate ? ', born ' + dateEn(d.birthDate) : ', born on the due date'));
    S.setText('st-pay', d.wage6 || d.hyojun ? 'entered' : 'from your monthly salary');
    var leave = [];
    if (!mother && d.papa.use) leave.push('paternity leave');
    leave.push(d.leaveEnd ? 'until ' + dateEn(d.leaveEnd) : 'until the child turns 1');
    S.setText('st-leave', leave.join(', '));
    var due = I.parseDate(d.dueDate), birth = I.parseDate(d.birthDate);
    var b = birth === null ? due : birth;
    if (b !== null) {
      S.setText('leave-end-hint', 'Leave blank to stay off until ' + dayEn(I.firstBirthday(b) - 1) + ', the day before the first birthday.');
      S.setText('leave-start-hint', d.papa.use ? 'Leave blank to start the day after paternity leave.' : 'Leave blank to start on the birth date (' + dayEn(b) + ').');
    }
  }

  // --- 結果 ---
  var setBar = S.fixbar();
  function row(tb, cells, cls) {
    var tr = document.createElement('tr');
    if (cls) tr.className = cls;
    cells.forEach(function (c, i) {
      var e = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) e.scope = 'row';
      e.textContent = c;
      tr.appendChild(e);
    });
    tb.appendChild(tr);
  }
  function li(ul, text) { var e = document.createElement('li'); e.textContent = text; ul.appendChild(e); }

  var NOTICE = {
    papaDates: 'Enter the start and end dates of paternity leave.',
    papaWindow: 'Paternity leave must fall within 8 weeks of the birth or due date. Check the dates.',
    papaOver28: 'Paternity leave benefit covers up to 28 days. Days after that are not paid.',
    leaveOverlap: 'Childcare leave overlaps paternity leave. It is counted from the day after.',
    leaveOrder: 'Childcare leave ends before it starts. Check the dates.',
    afterOne: 'Leave after the first birthday is not covered. The benefit is counted until 2 days before it.',
    wageMax: 'Your daily wage is above the cap, so the benefit is at the maximum.',
    wageMin: 'Your daily wage is below the minimum, so the minimum is used.',
  };

  function render() {
    var res = C.calc(state);
    var d = res.input;
    page.querySelector('[data-need="salary"]').classList.toggle('is-missing', res.need === 'salary');
    page.querySelector('[data-need="dueDate"]').classList.toggle('is-missing', res.need === 'dueDate');
    var tb = $('t-benefits'), pb = $('periods').tBodies[0], sb = $('steps').tBodies[0];
    tb.textContent = ''; pb.textContent = ''; sb.textContent = ''; $('r-notices').textContent = '';
    if (!res.ready) {
      S.setText('r-big', '—');
      S.setText('r-detail', res.need === 'dueDate' ? 'Enter the due date to see the result.' : 'Enter your monthly salary to see the result.');
      S.setText('r-tax', '');
      $('periods-box').hidden = true; $('steps-box').hidden = true;
      setBar('');
      return;
    }
    var r = res.r, k = IV.koyo;
    res.notices.forEach(function (n) {
      if (n === 'capYear') li($('r-notices'), 'Caps change every August 1. Amounts after ' + dateEn(k.validTo) + ' may differ slightly.');
      else li($('r-notices'), NOTICE[n]);
    });

    if (r.leave && r.leave.periods.length) {
      S.setText('r-lead', 'Childcare leave benefit per month');
      S.setText('r-big', yen(r.leave.monthlyHigh));
      S.setText('r-detail', k.rateHigh + '% for the first ' + k.highDays + ' days, then ' + yen(r.leave.monthlyLow) + ' a month (' + k.rateLow + '%). All benefits together: ' + yen(r.total) + '.');
      setBar(yen(r.leave.monthlyHigh) + ' a month');
    } else {
      S.setText('r-lead', 'All benefits together');
      S.setText('r-big', yen(r.total));
      S.setText('r-detail', 'No childcare leave in the dates you entered.');
      setBar(yen(r.total) + ' in benefits');
    }

    // 給付ごとの額
    if (r.teate) row(tb, ['Maternity allowance (' + r.teate.period.days + ' days × ' + yen(r.teate.daily.daily) + ')', yen(r.teate.total)]);
    if (r.papa) row(tb, ['Paternity leave benefit (' + r.papa.paidDays + ' days)', yen(r.papa.amount)]);
    if (r.leave) row(tb, ['Childcare leave benefit (to ' + shortEn(r.leave.payEnd) + ')', yen(r.leave.total)]);
    row(tb, ['13% post-birth top-up' + (r.shien.ok ? ' (' + r.shien.days + ' days)' : ''), r.shien.ok ? yen(r.shien.amount) : 'not eligible']);
    row(tb, ['Total', yen(r.total)], 'total');
    row(tb, ['Childbirth lump sum (' + r.ichiji.babies + ' × ' + yen(r.ichiji.per) + ')', yen(r.ichiji.total)]);

    var why;
    if (r.shien.ok) why = '';
    else if (!r.shien.daysOk) why = 'The 13% top-up needs 14 days or more of leave between ' + shortEn(r.shien.windowStart) + ' and ' + shortEn(r.shien.windowEnd) + ' (you have ' + r.shien.daysInWindow + ').';
    else why = 'The 13% top-up also needs your partner to take 14 days or more of leave, unless they are not an employee or you have no partner.';
    var ex = r.exempt.length ? ' Health and pension insurance premiums are waived for ' + r.exempt.length + (r.exempt.length === 1 ? ' month' : ' months') + ' (' + monthEn(r.exempt[0].mi) + (r.exempt.length > 1 ? ' to ' + monthEn(r.exempt[r.exempt.length - 1].mi) : '') + ', about ' + yen(r.exemptTotal) + ').' : '';
    S.setText('r-tax', (why ? why + ' ' : '') + 'These benefits are not taxed.' + ex);

    // 支給単位期間
    if (r.leave) r.leave.periods.forEach(function (p) {
      row(pb, [String(p.no), shortEn(p.start) + ' – ' + shortEn(p.end), String(p.days), p.d50 ? (p.d67 ? k.rateHigh + '% / ' + k.rateLow + '%' : k.rateLow + '%') : k.rateHigh + '%', yen(p.amount)]);
    });
    $('periods-box').hidden = !(r.leave && r.leave.periods.length);

    // 途中の計算
    row(sb, ['Pay in the 6 months before leave', yen(r.wage6)]);
    row(sb, ['Daily wage (÷ 180, rounded down' + (r.wage.capped === 'max' ? ', capped at ' + yen(k.dailyMax) : r.wage.capped === 'min' ? ', raised to the minimum ' + yen(k.dailyMin) : '') + ')', yen(r.wage.daily)]);
    if (r.leave) {
      row(sb, ['Childcare leave, 30 days × ' + k.rateHigh + '%', yen(r.leave.monthlyHigh)]);
      row(sb, ['Childcare leave, 30 days × ' + k.rateLow + '% (from day ' + (k.highDays + 1) + ')', yen(r.leave.monthlyLow)]);
    }
    if (r.teate) {
      row(sb, ['Standard monthly remuneration', yen(r.hyojun)]);
      row(sb, ['Maternity allowance per day (÷ 30, rounded to ¥10, × 2/3)', yen(r.teate.daily.daily)]);
      row(sb, ['Maternity leave: ' + shortEn(r.teate.period.start) + ' – ' + shortEn(r.teate.period.end), r.teate.period.days + ' days']);
    }
    if (r.shien.ok) row(sb, ['13% top-up: daily wage × ' + r.shien.days + ' days × ' + k.shien.rate + '%', yen(r.shien.amount)]);
    $('steps-box').hidden = false;
  }

  var saveTimer = null, lastSig = '';
  function update() {
    var sig = JSON.stringify(state);
    if (sig === lastSig) return;
    lastSig = sig;
    render();
    clearTimeout(saveTimer);
    // 何も入れていないとき（初めて開いた・消した直後）は保存しない
    if (Object.keys(state).length) saveTimer = setTimeout(function () { store.set(DRAFT, state); }, 300);
  }

  function onField(e) {
    if (!e.target.dataset || !e.target.dataset.k) return;
    readField(e.target); updateUi(); update();
  }
  page.addEventListener('input', onField);
  page.addEventListener('change', onField);

  // --- ファイルへの書き出し・読み込み（D31） ---
  var MSG = {
    notJson: 'This file is not JSON.',
    otherTool: 'This file was not exported from this calculator.',
    newer: 'This file is from a newer version. Reload the page and try again.',
    empty: 'This file has no inputs.',
  };
  function hasInput() { return JSON.stringify(C.normalizeInput(state)) !== JSON.stringify(C.normalizeInput({})); }
  function fileMsg(t) { $('file-msg').textContent = t; }

  $('export').addEventListener('click', function () {
    var data = C.toExportFile(state);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var dt = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = C.TOOL_ID + '-backup-' + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + '.json';
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
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
      var res = C.fromExportFile(obj);
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

  // --- 確認日: 育休・産休の値ファイルの確認日と上限額の期間。12 か月たつか、上限額の期間が過ぎたら注意 ---
  (function () {
    $('asof-date').textContent = dateEn(IV.CHECKED);
    $('asof-from').textContent = dateEn(IV.koyo.validFrom);
    var c = IV.CHECKED.split('-');
    var now = new Date();
    var months = (now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]);
    var todayIso = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
    if (months >= IV.STALE_MONTHS || todayIso > IV.koyo.validTo) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode(' The caps may have changed since then.'));
    }
  })();

  fillForm();
  lastSig = '';
  update();
  document.documentElement.classList.remove('js-loading');
})();
