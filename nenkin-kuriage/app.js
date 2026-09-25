// ===========================
// 年金の繰上げ・繰下げ — 画面の制御
// 計算は ../lib/kuriage.js（純粋関数）、制度の値は ../lib/kuriage-values.js にだけ置く
// ===========================
(function () {
  'use strict';

  var C = window.Kuriage;
  var V = window.KuriageValues;
  var S = window.ScreenParts;

  // --- ブラウザへの保存（README「ツールを追加するとき」12）。キーは必ず "seido-keisan_" で始める ---
  var KEY_PREFIX = 'seido-keisan_';
  var DRAFT = 'kuriage_draft';
  var store = {
    get: function (name, fallback) {
      try { var v = localStorage.getItem(KEY_PREFIX + name); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (name, value) { try { localStorage.setItem(KEY_PREFIX + name, JSON.stringify(value)); } catch (e) { /* 続ける */ } },
    remove: function (name) { try { localStorage.removeItem(KEY_PREFIX + name); } catch (e) { /* 続ける */ } },
  };

  var $ = function (id) { return document.getElementById(id); };
  var page = document.querySelector('main');
  var state = C.normalizeInput(store.get(DRAFT, {}));
  var setBar = S.fixbar();
  var now = new Date();
  var todayYm = now.getFullYear() + '-' + (now.getMonth() < 9 ? '0' : '') + (now.getMonth() + 1);

  function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円'; }
  function man(n) { return (Math.round(n / 1000) / 10).toLocaleString('ja-JP') + '万円'; }
  function yomi(n) {
    n = Number(n) || 0;
    if (n < 10000) return n ? n.toLocaleString('ja-JP') + '円' : '';
    var m = Math.floor(n / 10000), r = n % 10000;
    return m.toLocaleString('ja-JP') + '万' + (r ? r.toLocaleString('ja-JP') : '') + '円';
  }
  function pctStr(p) { return p === 0 ? '±0%' : (p > 0 ? '＋' : '−') + Math.abs(p).toLocaleString('ja-JP', { maximumFractionDigits: 1 }) + '%'; }
  function ageStr(a) { return a.y + '歳' + (a.m ? a.m + 'か月' : ''); }
  function ymStr(ym) { var p = ym.split('-'); return p[0] + '年' + (+p[1]) + '月'; }

  // 年齢と月の選択肢
  function fillAges(sel, from, to, label) {
    for (var a = from; a <= to; a++) {
      var o = document.createElement('option');
      o.value = String(a);
      o.textContent = a + '歳' + (label ? label(a) : '');
      sel.appendChild(o);
    }
  }
  fillAges($('age'), 60, 75, function (a) { return a < 65 ? '（繰上げ）' : a === 65 ? '（65歳から）' : '（繰下げ）'; });
  fillAges($('kAge'), 65, 75);
  fillAges($('workTo'), 66, 80);
  ['mon', 'kMon'].forEach(function (id) {
    for (var m = 0; m < 12; m++) { var o = document.createElement('option'); o.value = String(m); o.textContent = m + 'か月'; $(id).appendChild(o); }
  });

  function fields() { return page.querySelectorAll('[data-k]'); }
  function fillForm() {
    fields().forEach(function (el) {
      var v = state[el.dataset.k];
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.tagName === 'SELECT') el.value = String(v);
      else el.value = v === undefined || v === null || v === 0 ? '' : String(v);
    });
    updateYomi();
  }
  function readField(el) {
    if (el.type === 'checkbox') state[el.dataset.k] = el.checked;
    else state[el.dataset.k] = el.value;
  }
  function updateYomi() {
    page.querySelectorAll('output.yomi').forEach(function (o) {
      var input = $(o.getAttribute('for'));
      o.textContent = input && input.value ? '（' + yomi(Number(input.value)) + '）' : '';
    });
  }

  var MSG = {
    gap: '65歳1か月〜65歳11か月には繰下げの申出ができません（66歳から）。65歳からとして計算しました。',
    max: '繰下げは75歳（昭和27年4月1日以前生まれは70歳）までです。上限の月数で計算しました。',
    min: '繰上げは60歳からです。',
    together: '繰上げは老齢基礎年金と老齢厚生年金を同時に請求します。厚生年金も同じ年齢で計算しました。',
    workEarly: '65歳前から受け取る場合の在職老齢年金はこの計算に入れていません（働く人の欄は使いません）。',
    past: 'この請求の月はもう過ぎています。繰上げはさかのぼって請求できません。',
  };

  function tr(tb, cells, cls) {
    var row = document.createElement('tr');
    if (cls) row.className = cls;
    cells.forEach(function (c, i) { var e = document.createElement(i === 0 ? 'th' : 'td'); if (i === 0) e.scope = 'row'; e.textContent = c; row.appendChild(e); });
    tb.appendChild(row);
  }

  function render() {
    var r = C.calc(state, todayYm);
    var d = r.input;
    var msgs = $('r-msgs');
    msgs.textContent = '';
    function msg(t) { var li = document.createElement('li'); li.textContent = t; msgs.appendChild(li); }
    document.querySelectorAll('[data-need=birth]').forEach(function (el) { el.classList.toggle('is-missing', !d.birth); });
    document.querySelectorAll('[data-need=amount]').forEach(function (el) { el.classList.toggle('is-missing', !(d.kiso || d.kosei)); });
    $('s-sep').textContent = d.sep ? '厚生年金は' + d.kAge + '歳' + (d.kMon ? d.kMon + 'か月' : '') + 'から' : '同じ年齢';
    $('s-work').textContent = d.wage ? '賃金 ' + man(d.wage) + '・' + d.workTo + '歳まで' : '働かない';
    $('totals-box').hidden = !r.ready;
    $('steps-box').hidden = !r.ready;

    if (!r.ready) {
      $('r-lead').textContent = '受け取り始める年齢を選ぶと';
      $('r-big').textContent = '—';
      $('r-detail').textContent = '生年月日と年金額を入れると出ます。';
      ['be', 'kiso', 'kosei', 'base', 'start'].forEach(function (k) { $('t-' + k).textContent = '—'; });
      $('compare').tBodies[0].textContent = '';
      $('work-note').textContent = '';
      setBar('');
      return;
    }

    var same = r.k1 === r.k2;
    var startAge = C.ageOf(Math.min(r.k1, r.k2));
    $('r-lead').textContent = same ? ageStr(C.ageOf(r.k1)) + 'から受け取ると' : '基礎は' + ageStr(C.ageOf(r.k1)) + '・厚生は' + ageStr(C.ageOf(r.k2)) + 'から受け取ると';
    $('r-big').textContent = yen(r.total);
    var diff = r.total - r.baseTotal;
    $('r-detail').textContent = r.k1 === 0 && r.k2 === 0 ? '65歳から受け取る額（増減なし）。' : '65歳からの' + yen(r.baseTotal) + 'より年' + (diff >= 0 ? yen(diff) + '多い' : yen(-diff) + '少ない') + '（月' + yen(r.total / 12) + '）。';

    var be = r.breakEven;
    if (!be) $('t-be').textContent = '—（65歳から）';
    else if (be.never) $('t-be').textContent = '100歳までに逆転しない';
    else {
      var late = Math.max(r.k1, r.k2) > 0;
      $('t-be').textContent = ageStr(be.age) + (late ? 'で65歳からに追いつく' : 'で65歳からに追いつかれる') + '（' + ymStr(be.ym) + '）';
    }
    $('th-kiso').textContent = '老齢基礎年金（' + pctStr(r.pct1) + '）';
    $('t-kiso').textContent = yen(r.kiso);
    $('th-kosei').textContent = '老齢厚生年金（' + pctStr(r.pct2) + (r.avg < 1 && r.k2 > 0 ? '×平均支給率' : '') + '）';
    $('t-kosei').textContent = d.kosei ? yen(r.kosei) : 'なし';
    $('t-base').textContent = yen(r.baseTotal);
    $('t-start').textContent = ymStr(r.startYm) + '分（' + ageStr(startAge) + 'の翌月）';

    r.msgs.forEach(function (m) {
      if (MSG[m]) msg(MSG[m]);
      else if (m === 'tokubetsu') msg((r.tokubetsu.female ? '女性で厚生年金に1年以上入っていた人は、' + r.tokubetsu.female + '歳から特別支給の老齢厚生年金を受けられ、繰上げの計算が変わります（この計算は当てはまりません）。' : '') + (r.tokubetsu.male ? '男性で厚生年金に1年以上入っていた人は、' + r.tokubetsu.male + '歳から特別支給の老齢厚生年金を受けられます。' : ''));
    });
    if (r.stop > 0 && r.k2 > 0) msg('働いている間は老齢厚生年金が月' + yen(r.stop) + '止まり、その分は繰下げで増えません（平均支給率 ' + (Math.round(r.avg * 10000) / 100) + '%）。');
    else if (d.wage && r.stop === 0) msg('賃金と年金の月額の合計が' + man(V.zairo.base) + '以下なので、在職による調整はありません（' + V.zairo.fiscalYear + 'の基準額）。');
    if (!r.msgs.length && r.tokubetsu.female && Math.min(r.k1, r.k2) >= 0) msg('女性で厚生年金に1年以上入っていた人は、' + r.tokubetsu.female + '歳から特別支給の老齢厚生年金（繰下げはできない）を受けられます。');

    // 年齢ごとの累計
    var tb = $('totals').tBodies[0];
    tb.textContent = '';
    r.totals.forEach(function (x) { tr(tb, [x.age + '歳', man(x.opt), man(x.base), (x.diff >= 0 ? '＋' : '−') + man(Math.abs(x.diff))], x.diff >= 0 ? 'plus' : 'minus'); });

    // 途中の計算
    var box = $('steps');
    box.textContent = '';
    var t = document.createElement('table'); t.className = 'steps tbl';
    var tb2 = document.createElement('tbody');
    tr(tb2, ['65歳に達する月（誕生日の前日の月）', ymStr(r.reach65Ym)]);
    tr(tb2, ['請求・申出をする月', ymStr(r.requestYm) + (same ? '' : '（基礎）')]);
    function rateRow(label, k, pct) {
      if (k < 0) tr(tb2, [label, (r.kuriageRate * 100) + '% × ' + (-k) + 'か月 ＝ ' + pctStr(pct)]);
      else if (k > 0) tr(tb2, [label, '0.7% × ' + k + 'か月 ＝ ' + pctStr(pct)]);
      else tr(tb2, [label, '65歳から（増減なし）']);
    }
    rateRow('老齢基礎年金の増減', r.k1, r.pct1);
    if (d.kosei) rateRow('老齢厚生年金の増減', r.k2, r.pct2);
    if (d.kosei && r.k2 > 0 && r.avg < 1) {
      tr(tb2, ['在職で止まる額（月）', '（' + yen(d.kosei / 12) + ' ＋ ' + yen(d.wage) + ' − ' + man(V.zairo.base) + '）÷ 2 ＝ ' + yen(r.stop)]);
      tr(tb2, ['平均支給率', (Math.round(r.avg * 10000) / 100) + '%']);
    }
    tr(tb2, ['年額（1円未満は四捨五入）', yen(r.kiso) + ' ＋ ' + yen(r.kosei) + ' ＝ ' + yen(r.total)]);
    t.appendChild(tb2); box.appendChild(t);

    // 年齢ごとの比較
    var tb3 = $('compare').tBodies[0];
    tb3.textContent = '';
    r.compare.forEach(function (x) {
      var b = x.breakEven ? (x.breakEven.never ? '100歳まで逆転なし' : ageStr(x.breakEven.age)) : '—';
      tr(tb3, [x.age + '歳', pctStr(x.pct), yen(x.total), b], x.k === r.k1 && same ? 'cur' : '');
    });

    $('work-note').textContent = d.wage ? '在職で止まる額は月' + yen(r.stop) + '（' + V.zairo.fiscalYear + 'の基準額' + man(V.zairo.base) + 'で計算。基準額は毎年度変わる）。' : '';

    setBar(ageStr(C.ageOf(r.k1)) + 'から 年' + man(r.total));
  }

  var saveTimer = null, lastSig = '';
  function update() {
    var sig = JSON.stringify(C.normalizeInput(state));
    if (sig === lastSig) return;
    lastSig = sig;
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { store.set(DRAFT, C.normalizeInput(state)); }, 300);
  }
  function renderNow() { lastSig = JSON.stringify(C.normalizeInput(state)); render(); }

  page.addEventListener('input', function (e) {
    if (!e.target.dataset || !e.target.dataset.k) return;
    readField(e.target); updateYomi(); update();
  });
  page.addEventListener('change', function (e) {
    if (!e.target.dataset || !e.target.dataset.k) return;
    readField(e.target); update();
  });

  // --- ファイルへの書き出し・読み込み（D31） ---
  function hasInput() { return JSON.stringify(C.normalizeInput(state)) !== JSON.stringify(C.normalizeInput({})); }
  function fileMsg(t) { $('file-msg').textContent = t; }
  $('export').addEventListener('click', function () {
    var data = C.toExportFile(state);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = C.TOOL_ID + '-backup-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '.json';
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    fileMsg('書き出しました（' + a.download + '）。生年月日と年金額が入っているので、取り扱いにご注意ください。');
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
      var res = C.fromExportFile(obj);
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

  // --- 確認日（一定期間たったら注意。在職老齢年金の基準額は毎年度変わる） ---
  (function () {
    var c = V.CHECKED.split('-');
    $('asof-date').textContent = c[0] + '年' + (+c[1]) + '月' + (+c[2]) + '日';
    var months = (now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]);
    var fyEnd = (+V.zairo.from.slice(0, 4) + 1) + '-04';
    if (months >= V.STALE_MONTHS || todayYm >= fyEnd) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode('。' + (todayYm >= fyEnd ? '在職老齢年金の基準額（' + V.zairo.fiscalYear + ' ' + man(V.zairo.base) + '）は新しい年度の額を反映していません' : '確認日から時間がたっています') + '。最新は日本年金機構の案内をご確認ください'));
    }
  })();

  fillForm();
  renderNow();
  document.documentElement.classList.remove('js-loading');
})();
