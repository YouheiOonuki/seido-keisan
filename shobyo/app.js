// ===========================
// 傷病手当金の計算 — 画面の制御
// 計算は ../lib/shobyo.js（純粋関数。1 日あたりの額は ikukyu.js の teateDaily）。ここは入力・表示・保存だけ
// ===========================
(function () {
  'use strict';

  var S = window.Shobyo;

  // キーは必ず "seido-keisan_" で始める（全ツールが同じオリジンで localStorage を共有）
  var KEY = 'seido-keisan_shobyo_draft';
  var store = {
    get: function (fallback) {
      try { var v = localStorage.getItem(KEY); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (value) { try { localStorage.setItem(KEY, JSON.stringify(value)); } catch (e) { /* 保存できなくても続ける */ } },
  };

  var $ = function (id) { return document.getElementById(id); };
  var page = document.querySelector('main');
  var state = S.normalizeInput(store.get({}));

  function today() {
    var d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円'; }
  function yomi(n) {
    n = Number(n) || 0;
    if (n < 10000) return n ? n.toLocaleString('ja-JP') + '円' : '';
    var m = Math.floor(n / 10000), r = n % 10000;
    return m.toLocaleString('ja-JP') + '万' + (r ? r.toLocaleString('ja-JP') : '') + '円';
  }
  function jpDate(s) { return (+s.slice(0, 4)) + '年' + (+s.slice(5, 7)) + '月' + (+s.slice(8, 10)) + '日'; }

  function fillForm() {
    page.querySelectorAll('[data-k]').forEach(function (el) {
      var v = state[el.dataset.k];
      el.value = v === undefined || v === null ? '' : String(v);
    });
    buildMonths();
    updateYomi();
  }
  function updateYomi() {
    page.querySelectorAll('output.yomi').forEach(function (o) {
      var input = $(o.getAttribute('for'));
      o.textContent = input && input.value ? '（' + yomi(Number(input.value)) + '）' : '';
    });
  }

  // 月ごとの欄（古い月から）。0 番が支給開始日の月
  var monthsKey = '';
  function buildMonths() {
    var r = S.calc(state, today());
    var key = r.months.map(function (m) { return m.label; }).join();
    if (key === monthsKey) return;
    monthsKey = key;
    var box = $('by-month');
    box.textContent = '';
    r.months.forEach(function (m, j) {
      var i = r.months.length - 1 - j;
      var f = document.createElement('div');
      var lab = document.createElement('label'); lab.htmlFor = 'm' + i; lab.textContent = m.label;
      var inp = document.createElement('input');
      inp.type = 'number'; inp.id = 'm' + i; inp.dataset.m = String(i); inp.inputMode = 'numeric'; inp.min = '0'; inp.step = '1';
      inp.placeholder = state.hyojun === null ? '' : String(state.hyojun);
      inp.value = state.byMonth[i] === null ? '' : String(state.byMonth[i]);
      f.appendChild(lab); f.appendChild(inp); box.appendChild(f);
    });
  }

  var shown = false;
  function row(tb, label, value, cls) {
    var tr = document.createElement('tr');
    if (cls) tr.className = cls;
    var th = document.createElement('th'); th.scope = 'row'; th.textContent = label;
    var td = document.createElement('td'); td.textContent = value;
    tr.appendChild(th); tr.appendChild(td); tb.appendChild(tr);
  }
  function render() {
    var r = S.calc(state, today());
    var tb = $('steps').tBodies[0];
    tb.textContent = '';
    row(tb, r.startAssumed ? '支給開始日（休み始めた日が空なので今日）' : '支給開始日（待期3日の次の日）', jpDate(r.start), 'is-sub');
    if (r.empty) {
      $('r-big').textContent = '—';
      $('r-detail').textContent = '標準報酬月額を入れると出ます。';
      $('topbar-num').textContent = '—';
      updateTopbar();
      return;
    }
    var hy = r.months.map(function (m) { return m.hyojun; });
    var same = hy.every(function (v) { return v === hy[0]; });
    row(tb, same ? '標準報酬月額' : '標準報酬月額の平均（' + r.months.length + 'か月）', yen(r.avg));
    row(tb, '÷30（10円未満四捨五入）', yen(r.per30));
    if (r.under12) row(tb, '全被保険者の平均 ' + yen(r.cap) + ' ÷30', yen(r.capPer30), 'is-sub');
    row(tb, '1日あたり（× 2/3）', yen(r.daily), 'is-key');
    if (r.input.kyuyo !== null) row(tb, '給与との差額（1日あたり）', yen(r.perDay));
    if (r.days !== null) {
      row(tb, '休んだ日数', r.days + '日', 'is-sub');
      row(tb, '待期', Math.min(S.TAIKI, r.days) + '日', 'is-sub');
      row(tb, '支給される日数', r.paidDays + '日');
      row(tb, '支給額', yen(r.total), 'is-key');
    }

    $('r-big').textContent = yen(r.daily);
    $('r-detail').textContent = r.total !== null
      ? r.paidDays + '日分で ' + yen(r.total) + (r.input.kyuyo !== null ? '（給与との差額）' : '')
      : '休んだ日を入れると、支給額も出ます。';
    $('topbar-num').textContent = yen(r.daily);
    shown = true;
    updateTopbar();
    window.yzUsed?.();
  }

  var resultVisible = true;
  function updateTopbar() { $('topbar').hidden = !shown || resultVisible; }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { resultVisible = es[0].isIntersecting; updateTopbar(); }, { threshold: 0 }).observe($('result-main'));
  }

  var saveTimer = null;
  function onInput(e) {
    var el = e.target;
    if (el.dataset && el.dataset.k) state[el.dataset.k] = el.value;
    else if (el.dataset && el.dataset.m) state.byMonth[+el.dataset.m] = el.value;
    else return;
    state = S.normalizeInput(state);
    updateYomi();
    buildMonths();
    if (el.id === 'hyojun') page.querySelectorAll('[data-m]').forEach(function (m) { m.placeholder = el.value; });
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { store.set(state); }, 300);
  }
  page.addEventListener('input', onInput);
  page.addEventListener('change', onInput);

  // --- ファイルへの書き出し・読み込み（D31） ---
  function fileMsg(t) { $('file-msg').textContent = t; }
  $('export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(S.toExportFile(state), null, 2)], { type: 'application/json' });
    var a = document.createElement('a'), dt = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = S.TOOL_ID + '-backup-' + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + '.json';
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    fileMsg('書き出しました（' + a.download + '）。');
  });
  $('import').addEventListener('click', function () { $('import-file').click(); });
  $('import-file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 1024 * 1024) { fileMsg('ファイルが大きすぎます（このツールで書き出したファイルを選んでください）。'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(String(reader.result)); } catch (err) { fileMsg('ファイルを読み込めませんでした（JSON の形式ではありません）。'); return; }
      var res = S.fromExportFile(obj);
      if (!res.ok) { fileMsg(res.message); return; }
      if (!S.calc(state, today()).empty && !window.confirm('今の入力内容を、ファイルの内容で置き換えます。よろしいですか？')) { fileMsg('読み込みをやめました。'); return; }
      state = res.data;
      monthsKey = '';
      fillForm();
      render();
      store.set(state);
      fileMsg('読み込みました（' + f.name + '）。');
    };
    reader.onerror = function () { fileMsg('ファイルを読み込めませんでした。'); };
    reader.readAsText(f);
  });

  // --- 制度の確認日（一定期間たったら注意） ---
  (function () {
    var c = S.CHECKED.split('-');
    $('asof-date').textContent = c[0] + '年' + (+c[1]) + '月' + (+c[2]) + '日';
    var now = new Date();
    if ((now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]) >= S.STALE_MONTHS) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode('。確認日から時間がたっています。最新の制度は協会けんぽの案内をご確認ください'));
    }
  })();

  fillForm();
  render();
  document.documentElement.classList.remove('js-loading');
})();
