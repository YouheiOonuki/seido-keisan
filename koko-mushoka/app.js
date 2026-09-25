// ===========================
// 高校無償化の計算（2026年度）— 画面の制御
// 計算は ../lib/koko.js（純粋関数）、制度の値は ../lib/koko-values.js にだけ置く
// ===========================
(function () {
  'use strict';

  var K = window.Koko;
  var V = window.KokoValues;
  var SP = window.ScreenParts;

  // --- ブラウザへの保存（README「ツールを追加するとき」12。キーは "seido-keisan_" で始める） ---
  var KEY_PREFIX = 'seido-keisan_';
  var DRAFT = 'koko_draft';
  var store = {
    get: function (name, fallback) {
      try { var v = localStorage.getItem(KEY_PREFIX + name); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (name, value) { try { localStorage.setItem(KEY_PREFIX + name, JSON.stringify(value)); } catch (e) { /* 続ける */ } },
    remove: function (name) { try { localStorage.removeItem(KEY_PREFIX + name); } catch (e) { /* 続ける */ } },
  };

  var $ = function (id) { return document.getElementById(id); };
  var page = document.querySelector('main');
  var state = K.normalizeInput(store.get(DRAFT, {}));
  var yen = K.yen;

  function yomi(n) {
    n = Number(n) || 0;
    if (n < 10000) return n ? n.toLocaleString('ja-JP') + '円' : '';
    var m = Math.floor(n / 10000), r = n % 10000;
    return m.toLocaleString('ja-JP') + '万' + (r ? r.toLocaleString('ja-JP') : '') + '円';
  }
  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, obj); }
  function setPath(obj, path, v) {
    var ks = path.split('.'), o = obj;
    for (var i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = v;
  }

  // 都道府県の選択肢
  (function () {
    var sel = $('pref');
    V.PREFS.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p; o.textContent = p + (V.PREF_KEY[p] ? '（上乗せを計算）' : '');
      sel.appendChild(o);
    });
  })();

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
    var v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.k === 'years') v = Number(v);
    setPath(state, el.dataset.k, v);
  }
  function updateYomi() {
    page.querySelectorAll('output.yomi').forEach(function (o) {
      var input = $(o.getAttribute('for'));
      o.textContent = input && input.value ? '（' + yomi(Number(input.value)) + '）' : '';
    });
  }
  function optState(detailsId, t) { var s = $(detailsId).querySelector('.opt-state'); if (s.textContent !== t) s.textContent = t; }

  function updateUi() {
    var d = K.normalizeInput(state);
    var unitOk = K.UNIT_TYPES.indexOf(d.type) >= 0;
    $('feemode-field').hidden = !unitOk;
    var unit = d.feeMode === 'unit';
    document.querySelectorAll('.mode-year').forEach(function (el) { el.hidden = unit; });
    document.querySelectorAll('.mode-unit').forEach(function (el) { el.hidden = !unit; });
    // 上乗せの条件
    var key = V.PREF_KEY[d.pref];
    $('pref-osaka').hidden = key !== 'osaka';
    $('pref-kanagawa').hidden = key !== 'kanagawa';
    var ps;
    if (!d.pref) ps = '都道府県が未選択';
    else if (!key) ps = d.pref + 'は計算しない';
    else if (d.setchi !== 'shiritsu') ps = '私立だけ計算';
    else if (key === 'osaka') ps = d.osakaSuishin ? '大阪府・推進校' : '大阪府・推進校でない';
    else if (key === 'kanagawa') ps = d.kanagawaIn ? '神奈川県・県内の学校' : '神奈川県・県外の学校';
    else ps = '東京都（都外の学校も対象）';
    optState('d-pref', ps);
    var msg = '';
    if (d.pref && !key) msg = d.pref + 'の上乗せは、このツールでは計算しません。都道府県の窓口は文部科学省の問合せ先の一覧（下の「このツールで計算しないこと」）から。';
    else if (key === 'tokyo') msg = '東京都は、生徒と保護者が都内に住んでいれば都外の学校も対象です（通信制は都認可のみで、上乗せなし）。';
    else if (!d.pref) msg = '住んでいる都道府県を選ぶと、ここに条件が出ます。';
    $('pref-msg').textContent = msg;
    // 国籍・在留資格
    $('gai-block').hidden = d.status !== 'gai';
    var kubun = { c: '約590万円未満', b: '約590万〜910万円', a: '約910万円以上' }[d.gai.kubun];
    optState('d-status', d.status === 'shin' ? '新制度の対象' : '新制度の対象外（' + kubun + '・' + (d.gai.zaiko ? '在校生' : '新入生') + (d.gai.ryugaku ? '・留学' : '') + '）');
    optState('d-other', d.shisetsu === null && d.nyugaku === null ? '入力なし'
      : [d.shisetsu !== null ? '施設費など 年' + yen(d.shisetsu) : '', d.nyugaku !== null ? '入学金 ' + yen(d.nyugaku) : ''].filter(Boolean).join('・'));
    optState('d-years', d.years + '年');
  }

  // --- 結果の表示 ---
  var setBar = SP.fixbar();
  function row(tb, label, amount, rule, cls) {
    var tr = document.createElement('tr');
    if (cls) tr.className = cls;
    var th = document.createElement('th'); th.scope = 'row'; th.textContent = label;
    if (rule) { var s = document.createElement('span'); s.className = 'rule'; s.textContent = rule; th.appendChild(s); }
    var td = document.createElement('td'); td.textContent = amount;
    tr.appendChild(th); tr.appendChild(td); tb.appendChild(tr);
  }
  var PREF_WHY = {
    none: '都道府県が未選択', other: 'この道府県は計算しない', public: '私立だけ計算', notype: 'この学校の種類は対象外',
    notcalc: 'この条件では計算しない', nosuishin: '推進校でない', outside: '県外の学校は対象外',
  };

  function render() {
    var r = K.calc(state);
    var d = r.input;
    document.querySelectorAll('[data-need]').forEach(function (el) {
      el.classList.toggle('is-missing', r.missing.indexOf(el.dataset.need) >= 0);
    });
    var sum = $('sum').tBodies[0], yb = $('years').tBodies[0];
    sum.textContent = ''; yb.textContent = '';
    var note = [];
    var big = $('r-big'), detail = $('r-detail');

    if (!r.ready) {
      big.textContent = '—';
      detail.textContent = r.why || '授業料を入れると出ます。';
      setBar('');
      $('r-note').textContent = '';
      return;
    }
    var f = r.first, p = f.pref;
    var osakaAll = p.withShisetsu && p.status === 'ok';
    big.textContent = yen(f.selfFee);
    detail.textContent = K.SETCHI_LABEL[d.setchi] + '・' + K.TYPE_LABEL[d.type] + (d.pref ? '・' + d.pref : '') + '（' + V.nendo + 'の制度）';

    row(sum, '授業料（' + r.feeLabel + '）', yen(f.fee));
    if (osakaAll && (d.shisetsu || 0) > 0) row(sum, '施設整備費等（大阪府は対象）', yen(d.shisetsu));
    row(sum, '国の就学支援金', '− ' + yen(f.kuni.amount), f.kuni.rule);
    var prefLabel = p.name ? p.name + 'の上乗せ' : '都道府県の上乗せ';
    row(sum, prefLabel, p.status === 'ok' && p.add > 0 ? '− ' + yen(p.add) : '0円', p.status === 'ok' ? p.rule : PREF_WHY[p.status]);
    if (p.school > 0) row(sum, '学校の負担（標準授業料を超える分）', '− ' + yen(p.school));
    row(sum, '授業料の自己負担（1年）', yen(f.selfFee), '', 'total');
    row(sum, '授業料の自己負担（' + d.years + '年間）', yen(r.sum.selfFee), '', 'total');
    if (r.sum.shisetsu > 0 || r.nyugaku > 0) {
      row(sum, '入学金・施設費を含む（' + d.years + '年間）', yen(r.total), '施設費など ' + yen(r.sum.selfShisetsu) + '・入学金 ' + yen(r.nyugaku), 'total');
    }

    r.years.forEach(function (y) {
      var t = y.year + '年目';
      if (!y.supported) { row(yb, t, yen(y.selfFee), '支援の期間（' + V.MONTHS[d.type] + 'か月' + (d.feeMode === 'unit' ? '・通算' + V.UNITS_TOTAL + '単位' : '') + '）の外'); return; }
      var parts = ['国 ' + yen(y.kuni.amount)];
      if (y.pref.add) parts.push((y.pref.name || '') + ' ' + yen(y.pref.add));
      if (y.pref.school) parts.push('学校 ' + yen(y.pref.school));
      if (d.feeMode === 'unit') parts.push('支援の対象 ' + y.units + '単位');
      row(yb, t, yen(y.selfFee), parts.join('・'));
    });

    if (osakaAll) note.push('大阪府の就学支援推進校では、授業料と施設整備費等は保護者の負担がありません。');
    if (p.status === 'notype' && p.key === 'tokyo' && d.type === 'tsu') note.push('東京都の上乗せは通信制にはありません（都認可の通信制は国の支援の上限まで）。');
    if (d.years > r.supportYears) note.push('国の支援は' + V.MONTHS[d.type] + 'か月までです。');
    if (d.status === 'gai') note.push('新制度の対象外の生徒は、旧制度と同じ水準の支援（年収の目安で判定）で計算しています。');
    if (f.selfFee > 0) note.push('授業料が支援の上限を超える分が自己負担です。');
    $('r-note').textContent = note.join(' ');
    setBar('自己負担（1年） ' + yen(f.selfFee));
  }

  var saveTimer = null, lastSig = '';
  function update() {
    var sig = JSON.stringify(K.normalizeInput(state));
    if (sig === lastSig) return;
    lastSig = sig;
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { store.set(DRAFT, K.normalizeInput(state)); }, 300);
  }
  function renderNow() { lastSig = JSON.stringify(K.normalizeInput(state)); render(); }

  page.addEventListener('input', function (e) {
    if (!e.target.dataset || !e.target.dataset.k) return;
    readField(e.target); updateYomi(); updateUi(); update();
  });
  page.addEventListener('change', function (e) {
    if (!e.target.dataset || !e.target.dataset.k) return;
    readField(e.target); updateUi(); update();
  });

  // --- ファイルへの書き出し・読み込み（D31） ---
  function hasInput() { return JSON.stringify(K.normalizeInput(state)) !== JSON.stringify(K.normalizeInput({})); }
  function fileMsg(t) { $('file-msg').textContent = t; }
  $('export').addEventListener('click', function () {
    var data = K.toExportFile(state);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var dt = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = K.TOOL_ID + '-backup-' + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + '.json';
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    fileMsg('書き出しました（' + a.download + '）。');
  });
  $('import').addEventListener('click', function () { $('import-file').click(); });
  $('import-file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { fileMsg('ファイルが大きすぎます（このツールで書き出したファイルを選んでください）。'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(String(reader.result)); } catch (err) { fileMsg('ファイルを読み込めませんでした（JSON の形式ではありません）。'); return; }
      var res = K.fromExportFile(obj);
      if (!res.ok) { fileMsg(res.message); return; }
      if (hasInput() && !window.confirm('今の入力内容を、ファイルの内容で置き換えます。よろしいですか？')) { fileMsg('読み込みをやめました。'); return; }
      state = res.data;
      fillForm();
      update();
      fileMsg('読み込みました（' + file.name + '）。');
    };
    reader.onerror = function () { fileMsg('ファイルを読み込めませんでした。'); };
    reader.readAsText(file);
  });
  $('clear').addEventListener('click', function () {
    if (!hasInput()) return;
    if (!window.confirm('入力内容をすべて消します。よろしいですか？（書き出したファイルは消えません）')) return;
    state = K.normalizeInput({});
    store.remove(DRAFT);
    fillForm();
    renderNow();
    fileMsg('入力を消しました。');
  });

  // --- 確認日（一定期間たったら注意） ---
  (function () {
    var c = V.CHECKED.split('-');
    $('asof-date').textContent = c[0] + '年' + (+c[1]) + '月' + (+c[2]) + '日';
    var now = new Date();
    var months = (now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]);
    if (months >= V.STALE_MONTHS) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode('。確認日から時間がたっています。最新の制度は文部科学省の案内をご確認ください'));
    }
  })();

  fillForm();
  renderNow();
  document.documentElement.classList.remove('js-loading');
})();
