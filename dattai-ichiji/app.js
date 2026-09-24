// ===========================
// 脱退一時金の計算（Japan pension refund calculator）— 画面の制御。日本語ページと英語ページで共用
// 言語は <html lang> で選び、変わる文言は ../lib/pension-refund-text.js（TEXT）から取る
// 計算は ../lib/pension-refund.js（純粋関数）、制度の値は ../lib/dattai-values.js にだけ置く
// ===========================
(function () {
  'use strict';

  var P = window.PensionRefund;
  var V = window.DattaiValues;
  var LANG = document.documentElement.lang === 'ja' ? 'ja' : 'en';
  var T = window.PensionRefundText[LANG];
  var S = window.ScreenParts;

  // --- ブラウザへの保存（README「ツールを追加するとき」12）。日英で同じキー（同じ入力） ---
  var KEY_PREFIX = 'seido-keisan_';
  var DRAFT = 'dattai_draft';
  var store = {
    get: function (name, fallback) {
      try {
        var v = localStorage.getItem(KEY_PREFIX + name);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }   // 保存できない環境（プライベートモードなど）でも動くように
    },
    set: function (name, value) {
      try { localStorage.setItem(KEY_PREFIX + name, JSON.stringify(value)); } catch (e) { /* 保存できなくても続ける */ }
    },
    remove: function (name) {
      try { localStorage.removeItem(KEY_PREFIX + name); } catch (e) { /* 続ける */ }
    },
  };

  var $ = function (id) { return document.getElementById(id); };
  var page = document.querySelector('main');
  // 保存するのは入力そのもの（途中の文字も残す）。計算の前に normalizeInput を通す
  var state = store.get(DRAFT, {});
  if (!state || typeof state !== 'object') state = {};

  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, obj); }
  function setPath(obj, path, v) {
    var ks = path.split('.'), o = obj;
    for (var i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = v;
  }

  // 出身国の選択肢（値の表から。名前は言語ごと）
  (function () {
    var sel = $('country');
    V.kyotei.slice().sort(function (a, b) { return (LANG === 'ja' ? a[2] : a[1]).localeCompare(LANG === 'ja' ? b[2] : b[1], LANG); })
      .forEach(function (k) {
        var o = document.createElement('option');
        o.value = k[0]; o.textContent = LANG === 'ja' ? k[2] : k[1];
        sel.appendChild(o);
      });
  })();

  function fields() { return page.querySelectorAll('[data-k]'); }
  function fillForm() {
    var d = P.normalizeInput(state);
    fields().forEach(function (el) {
      var v = getPath(state, el.dataset.k);
      if (el.type === 'checkbox') el.checked = el.dataset.k === 'refund' ? d.refund : !!v;
      else el.value = v === undefined || v === null ? '' : String(v);
    });
    updateUi();
  }
  function readField(el) { setPath(state, el.dataset.k, el.type === 'checkbox' ? el.checked : el.value); }

  function setState(id, text) { S.setText(id, text); }
  function updateUi() {
    var d = P.normalizeInput(state);
    var sel = $('country');
    setState('st-bonus', T.sumBonus(d));
    setState('st-exempt', T.sumExempt(d));
    setState('st-check', T.sumCheck(d));
    setState('st-country', T.sumCountry(d, d.country ? S.optText(sel) : ''));
    setState('st-tax', T.sumTax(d));
    $('other-row').hidden = !d.refund;
  }

  // --- 結果の表示 ---
  var setBar = S.fixbar();
  function li(list, text, cls) { var e = document.createElement('li'); e.textContent = text; if (cls) e.className = cls; list.appendChild(e); }
  function row(tb, label, amount, cls) {
    var tr = document.createElement('tr');
    if (cls) tr.className = cls;
    var th = document.createElement('th'); th.scope = 'row'; th.textContent = label;
    var td = document.createElement('td'); td.textContent = amount;
    tr.appendChild(th); tr.appendChild(td); tb.appendChild(tr);
  }

  function render() {
    var r = P.calc(state);
    var d = r.input;
    // 必須が空の欄を薄く強調（エラー文は出さない）
    page.querySelectorAll('[data-need]').forEach(function (el) {
      var need = el.dataset.need.split(' ');
      el.classList.toggle('is-missing', need.some(function (n) { return r.missing.indexOf(n) >= 0; }));
    });

    var ep = r.ep, np = r.np;
    var epOk = ep.status === 'ok' && !r.blocked.length, npOk = np.status === 'ok' && !r.blocked.length;
    var showNums = r.ready && r.payable;
    S.setText('r-big', showNums ? T.yen(r.total) : '—');
    S.setText('r-detail', !r.ready ? (r.missing.indexOf('any') >= 0 ? T.need : T.needMore)
      : r.payable ? T.detail(epOk ? ep.net : null, npOk ? np.amount : null) : T.none);

    // 還付の目安
    var refund = '', refundNote = '';
    if (showNums && epOk) {
      if (!d.refund) refund = T.refundOff;
      else if (d.otherRetirement) refund = T.refundOther;
      else if (r.tax) {
        refund = r.tax.range ? T.refundRange(r.tax.refundMin, r.tax.refundMax) : T.refundOne(r.tax.refundMin);
        refundNote = r.tax.cases.length > 1 ? T.refundNoteRange(r.tax.cases[0].years, r.tax.cases[1].years) : T.refundNote(r.tax.cases[0].years);
      }
    }
    S.setText('r-refund', refund);
    S.setText('r-refund-note', refundNote);

    // 判定と注意
    var msgs = $('r-msgs');
    msgs.textContent = '';
    if (r.ready) {
      if (r.blocked.indexOf('japanese') >= 0) li(msgs, T.blockJapanese, 'warn');
      if (r.blocked.indexOf('disability') >= 0) li(msgs, T.blockDisability, 'warn');
      if (r.blocked.indexOf('qualify') >= 0) li(msgs, T.blockQualify(r.qualifyMonths), 'warn');
      if (ep.status === 'short') li(msgs, T.epShort(ep.months), 'warn');
      if (ep.status === 'outOfScope') li(msgs, T.epScope, 'warn');
      if (np.status === 'short') li(msgs, T.npShort(np.months), 'warn');
      if (np.status === 'outOfScope') li(msgs, T.npScope, 'warn');
      if (np.status === 'notPublished') li(msgs, T.npNotPublished(np.fy), 'warn');
      if (epOk && ep.overCap) li(msgs, T.overCap(T.epName, ep.cap, ep.months), 'warn');
      if (npOk && np.overCap) li(msgs, T.overCap(T.npName, np.cap, np.months), 'warn');
      if (epOk && ep.newGradeTable) li(msgs, T.newGrades);
    }
    if (r.kyotei) li(msgs, r.kyotei.totalize ? T.kyoteiYes(r.kyotei[LANG]) : T.kyoteiNo(r.kyotei[LANG]), r.kyotei.totalize ? 'warn' : '');

    // まとめの表
    S.setText('s-ep', epOk && showNums ? T.yen(ep.amount) : '—');
    S.setText('s-tax', epOk && showNums ? '− ' + T.yen(ep.withheld) : '—');
    S.setText('s-np', npOk && showNums ? T.yen(np.amount) : '—');
    S.setText('s-total', showNums ? T.yen(r.total) : '—');

    // 請求の期限
    S.setText('r-deadline', r.deadline ? T.deadline(r.deadline.from, r.deadline.to) : '');

    // 内訳と途中の計算
    var tb = $('steps').tBodies[0];
    tb.textContent = '';
    var st = T.steps;
    if (showNums && epOk) {
      row(tb, st.epMonths(ep.months, ep.last), ep.months + st.unitMonths);
      if (ep.avgSource === 'salary') {
        row(tb, st.grade(d.ep.salary), T.yen(ep.grade));
        if (ep.bonusCount) row(tb, st.bonus(ep.bonusStd, ep.bonusCount), T.yen(ep.bonusTotal));
      }
      row(tb, st.avg(ep.avgSource), T.yen(ep.avg));
      row(tb, st.rate(ep.n, ep.cap, ep.rate), String(ep.rate));
      row(tb, st.epAmount, T.yen(ep.amount), 'total');
      row(tb, st.withheld, '− ' + T.yen(ep.withheld));
      row(tb, st.epNet, T.yen(ep.net), 'total');
      if (r.tax) {
        r.tax.cases.forEach(function (c) { row(tb, st.taxCase(c.years, c.kojo), T.yen(c.total)); });
        row(tb, st.refund, r.tax.range ? T.yen(r.tax.refundMin) + '–' + T.yen(r.tax.refundMax) : T.yen(r.tax.refundMin), 'total');
      }
    }
    if (showNums && npOk) {
      row(tb, st.npMonths(np.last), String(np.months) + st.unitMonths);
      row(tb, st.npAmount(np.fy, np.n, np.cap), T.yen(np.amount), 'total');
    }
    $('steps-box').hidden = !tb.rows.length;

    setBar(showNums ? T.bar(r.total) : '');
  }

  // 中身が同じなら描き直さない。保存は 300ms まとめる
  var saveTimer = null, lastSig = '';
  function update() {
    var sig = JSON.stringify(P.normalizeInput(state)) + JSON.stringify(state);
    if (sig === lastSig) return;
    lastSig = sig;
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { store.set(DRAFT, state); }, 300);
  }
  function renderNow() { lastSig = ''; update(); }

  page.addEventListener('input', function (e) {
    if (!e.target.dataset || !e.target.dataset.k) return;
    readField(e.target); updateUi(); update();
  });
  page.addEventListener('change', function (e) {
    if (!e.target.dataset || !e.target.dataset.k) return;
    readField(e.target); updateUi(); update();
  });

  // --- ファイルへの書き出し・読み込み（D31） ---
  function hasInput() { return JSON.stringify(P.normalizeInput(state)) !== JSON.stringify(P.normalizeInput({})); }
  function fileMsg(t) { $('file-msg').textContent = t; }

  $('export').addEventListener('click', function () {
    var data = P.toExportFile(state);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var dt = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = P.TOOL_ID + '-backup-' + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + '.json';
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    fileMsg(T.exported(a.download));
  });
  $('import').addEventListener('click', function () { $('import-file').click(); });
  $('import-file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 1024 * 1024) { fileMsg(T.tooBig); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(String(reader.result)); } catch (err) { fileMsg(T.notJson); return; }
      var res = P.fromExportFile(obj);
      if (!res.ok) { fileMsg(T[res.code]); return; }
      if (hasInput() && !window.confirm(T.confirmReplace)) { fileMsg(T.cancelled); return; }
      state = res.data;
      fillForm();
      update();
      fileMsg(T.loaded(f.name));
    };
    reader.onerror = function () { fileMsg(T.readError); };
    reader.readAsText(f);
  });
  $('clear').addEventListener('click', function () {
    if (!hasInput()) return;
    if (!window.confirm(T.confirmClear)) return;
    state = {};
    store.remove(DRAFT);
    fillForm();
    renderNow();
    fileMsg(T.cleared);
  });

  // --- 制度の確認日: 12 か月たつか、国民年金の表に無い年度（新年度の 4 月）に入ったら注意 ---
  (function () {
    var c = V.CHECKED.split('-');
    $('asof-date').textContent = T.asof(V.CHECKED);
    var now = new Date();
    var months = (now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]);
    var fyNow = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    if (months >= V.STALE_MONTHS || !V.kokunen[fyNow]) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode(T.stale));
    }
  })();

  fillForm();
  renderNow();
  document.documentElement.classList.remove('js-loading');
})();
