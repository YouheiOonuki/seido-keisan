// ===========================
// 2割特例の終了後の消費税（3割特例・簡易課税・本則課税の比較）— 画面の制御
// 計算は ../lib/invoice.js（純粋関数）、制度の値は ../lib/invoice-values.js にだけ置く
// ===========================
(function () {
  'use strict';

  var I = window.Invoice;
  var V = window.InvoiceValues;
  var S = window.ScreenParts;

  // --- ブラウザへの保存（README「ツールを追加するとき」12） ---
  // キーは必ず "seido-keisan_" で始める。全ツールが同じオリジンで localStorage を共有しているため
  var KEY_PREFIX = 'seido-keisan_';
  var DRAFT = 'invoice_draft';
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
  var state = I.normalizeInput(store.get(DRAFT, {}));
  var setBar = S.fixbar();

  function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円'; }
  function yomi(n) {
    n = Number(n) || 0;
    if (n < 10000) return n ? n.toLocaleString('ja-JP') + '円' : '';
    var m = Math.floor(n / 10000), r = n % 10000;
    return m.toLocaleString('ja-JP') + '万' + (r ? r.toLocaleString('ja-JP') : '') + '円';
  }
  function jpDate(iso) { var p = iso.split('-'); return (+p[0]) + '年' + (+p[1]) + '月' + (+p[2]) + '日'; }
  // 納付税額の表示（マイナスは還付）
  function amt(total) { return total < 0 ? '還付 ' + yen(-total) : yen(total); }

  function fields() { return page.querySelectorAll('[data-k]'); }
  function fillForm() {
    fields().forEach(function (el) {
      var v = state[el.dataset.k];
      el.value = v === undefined || v === null ? '' : String(v);
    });
    updateYomi();
    updateUi();
  }
  function readField(el) { state[el.dataset.k] = el.value; }
  function updateYomi() {
    page.querySelectorAll('output.yomi').forEach(function (o) {
      var input = $(o.getAttribute('for'));
      o.textContent = input && input.value ? '（' + yomi(Number(input.value)) + '）' : '';
    });
  }
  function updateUi() {
    var d = I.normalizeInput(state);
    var segs = I.keikaSegments(d.year);
    $('late-row').hidden = segs.length !== 2;
    $('noinv-hint').textContent = segs.length === 2
      ? '免税事業者などから。1〜9月は70%、10〜12月は50%だけ控除。'
      : '免税事業者などから。本則課税で' + (segs[0] ? segs[0].pct : 0) + '%だけ控除。';
    S.setText('st-henkan', d.henkan ? yen(d.henkan) : 'なし');
  }

  // --- 結果の表示 ---
  function render() {
    var r = I.calc(state);
    var d = r.input;
    document.querySelectorAll('[data-need]').forEach(function (el) {
      el.classList.toggle('is-missing', r.missing.indexOf(el.dataset.need) >= 0);
    });
    var msgs = $('r-msgs');
    msgs.textContent = '';
    function msg(t, cls) { var li = document.createElement('li'); li.textContent = t; if (cls) li.className = cls; msgs.appendChild(li); }

    if (!r.ready) {
      $('r-big').textContent = '—';
      $('r-detail').textContent = '課税売上を入れると出ます。';
      ['sanwari', 'kani', 'honsoku', 'niwari'].forEach(function (k) {
        $('t-' + k).textContent = '—';
        if ($('why-' + k)) $('why-' + k).textContent = '';
        $('row-' + k).classList.remove('is-best', 'is-off');
      });
      $('r-deadline').textContent = '';
      $('steps').textContent = '';
      setBar('');
      return;
    }

    var m = r.methods;
    $('name-kani').textContent = m.kani.name;
    ['sanwari', 'kani', 'honsoku', 'niwari'].forEach(function (k) {
      var x = m[k], off = !x.available && !x.reference;
      var noShiire = k === 'honsoku' && !x.shiireEntered;
      $('t-' + k).textContent = off ? '使えない' : noShiire ? '仕入れが未入力' : amt(x.r.total);
      if ($('why-' + k)) $('why-' + k).textContent = off ? x.why : '';
      $('row-' + k).classList.toggle('is-best', k === r.best || r.ties.indexOf(k) >= 0);
      $('row-' + k).classList.toggle('is-off', off);
    });
    $('row-niwari').hidden = !m.niwari.eligible10;

    var best = r.best ? m[r.best] : null;
    $('r-lead').textContent = r.yearLabel + '・いちばん少ない方式（消費税＋地方消費税）';
    $('r-big').textContent = best ? amt(best.r.total) : '—';
    var others = ['sanwari', 'kani', 'honsoku'].filter(function (k) { return k !== r.best && m[k].available && (k !== 'honsoku' || m.honsoku.shiireEntered); });
    var next = others.reduce(function (a, k) { return a === null || m[k].r.total < m[a].r.total ? k : a; }, null);
    var detail = best ? best.name.replace(/（.*/, '') : '';
    if (best && r.ties.length) detail += '（' + r.ties.map(function (k) { return m[k].name.replace(/（.*/, ''); }).join('・') + 'と同じ）';
    else if (best && next) detail += '。次は' + m[next].name.replace(/（.*/, '') + '（' + yen(m[next].r.total - best.r.total) + '多い）';
    $('r-detail').textContent = detail;
    $('result-main').classList.toggle('is-refund', !!best && best.r.total < 0);

    if (m.niwari.eligible10 && best) {
      var up = best.r.total - m.niwari.r.total;
      msg(up > 0 ? '同じ売上なら、2割特例（令和8年分まで）より ' + yen(up) + ' 増えます。' : '同じ売上なら、2割特例（令和8年分まで）と比べて増えません。');
    }
    if (!m.honsoku.shiireEntered) msg('本則課税は、仕入れ・経費を入れると比べます。');
    if (m.honsoku.r.refund) msg('本則課税では仕入れの税額が売上の税額より多く、還付になります。簡易課税・3割特例では還付はありません。');

    // 簡易課税の届出の期限
    var dl = I.kaniDeadline(d.year);
    $('r-deadline').innerHTML = '';
    var strong = document.createElement('strong'); strong.textContent = '簡易課税にするなら: ';
    $('r-deadline').appendChild(strong);
    $('r-deadline').appendChild(document.createTextNode(
      '「消費税簡易課税制度選択届出書」を、前の年分を2割特例か3割特例で申告した人は ' + jpDate(dl.tokurei) + '（' + r.yearLabel + 'の申告期限）まで、それ以外の人は ' + jpDate(dl.normal) + ' までに出します。簡易課税は2年間続けます。'));

    // 内訳と途中の計算（方式ごと）
    var box = $('steps');
    box.textContent = '';
    ['sanwari', 'kani', 'honsoku', 'niwari'].forEach(function (k) {
      var x = m[k];
      if ((!x.available && !x.reference) || (k === 'niwari' && !x.eligible10)) return;
      var h = document.createElement('h3'); h.textContent = x.name; box.appendChild(h);
      var t = document.createElement('table'); t.className = 'steps';
      var tb = document.createElement('tbody');
      x.steps.forEach(function (s) {
        var tr = document.createElement('tr');
        if (s.cls) tr.className = s.cls;
        var th = document.createElement('th'); th.scope = 'row'; th.textContent = s.label;
        if (s.rule) { var rule = document.createElement('span'); rule.className = 'rule'; rule.textContent = s.rule; th.appendChild(rule); }
        var td = document.createElement('td'); td.textContent = yen(s.amount);
        tr.appendChild(th); tr.appendChild(td); tb.appendChild(tr);
      });
      t.appendChild(tb); box.appendChild(t);
    });

    setBar(best ? best.name.replace(/（.*/, '') + ' ' + amt(best.r.total) : '');
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
    fileMsg('書き出しました（' + a.download + '）。売上が入っているので、取り扱いにご注意ください。');
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
  // 保存を消すのは全ツール共通の「保存した内容をすべて消す」ボタン（../reset-storage.js）

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
