// ===========================
// 保険料控除の計算（令和8年分）— 画面の制御
// 計算は ../../lib/hoken.js（純粋関数。控除額は nenmatsu.js・juminzei.js）。ここは入力・表示・保存だけ
// ===========================
(function () {
  'use strict';

  var H = window.Hoken;
  var TAX = window.TaxValues;

  // キーは必ず "seido-keisan_" で始める（全ツールが同じオリジンで localStorage を共有）
  var KEY = 'seido-keisan_hoken_draft';
  var store = {
    get: function (fallback) {
      try { var v = localStorage.getItem(KEY); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (value) { try { localStorage.setItem(KEY, JSON.stringify(value)); } catch (e) { /* 保存できなくても続ける */ } },
  };

  var $ = function (id) { return document.getElementById(id); };
  var page = document.querySelector('main');
  var state = H.normalizeInput(store.get({}));

  function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円'; }
  function yomi(n) {
    n = Number(n) || 0;
    if (n < 10000) return n ? n.toLocaleString('ja-JP') + '円' : '';
    var m = Math.floor(n / 10000), r = n % 10000;
    return m.toLocaleString('ja-JP') + '万' + (r ? r.toLocaleString('ja-JP') : '') + '円';
  }

  function fields() { return page.querySelectorAll('[data-k]'); }
  function fillForm() {
    fields().forEach(function (el) {
      var v = state[el.dataset.k];
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v === undefined || v === null ? '' : String(v);
    });
    updateYomi();
  }
  function updateYomi() {
    page.querySelectorAll('output.yomi').forEach(function (o) {
      var input = $(o.getAttribute('for'));
      o.textContent = input && input.value ? '（' + yomi(Number(input.value)) + '）' : '';
    });
  }

  // 申告書の欄の並びと、その欄に何を書くか（令和8年分 給与所得者の保険料控除申告書）
  var COLS = [
    ['A', '一般の生命保険料のうち新保険料等の合計'],
    ['①', 'A を計算式Ⅰに当てはめた金額'],
    ['②', 'A を計算式Ⅱに当てはめた金額'],
    ['B', '一般の生命保険料のうち旧保険料等の合計'],
    ['③', 'B を計算式Ⅲに当てはめた金額'],
    ['④', '①＋③（最高40,000円）'],
    ['⑤', '②＋③（最高60,000円）'],
    ['㋑', '一般の生命保険料の控除額'],
    ['C', '介護医療保険料の合計'],
    ['㋺', 'C を計算式Ⅰに当てはめた金額'],
    ['D', '個人年金保険料のうち新保険料等の合計'],
    ['⑥', 'D を計算式Ⅰに当てはめた金額'],
    ['E', '個人年金保険料のうち旧保険料等の合計'],
    ['⑦', 'E を計算式Ⅲに当てはめた金額'],
    ['⑧', '⑥＋⑦（最高40,000円）'],
    ['㋩', '⑦と⑧のいずれか大きい金額'],
    ['計', '生命保険料控除額 ㋑＋㋺＋㋩（最高120,000円）'],
    ['Ⓑ', '地震保険料の合計（最高50,000円）'],
    ['Ⓒ', '旧長期損害保険料の合計'],
    ['Ⓒ式', '1万円を超えるときは Ⓒ×1/2＋5,000円（最高15,000円）'],
    ['控除', '地震保険料控除額（最高50,000円）'],
  ];
  var INPUT_COLS = { A: 1, B: 1, C: 1, D: 1, E: 1, 'Ⓑ': 1, 'Ⓒ': 1 };

  var shown = false;
  function render() {
    var r = H.calc(state), s = r.shotoku, j = r.jumin;
    var cols = Object.assign({}, s.cols);
    if ('㋑' in cols || '㋺' in cols || '㋩' in cols) cols['計'] = s.seimei;
    if ('Ⓑ' in cols || 'Ⓒ' in cols) cols['控除'] = s.jishin;

    var cell = function (v) { return r.empty ? '—' : yen(v); };
    $('s-seimei').textContent = cell(s.seimei); $('j-seimei').textContent = cell(j.seimei);
    $('s-jishin').textContent = cell(s.jishin); $('j-jishin').textContent = cell(j.jishin);
    $('s-total').textContent = cell(s.total);   $('j-total').textContent = cell(j.total);
    $('r-big').textContent = r.empty ? '—' : yen(s.total);
    $('r-detail').textContent = r.empty ? '金額を入れると出ます。'
      : '生命保険料控除 ' + yen(s.seimei) + '・地震保険料控除 ' + yen(s.jishin) + (s.u23 ? '（計算式Ⅱ）' : '');

    var tb = $('cols').tBodies[0];
    tb.textContent = '';
    COLS.forEach(function (c) {
      if (!(c[0] in cols)) return;
      var tr = document.createElement('tr');
      if (INPUT_COLS[c[0]]) tr.className = 'is-input';
      if (c[0] === '㋑' || c[0] === '㋺' || c[0] === '㋩' || c[0] === '計' || c[0] === '控除') tr.classList.add('is-key');
      var th = document.createElement('th'); th.scope = 'row';
      var mark = document.createElement('span'); mark.className = 'mark'; mark.textContent = c[0] === 'Ⓒ式' || c[0] === '控除' ? '' : c[0];
      th.appendChild(mark); th.appendChild(document.createTextNode(c[1]));
      var td = document.createElement('td'); td.textContent = yen(cols[c[0]]);
      tr.appendChild(th); tr.appendChild(td); tb.appendChild(tr);
    });

    $('topbar-num').textContent = r.empty ? '—' : yen(s.total);
    if (!r.empty) shown = true;
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
    if (!el.dataset || !el.dataset.k) return;
    state[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
    state = H.normalizeInput(state);
    updateYomi();
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { store.set(state); }, 300);
  }
  page.addEventListener('input', onInput);
  page.addEventListener('change', onInput);

  // --- ファイルへの書き出し・読み込み（D31） ---
  function fileMsg(t) { $('file-msg').textContent = t; }
  $('export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(H.toExportFile(state), null, 2)], { type: 'application/json' });
    var a = document.createElement('a'), dt = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = H.TOOL_ID + '-backup-' + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + '.json';
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
      var res = H.fromExportFile(obj);
      if (!res.ok) { fileMsg(res.message); return; }
      if (!H.calc(state).empty && !window.confirm('今の入力内容を、ファイルの内容で置き換えます。よろしいですか？')) { fileMsg('読み込みをやめました。'); return; }
      state = res.data;
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
    var c = H.CHECKED.split('-');
    $('asof-date').textContent = c[0] + '年' + (+c[1]) + '月' + (+c[2]) + '日';
    var now = new Date();
    if ((now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]) >= TAX.STALE_MONTHS) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode('。確認日から時間がたっています。最新の制度は国税庁の案内をご確認ください'));
    }
  })();

  fillForm();
  render();
  document.documentElement.classList.remove('js-loading');
})();
