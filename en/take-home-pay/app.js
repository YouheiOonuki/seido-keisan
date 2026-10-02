// ===========================
// 手取りの計算（Japan take-home pay calculator、英語ページ）— 画面の制御
// 計算は ../../lib/take-home.js（純粋関数。所得税・住民税・保険料は既存のエンジンを呼ぶ）、
// 値は lib/*-values.js にだけ置く。ここには英語の文言と DOM の操作だけ
// ===========================
(function () {
  'use strict';

  var T = window.TakeHome;
  var TV = window.TakeHomeValues;
  var IV = window.IkukyuValues;
  var JV = window.JuminzeiValues;
  var TAX = window.TaxValues;
  var S = window.ScreenParts;

  // --- ブラウザへの保存（README「ツールを追加するとき」12） ---
  var KEY_PREFIX = 'seido-keisan_';
  var DRAFT = 'takehome_draft';
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
  function minus(n) { return n ? '− ' + yen(n) : yen(0); }
  function dateEn(iso) { var p = iso.split('-'); return MONTHS[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0]; }
  // 令和9年度 → 2027 年 6 月〜2028 年 5 月（住民税の年度は 6 月から翌年 5 月に納める）
  var NENDO = TV.juminNendo;
  var PAY_FROM = 'June ' + NENDO, PAY_TO = 'May ' + (NENDO + 1);
  var INCOME_YEAR = JV.nendo[NENDO].incomeYear;

  // 都道府県の英語名（lib/ikukyu-values.js の協会けんぽの表のキーの順）
  var PREF_EN = {
    hokkaido: 'Hokkaido', aomori: 'Aomori', iwate: 'Iwate', miyagi: 'Miyagi', akita: 'Akita', yamagata: 'Yamagata', fukushima: 'Fukushima',
    ibaraki: 'Ibaraki', tochigi: 'Tochigi', gunma: 'Gunma', saitama: 'Saitama', chiba: 'Chiba', tokyo: 'Tokyo', kanagawa: 'Kanagawa',
    niigata: 'Niigata', toyama: 'Toyama', ishikawa: 'Ishikawa', fukui: 'Fukui', yamanashi: 'Yamanashi', nagano: 'Nagano', gifu: 'Gifu',
    shizuoka: 'Shizuoka', aichi: 'Aichi', mie: 'Mie', shiga: 'Shiga', kyoto: 'Kyoto', osaka: 'Osaka', hyogo: 'Hyogo', nara: 'Nara',
    wakayama: 'Wakayama', tottori: 'Tottori', shimane: 'Shimane', okayama: 'Okayama', hiroshima: 'Hiroshima', yamaguchi: 'Yamaguchi',
    tokushima: 'Tokushima', kagawa: 'Kagawa', ehime: 'Ehime', kochi: 'Kochi', fukuoka: 'Fukuoka', saga: 'Saga', nagasaki: 'Nagasaki',
    kumamoto: 'Kumamoto', oita: 'Oita', miyazaki: 'Miyazaki', kagoshima: 'Kagoshima', okinawa: 'Okinawa',
  };
  (function () {
    var sel = $('pref');
    T.PREFS.forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = (PREF_EN[k] || k) + ' (' + IV.hoken.kyokai[k][1].toFixed(2) + '%)';
      sel.appendChild(o);
    });
  })();

  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, obj); }
  function setPath(obj, path, v) {
    var ks = path.split('.'), o = obj;
    for (var i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = v;
  }

  function fields() { return page.querySelectorAll('[data-k]'); }
  function fillForm() {
    var d = T.normalizeInput(state);
    fields().forEach(function (el) {
      var k = el.dataset.k, v = getPath(state, k);
      if (el.type === 'radio') el.checked = getPath(d, k) === el.value;
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
    var d = T.normalizeInput(state);
    var year = d.period === 'year';
    S.setText('amount-label', year ? 'Yearly salary before tax' : 'Monthly salary before tax');
    S.setText('amount-hint', year ? 'Include bonuses. Enter them below the result too.' : 'Base pay plus allowances. Add bonuses below the result.');
    $('amount').placeholder = year ? 'e.g. 5000000' : 'e.g. 300000';
    S.setText('bonus-hint', year ? 'Part of the yearly salary above.' : 'The total of all bonuses in the year.');
    S.setText('st-bonus', d.bonus ? yen(d.bonus) + ' in ' + d.bonusCount + (d.bonusCount === 1 ? ' payment' : ' payments') : 'none');
    S.setText('st-health', (d.over40 ? '40 to 64' : 'under 40') + ', ' + PREF_EN[d.pref]);
    var fam = [];
    if (d.spouse.has) fam.push('spouse');
    var kids = d.kids.u16 + d.kids.a16 + d.kids.a19;
    if (kids) fam.push(kids + (kids === 1 ? ' child' : ' children'));
    S.setText('st-family', fam.length ? fam.join(', ') : 'none');
    S.setText('st-res', d.juminNow === 'same' ? 'included' : 'not yet (starts ' + PAY_FROM + ')');
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
  var CELLS = ['gross', 'health', 'shien', 'pension', 'koyo', 'tax', 'res', 'net'];

  function render() {
    var r = T.calc(state);
    var d = r.input;
    page.querySelector('[data-need="amount"]').classList.toggle('is-missing', !d.amount);
    S.setText('r-warn', r.error === 'over' ? 'Yearly pay over ¥20 million is outside this calculator: you file a tax return, and the year-end adjustment does not apply.' : '');
    var tb = $('steps').tBodies[0];
    tb.textContent = '';
    if (!r.ready) {
      S.setText('r-big', '—');
      S.setText('r-detail', r.error ? '' : 'Enter your salary to see the result.');
      CELLS.forEach(function (c) { S.setText('m-' + c, '—'); S.setText('y-' + c, '—'); });
      S.setText('r-bonus', ''); S.setText('r-lag', '');
      $('steps-box').hidden = true;
      setBar('');
      return;
    }
    var m = r.month, y = r.year;
    S.setText('r-big', yen(m.net));
    S.setText('r-detail', yen(y.net) + ' a year after all deductions (' + Math.round(r.rate * 1000) / 10 + '% deducted).');
    S.setText('l-health', d.over40 ? 'Health and care insurance' : 'Health insurance');
    S.setText('m-gross', yen(m.gross)); S.setText('y-gross', yen(y.gross));
    S.setText('m-health', minus(m.health)); S.setText('y-health', minus(y.health));
    S.setText('m-shien', minus(m.shien)); S.setText('y-shien', minus(y.shien));
    S.setText('m-pension', minus(m.pension)); S.setText('y-pension', minus(y.pension));
    S.setText('m-koyo', minus(m.koyo)); S.setText('y-koyo', minus(y.koyo));
    S.setText('m-tax', minus(m.incomeTax)); S.setText('y-tax', minus(y.incomeTax));
    S.setText('m-res', minus(m.resident)); S.setText('y-res', minus(y.resident));
    S.setText('m-net', yen(m.net)); S.setText('y-net', yen(y.net));

    var b = r.bonuses;
    S.setText('r-bonus', b.length ? 'Each bonus: ' + yen(b[0].gross) + ' before, about ' + yen(b[0].net) + ' after insurance and income tax.' : '');

    var res = r.resident;
    S.setText('r-lag', res.total === 0
      ? 'Residence tax on ' + INCOME_YEAR + ' pay: none (below the tax-free limit).'
      : res.paying
        ? 'Residence tax is charged on last year’s income. Shown here: the tax on ' + INCOME_YEAR + ' pay, ' + yen(res.month) + ' a month from ' + PAY_FROM + ' to ' + PAY_TO + '.'
        : 'No residence tax yet. On ' + INCOME_YEAR + ' pay, about ' + yen(res.month) + ' a month starts in ' + PAY_FROM + ' (' + yen(res.total) + ' a year).');

    // 途中の計算
    var t = r.tax;
    row(tb, 'Employment income (salary after the employment income deduction)', yen(t.kyuyo));
    row(tb, 'Deductions: social insurance, basic' + (t.haigusha ? ', spouse' : '') + (t.fuyo + t.tokutei ? ', dependents' : ''), '− ' + yen(t.kojo));
    row(tb, 'Taxable income (rounded down to ¥1,000)', yen(t.taxable));
    row(tb, 'Income tax' + (t.pct ? ' (top rate ' + t.pct + '%)' : ''), yen(t.sanshutsu));
    row(tb, 'Income tax × 102.1% (reconstruction surtax, rounded down to ¥100)', yen(t.nenzei), 'total');
    row(tb, 'Residence tax: income levy (about 10%)', yen(res.wari));
    row(tb, 'Residence tax: per capita levy and forest tax', yen(res.kinto));
    row(tb, 'Residence tax for ' + PAY_FROM + ' to ' + PAY_TO, yen(res.total), 'total');
    row(tb, 'Pension is based on ¥' + m.hyojunPension.toLocaleString('en-US') + ', health insurance on ¥' + m.hyojun.toLocaleString('en-US') + ' (standard monthly remuneration)', '');
    $('steps-box').hidden = false;

    setBar('Take-home ' + yen(m.net) + ' a month');
  }

  var saveTimer = null, lastSig = '';
  function update() {
    var sig = JSON.stringify(T.normalizeInput(state)) + JSON.stringify(state);
    if (sig === lastSig) return;
    lastSig = sig;
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { store.set(DRAFT, state); }, 300);
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
  function hasInput() { return JSON.stringify(T.normalizeInput(state)) !== JSON.stringify(T.normalizeInput({})); }
  function fileMsg(t) { $('file-msg').textContent = t; }

  $('export').addEventListener('click', function () {
    var data = T.toExportFile(state);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var dt = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = T.TOOL_ID + '-backup-' + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + '.json';
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
      var res = T.fromExportFile(obj);
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

  // --- 確認日: いちばん古い値ファイルの確認日を出し、12 か月たつか雇用保険料率の年度が終わったら注意 ---
  (function () {
    var dates = [TV.CHECKED, TAX.CHECKED, JV.CHECKED, IV.CHECKED, window.ShienkinValues.CHECKED].sort();
    var oldest = dates[0];
    $('asof-date').textContent = dateEn(TV.CHECKED);
    var c = oldest.split('-');
    var now = new Date();
    var months = (now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]);
    var ym = now.getFullYear() + '-' + (now.getMonth() < 9 ? '0' : '') + (now.getMonth() + 1);
    if (months >= TV.STALE_MONTHS || ym > TV.koyo.validTo || now.getFullYear() > TAX.CURRENT) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode(' Some rates may have changed since then.'));
    }
  })();

  fillForm();
  lastSig = '';
  update();
  document.documentElement.classList.remove('js-loading');
})();
