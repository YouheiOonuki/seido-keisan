// ===========================
// 住民税の計算（Japan residence tax calculator、英語ページ。K60）— 画面の制御
// 計算は ../../lib/residence-tax.js（入力を直して lib/juminzei.js の calc を呼ぶだけ）、
// 値は lib/juminzei-values.js にだけ置く。ここには英語の文言と DOM の操作だけ
// ===========================
(function () {
  'use strict';

  var R = window.ResidenceTax;
  var JV = window.JuminzeiValues;
  var S = window.ScreenParts;

  // --- ブラウザへの保存（README「ツールを追加するとき」12） ---
  var KEY_PREFIX = 'seido-keisan_';
  var DRAFT = 'residencetax_draft';
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

  // --- 文言（英語） ---
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function yen(n) { return '¥' + Math.round(n).toLocaleString('en-US'); }
  function dateEn(iso) { var p = iso.split('-'); return MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0]; }
  function pct(x) { return String(Math.round(x * 1000) / 1000) + '%'; }
  // 年度 → 収入の年・納める期間（年度は 6 月から翌年 5 月。1 月 1 日に住む市区町村がかける）
  function yearsOf(nendo) {
    return { income: JV.nendo[nendo].incomeYear, from: 'June ' + nendo, to: 'May ' + (nendo + 1), jan1: 'January 1, ' + nendo };
  }
  S.setText('l-n0', 'Tax from June ' + JV.CURRENT + ' (on ' + yearsOf(JV.CURRENT).income + ' salary)');
  S.setText('l-n1', 'Tax you pay now, to May ' + (JV.PREVIOUS + 1) + ' (on ' + yearsOf(JV.PREVIOUS).income + ' salary)');

  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, obj); }
  function setPath(obj, path, v) {
    var ks = path.split('.'), o = obj;
    for (var i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = v;
  }

  function fields() { return page.querySelectorAll('[data-k]'); }
  function fillForm() {
    var d = R.normalizeInput(state);
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

  function updateUi() {
    var d = R.normalizeInput(state);
    var y = yearsOf(d.nendo);
    S.setText('salary-label', 'Salary in ' + y.income + ' before tax');
    S.setText('si-label', 'Social insurance paid in ' + y.income);
    S.setText('ideco-label', 'iDeCo contributions in ' + y.income);
    S.setText('spouse-label', 'Spouse’s salary in ' + y.income);
    S.setText('kids-note', 'Ages are as of December 31, ' + y.income + '. Children are treated as having no income.');
    S.setText('st-city', (d.designated ? 'designated city' : 'standard rates') + ', grade ' + d.grade);
    var fam = [];
    if (d.spouse.has) fam.push('spouse');
    var kids = d.kids.u16 + d.kids.a16 + d.kids.a19;
    if (kids) fam.push(kids + (kids === 1 ? ' child' : ' children'));
    S.setText('st-family', fam.length ? fam.join(', ') : 'none');
    $('spouse-row').hidden = !d.spouse.has;
  }

  // --- 結果 ---
  var setBar = S.fixbar();
  function row(tb, label, amount, cls) {
    var tr = document.createElement('tr');
    if (cls) tr.className = cls;
    var th = document.createElement('th'); th.scope = 'row'; th.textContent = label;
    var td = document.createElement('td'); td.textContent = amount;
    tr.appendChild(th); tr.appendChild(td); tb.appendChild(tr);
  }
  function li(ul, text) { var e = document.createElement('li'); e.textContent = text; ul.appendChild(e); }
  function stepAmount(j, key) {
    for (var i = 0; i < j.steps.length; i++) if (j.steps[i].key === key) return j.steps[i].amount;
    return 0;
  }
  var CELLS = ['t-wari-p', 't-wari-c', 't-kinto-p', 't-kinto-c', 't-shinrin', 't-total'];

  function render() {
    var r = R.calc(state);
    var d = r.input;
    var y = yearsOf(d.nendo);
    page.querySelector('[data-need="salary"]').classList.toggle('is-missing', !d.salary);
    S.setText('r-lead', 'Per year, ' + y.from + ' to ' + y.to);
    S.setText('st-si', r.ready ? (r.siEstimated ? 'estimated ' + yen(r.si) : yen(r.si)) + (d.ideco ? ', iDeCo ' + yen(d.ideco) : '') : (d.si === null ? 'estimated' : yen(d.si)));
    S.setText('si-hint', d.salary > 0 && r.error === 'needSi' ? 'Enter the amount: it cannot be estimated over ¥20 million.' : 'Leave blank to estimate it from your salary.');
    S.setText('r-warn', r.error === 'needSi' ? 'For a salary over ¥20 million, enter your social insurance below the result.' : '');
    var tb = $('steps').tBodies[0];
    tb.textContent = '';
    $('r-pay').textContent = '';
    if (!r.ready) {
      S.setText('r-big', '—');
      S.setText('r-detail', r.error ? '' : 'Enter your salary to see the result.');
      CELLS.forEach(function (c) { S.setText(c, '—'); });
      S.setText('r-free', ''); S.setText('r-lag', '');
      $('steps-box').hidden = true;
      setBar('');
      return;
    }
    var j = r.j;
    var inst = j.installments;
    S.setText('r-big', yen(j.total));
    S.setText('r-detail', j.total === 0 ? 'No residence tax.'
      : 'From your salary: ' + yen(inst.tokubetsu.first) + ' in June, then ' + yen(inst.tokubetsu.rest) + ' a month to May.');

    // 非課税の判定（理由は数字から英語で組み立てる。日本語の reasons は使わない）
    var free;
    if (j.shotokuHikazei && j.kintoHikazei) {
      free = 'Tax-free: your employment income of ' + yen(j.goukei) + ' is at or below the limit of ' + yen(j.kintoLimit) + '.';
    } else if (j.shotokuHikazei) {
      free = 'Only the fixed levies: your employment income of ' + yen(j.goukei) + ' is at or below the income levy limit of ' + yen(j.shotokuLimit) + '.';
    } else {
      free = j.kintoLine === j.shotokuLine
        ? 'With salary only, there is no residence tax on a salary up to ' + yen(j.kintoLine) + ' a year.'
        : 'With salary only, there is no residence tax on a salary up to ' + yen(j.kintoLine) + ' a year, and no income levy up to ' + yen(j.shotokuLine) + '.';
    }
    S.setText('r-free', free);

    S.setText('t-wari-p', yen(j.prefWari)); S.setText('t-wari-c', yen(j.cityWari));
    S.setText('t-kinto-p', yen(j.prefKinto)); S.setText('t-kinto-c', yen(j.cityKinto));
    S.setText('t-shinrin', yen(j.shinrin)); S.setText('t-total', yen(j.total));

    if (j.total > 0) {
      li($('r-pay'), 'Through your employer: ' + yen(inst.tokubetsu.first) + ' in June and ' + yen(inst.tokubetsu.rest) + ' a month from July to May.');
      li($('r-pay'), inst.futsu.count === 1
        ? 'Paying it yourself: ' + yen(inst.futsu.first) + ' in June.'
        : 'Paying it yourself: ' + yen(inst.futsu.first) + ' in June, then ' + yen(inst.futsu.rest) + ' each in August, October and January.');
    }
    S.setText('r-lag', 'Charged by the city you live in on ' + y.jan1 + ', on your ' + y.income + ' salary.');

    // 途中の計算
    var ded = ['social insurance ' + yen(stepAmount(j, 'shakai'))];
    if (stepAmount(j, 'shokibo')) ded.push('iDeCo ' + yen(stepAmount(j, 'shokibo')));
    if (stepAmount(j, 'haigusha')) ded.push('spouse ' + yen(stepAmount(j, 'haigusha')));
    var dep = stepAmount(j, 'fuyo') + stepAmount(j, 'tokutei');
    if (dep) ded.push('dependents ' + yen(dep));
    ded.push('basic ' + yen(j.kiso));
    row(tb, 'Salary in ' + y.income, yen(d.salary));
    row(tb, 'Employment income (salary after the employment income deduction)', yen(j.kyuyoShotoku));
    row(tb, 'Deductions: ' + ded.join(', '), '− ' + yen(j.kojo));
    row(tb, 'Taxable income (rounded down to ¥1,000)', yen(j.taxable));
    row(tb, 'Income levy before credits: prefecture ' + pct(j.rates.pref) + ', city ' + pct(j.rates.city), yen(j.prefRaw + j.cityRaw));
    if (j.choseiPref + j.choseiCity) row(tb, 'Adjustment credit', '− ' + yen(j.choseiPref + j.choseiCity));
    if (j.genKei > 0) row(tb, 'Reduction near the income levy limit', '− ' + yen(j.genKei));
    row(tb, 'Income levy (each part rounded down to ¥100)', yen(j.wari));
    row(tb, 'Per capita levy and forest environment tax', yen(j.prefKinto + j.cityKinto + j.shinrin));
    row(tb, 'Residence tax for ' + y.from + ' to ' + y.to, yen(j.total), 'total');
    $('steps-box').hidden = false;

    setBar('Residence tax ' + yen(j.total) + ' a year');
  }

  var saveTimer = null, lastSig = '';
  function update() {
    var sig = JSON.stringify(R.normalizeInput(state)) + JSON.stringify(state);
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
  function hasInput() { return JSON.stringify(R.normalizeInput(state)) !== JSON.stringify(R.normalizeInput({})); }
  function fileMsg(t) { $('file-msg').textContent = t; }

  $('export').addEventListener('click', function () {
    var data = R.toExportFile(state);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var dt = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = R.TOOL_ID + '-backup-' + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + '.json';
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
      var res = R.fromExportFile(obj);
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

  // --- 確認日: 住民税の値ファイルの確認日。12 か月たったら注意 ---
  (function () {
    $('asof-date').textContent = dateEn(JV.CHECKED);
    var c = JV.CHECKED.split('-');
    var now = new Date();
    var months = (now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]);
    if (months >= JV.STALE_MONTHS) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode(' Some rules may have changed since then.'));
    }
  })();

  fillForm();
  lastSig = '';
  update();
  document.documentElement.classList.remove('js-loading');
})();
