// ===========================
// 医療費控除の計算（令和8年分）— 画面の制御
// 計算は ../lib/iryohi.js（純粋関数）、制度の値は ../lib/iryohi-values.js にだけ置く
// ===========================
(function () {
  'use strict';

  var I = window.Iryohi;
  var V = window.IryohiValues;

  // --- ブラウザへの保存（README「ツールを追加するとき」12） ---
  // キーは必ず "seido-keisan_" で始める。全ツールが同じオリジンで localStorage を共有しているため
  var KEY_PREFIX = 'seido-keisan_';
  var DRAFT = 'iryohi_draft';
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
  var form = $('form');
  var page = document.querySelector('main');
  var state = I.normalizeInput(store.get(DRAFT, {}));

  function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円'; }
  function yomi(n) {
    n = Number(n) || 0;
    if (n < 10000) return n ? n.toLocaleString('ja-JP') + '円' : '';
    var m = Math.floor(n / 10000), r = n % 10000;
    return m.toLocaleString('ja-JP') + '万' + (r ? r.toLocaleString('ja-JP') : '') + '円';
  }

  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, obj); }
  function setPath(obj, path, v) {
    var ks = path.split('.'), o = obj;
    for (var i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = v;
  }

  // 入力欄はフォームの外（結果の後ろの details）にもあるので、main 全体から探す
  function fields() { return page.querySelectorAll('[data-k]'); }
  function fillForm() {
    fields().forEach(function (el) {
      var v = getPath(state, el.dataset.k);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'radio') el.checked = String(v) === el.value;
      else el.value = v === undefined || v === null ? '' : String(v);
    });
    updateYomi();
    updateUi();
  }
  function readField(el) {
    if (el.type === 'radio' && !el.checked) return;
    setPath(state, el.dataset.k, el.type === 'checkbox' ? el.checked : el.value);
  }
  function updateYomi() {
    page.querySelectorAll('output.yomi').forEach(function (o) {
      var input = $(o.getAttribute('for'));
      o.textContent = input && input.value ? '（' + yomi(Number(input.value)) + '）' : '';
    });
  }
  function setState(id, text) { $(id).querySelector('.state').textContent = text; }
  function updateUi() {
    var d = I.normalizeInput(state);
    var kyuyo = d.mode === 'kyuyo';
    document.querySelectorAll('.mode-kyuyo').forEach(function (el) { el.hidden = !kyuyo; });
    document.querySelectorAll('.mode-shotoku').forEach(function (el) { el.hidden = kyuyo; });
    $('kojo-hint').textContent = kyuyo ? '源泉徴収票の同じ名前の欄。不明なら結果の下で見積もる。' : '医療費控除を入れる前の合計。不明なら結果の下で見積もる。';
    $('self-block').hidden = !d.self.use;
    $('rate-block').hidden = d.rateMode !== 'manual';
    // details の summary に今の状態を出す（SCREEN 1.1 の 4）
    setState('d-self', !d.self.use ? '入力なし' : d.self.amount === null ? '購入額が未入力' : '購入額 ' + yen(d.self.amount) + (d.self.torikumi ? '' : '（取組なし）'));
    setState('d-kojo', d.shakai === null ? '入力なし' : '社会保険料 ' + yen(d.shakai) + (d.kojo !== null ? '（所得控除の合計を優先）' : 'で見積もる'));
    setState('d-rate', d.rateMode === 'manual' ? d.rate + '%（自分で選んだ）' : '課税所得から自動');
    setState('d-jumin', d.jumin ? '含める' : '含めない');
  }

  // --- 結果の表示 ---
  var shown = false;
  function render() {
    var r = I.calc(state);
    var d = r.input;
    // 必須が空の欄を薄く強調（エラー文は出さない）
    document.querySelectorAll('[data-need]').forEach(function (el) {
      el.classList.toggle('is-missing', r.missing.indexOf(el.dataset.need) >= 0);
    });
    var hasKojo = r.iryohi !== undefined;
    $('s-iryohi').textContent = hasKojo ? yen(r.iryohi.kojo) : '—';
    $('s-self-row').hidden = !(hasKojo && r.self);
    if (hasKojo && r.self) $('s-self').textContent = yen(r.self.kojo) + (r.selfOk ? '' : '（使えない）');
    $('s-iryohi').parentNode.classList.toggle('is-best', hasKojo && r.best === 'iryohi' && !!r.self);
    $('s-self-row').classList.toggle('is-best', hasKojo && r.best === 'self');
    $('s-tax').textContent = r.ready ? yen(r.tax.refund) + (r.tax.manual ? '' : '（税率 ' + r.tax.rate + '%）') : '—';
    $('s-jumin-row').hidden = !d.jumin;
    $('s-jumin').textContent = hasKojo && r.jumin !== null ? yen(r.jumin) : '—';

    var big = $('r-big'), detail = $('r-detail'), note = [];
    $('r-lead').textContent = d.jumin ? '所得税（確定申告で戻る）＋ 住民税（令和9年度に減る）' : '所得税（確定申告で戻る）';
    if (!r.ready) {
      big.textContent = '—';
      detail.textContent = '必須の欄を入れると出ます。';
    } else {
      big.textContent = yen(r.total);
      detail.textContent = r.best === 'none' ? '医療費控除はありません（引く額を超えていません）。'
        : (r.best === 'self' ? 'セルフメディケーション税制 ' : '医療費控除 ') + yen(r.kojo) + ' で計算。';
      if (r.best === 'none' && hasKojo) note.push('医療費（補てん後）が ' + yen(r.iryohi.f) + ' を超えると控除が出ます。');
      if (r.self && r.selfOk && r.self.kojo > 0 && r.iryohi.kojo > 0) {
        var diff = Math.abs(r.self.kojo - r.iryohi.kojo);
        note.push(r.best === 'self' ? 'セルフメディケーション税制のほうが控除が ' + yen(diff) + ' 多くなります（併用はできません）。'
          : diff === 0 ? 'どちらを選んでも控除額は同じです（併用はできません）。' : '通常の医療費控除のほうが控除が ' + yen(diff) + ' 多くなります（併用はできません）。');
      }
      if (r.self && !r.selfOk) note.push('セルフメディケーション税制は、健康診断・予防接種などを受けた人だけが使えます。');
      if (r.noTax) note.push('課税所得がないので所得税は戻りません。');
      if (r.kojoEstimated) note.push('所得控除の合計は見積もりです（社会保険料＋基礎控除）。');
    }
    $('r-note').textContent = note.join(' ');
    $('result-main').classList.toggle('is-refund', r.ready && r.total > 0);

    var tb = $('steps').tBodies[0];
    tb.textContent = '';
    r.steps.forEach(function (s) {
      var tr = document.createElement('tr');
      if (s.cls) tr.className = s.cls;
      var th = document.createElement('th'); th.scope = 'row'; th.textContent = s.label;
      var rule = document.createElement('span'); rule.className = 'rule'; rule.textContent = s.rule; th.appendChild(rule);
      var td = document.createElement('td'); td.textContent = yen(s.amount);
      tr.appendChild(th); tr.appendChild(td); tb.appendChild(tr);
    });
    $('topbar-num').textContent = r.ready ? yen(r.total) : '—';
    if (r.ready) shown = true;
    updateTopbar();
  }

  // --- 固定バー: 結果が一度出たあと、結果が画面の外にあるときだけ（SCREEN 3 章） ---
  var resultVisible = true;
  function updateTopbar() { $('topbar').hidden = !shown || resultVisible; }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      resultVisible = es[0].isIntersecting;
      updateTopbar();
    }, { threshold: 0 }).observe($('result-main'));
  }

  // 中身が同じなら描き直さない。保存は 300ms まとめる
  var saveTimer = null, lastSig = '';
  function update() {
    var sig = JSON.stringify(I.normalizeInput(state));
    if (sig === lastSig) return;
    lastSig = sig;
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { store.set(DRAFT, I.normalizeInput(state)); }, 300);
  }
  function renderNow() { lastSig = JSON.stringify(I.normalizeInput(state)); render(); }

  page.addEventListener('input', function (e) {
    if (!e.target.dataset || !e.target.dataset.k) return;
    readField(e.target); updateYomi(); updateUi(); update();
  });
  page.addEventListener('change', function (e) {
    if (!e.target.dataset || !e.target.dataset.k) return;
    readField(e.target); updateUi(); update();
  });

  // --- ファイルへの書き出し・読み込み（D31） ---
  function hasInput() { return JSON.stringify(I.normalizeInput(state)) !== JSON.stringify(I.normalizeInput({})); }
  function fileMsg(t) { $('file-msg').textContent = t; }

  $('export').addEventListener('click', function () {
    var data = I.toExportFile(state);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var dt = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = I.TOOL_ID + '-backup-' + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + '.json';
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    fileMsg('書き出しました（' + a.download + '）。医療費や収入が入っているので、取り扱いにご注意ください。');
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
      var res = I.fromExportFile(obj);
      if (!res.ok) { fileMsg(res.message); return; }
      if (hasInput() && !window.confirm('今の入力内容を、ファイルの内容で置き換えます。よろしいですか？')) { fileMsg('読み込みをやめました。'); return; }
      state = res.data;
      fillForm();
      update();
      fileMsg('読み込みました（' + f.name + '）。');
    };
    reader.onerror = function () { fileMsg('ファイルを読み込めませんでした。'); };
    reader.readAsText(f);
  });
  $('clear').addEventListener('click', function () {
    if (!hasInput()) return;
    if (!window.confirm('入力内容をすべて消します。よろしいですか？（書き出したファイルは消えません）')) return;
    state = I.normalizeInput({});
    store.remove(DRAFT);
    fillForm();
    renderNow();
    fileMsg('入力を消しました。');
  });

  // --- 制度の確認日（一定期間たったら注意） ---
  (function () {
    var c = V.CHECKED.split('-');
    $('asof-date').textContent = c[0] + '年' + (+c[1]) + '月' + (+c[2]) + '日';
    var now = new Date();
    var months = (now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]);
    if (months >= V.STALE_MONTHS) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode('。確認日から時間がたっています。最新の制度は国税庁の案内をご確認ください'));
    }
  })();

  fillForm();
  renderNow();
  document.documentElement.classList.remove('js-loading');
})();
