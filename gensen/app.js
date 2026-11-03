// ===========================
// 源泉徴収票の見方と手取り — 画面の制御
// 計算は ../lib/gensen.js（純粋関数。控除・上限の式は nenmatsu.js・juminzei.js）。ここは入力・表示・保存だけ
// ===========================
(function () {
  'use strict';

  var G = window.Gensen;
  var TAX = window.TaxValues;

  // キーは必ず "seido-keisan_" で始める（全ツールが同じオリジンで localStorage を共有）
  var KEY = 'seido-keisan_gensen_draft';
  var store = {
    get: function (fallback) {
      try { var v = localStorage.getItem(KEY); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (value) { try { localStorage.setItem(KEY, JSON.stringify(value)); } catch (e) { /* 保存できなくても続ける */ } },
  };

  var $ = function (id) { return document.getElementById(id); };
  var page = document.querySelector('main');
  var state = G.normalizeInput(store.get({}));
  var COUNT_KEYS = { tokutei: 1, rojin: 1, rojinDokyo: 1, other: 1, u16: 1, tokushin: 1, shogaiTokubetsu: 1, shogaiDokyo: 1, shogaiIppan: 1 };

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
      else if (COUNT_KEYS[el.dataset.k]) el.value = v ? String(v) : '';
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

  var shown = false;
  function row(tb, label, value, cls) {
    var tr = document.createElement('tr');
    if (cls) tr.className = cls;
    var th = document.createElement('th'); th.scope = 'row'; th.textContent = label;
    var td = document.createElement('td'); td.textContent = value;
    tr.appendChild(th); tr.appendChild(td); tb.appendChild(tr);
  }
  function render() {
    var r = G.calc(state), d = r.input;
    var tb = $('steps').tBodies[0];
    tb.textContent = '';
    var fu = $('furusato');
    $('check-wrap').hidden = true;
    if (r.empty) {
      $('r-big').textContent = '—';
      $('r-detail').textContent = '支払金額を入れると出ます。';
      fu.textContent = '—'; fu.classList.add('is-note');
      $('topbar-num').textContent = '—';
      updateTopbar();
      return;
    }
    row(tb, '年収（額面）＝ ① 支払金額', yen(r.nenshu));
    row(tb, d.mitei ? '④ 源泉徴収税額（確定申告で精算）' : '④ 所得税（1年。復興特別所得税を含む）', d.gensen === null ? '—' : yen(d.gensen));
    row(tb, '⑤ 社会保険料等', d.shakai === null ? '—' : yen(d.shakai));
    row(tb, '住民税（月額 × 12）', r.juminYear === null ? '入れていない' : yen(r.juminYear), r.juminYear === null ? 'is-sub' : '');
    row(tb, '手取りの目安', yen(r.tedori), 'is-key');
    if (r.taxable !== null) {
      row(tb, '課税される所得（② − ③）', yen(r.taxable), 'is-sub');
      row(tb, '所得税の税率', r.rate + '%', 'is-sub');
    }

    $('r-big').textContent = yen(r.tedori);
    $('r-detail').textContent = '年収 ' + yen(r.nenshu) + ' のうち ' + Math.round(r.tedori / r.nenshu * 1000) / 10 + '%' + (r.juminYear === null ? '（住民税を引く前）' : '');

    if (r.furusato) {
      fu.textContent = yen(r.furusato.limit) + ' まで（' + r.furusato.nendo + 'の住民税で計算した目安）';
      fu.classList.remove('is-note');
    } else {
      fu.textContent = r.check.message || '—';
      fu.classList.add('is-note');
    }
    if (r.check.rows.length) {
      var cb = $('check').tBodies[0];
      cb.textContent = '';
      r.check.rows.forEach(function (x) {
        var tr = document.createElement('tr');
        var th = document.createElement('th'); th.scope = 'row'; th.textContent = x.label;
        var a = document.createElement('td'); a.textContent = yen(x.hyo);
        var b = document.createElement('td'); b.textContent = yen(x.calc) + (x.hyo === x.calc ? '（一致）' : '');
        tr.appendChild(th); tr.appendChild(a); tr.appendChild(b); cb.appendChild(tr);
      });
      $('check-wrap').hidden = false;
    }

    $('topbar-num').textContent = yen(r.tedori);
    shown = true;
    updateTopbar();
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
    state = G.normalizeInput(state);
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
    var blob = new Blob([JSON.stringify(G.toExportFile(state), null, 2)], { type: 'application/json' });
    var a = document.createElement('a'), dt = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = G.TOOL_ID + '-backup-' + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + '.json';
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
      var res = G.fromExportFile(obj);
      if (!res.ok) { fileMsg(res.message); return; }
      if (!G.calc(state).empty && !window.confirm('今の入力内容を、ファイルの内容で置き換えます。よろしいですか？')) { fileMsg('読み込みをやめました。'); return; }
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
    var c = G.CHECKED.split('-');
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
