// ===========================
// 高額療養費 — 画面の制御
// 計算は ../lib/kogaku.js（純粋関数）、制度の値は ../lib/kogaku-values.js にだけ置く
// 入力の 1 行目（本人・1か所目）は上の必須の欄、2 行目からは「世帯合算」の一覧
// ===========================
(function () {
  'use strict';

  var C = window.Kogaku;
  var V = window.KogakuValues;
  var S = window.ScreenParts;

  // --- ブラウザへの保存（README「ツールを追加するとき」12）。キーは必ず "seido-keisan_" で始める ---
  var KEY_PREFIX = 'seido-keisan_';
  var DRAFT = 'kogaku_draft';
  var store = {
    get: function (name, fallback) {
      try { var v = localStorage.getItem(KEY_PREFIX + name); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (name, value) { try { localStorage.setItem(KEY_PREFIX + name, JSON.stringify(value)); } catch (e) { /* 続ける */ } },
    remove: function (name) { try { localStorage.removeItem(KEY_PREFIX + name); } catch (e) { /* 続ける */ } },
  };

  var $ = function (id) { return document.getElementById(id); };
  var page = document.querySelector('main');
  var now = new Date();
  var todayYm = now.getFullYear() + '-' + (now.getMonth() < 9 ? '0' : '') + (now.getMonth() + 1);
  var state = C.normalizeInput(store.get(DRAFT, {}));
  var setBar = S.fixbar();
  var WHO_LABEL = { self: '本人', f1: '家族1', f2: '家族2', f3: '家族3', f4: '家族4' };

  function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円'; }
  function yomi(n) {
    n = Number(n) || 0;
    if (n < 10000) return n ? n.toLocaleString('ja-JP') + '円' : '';
    var m = Math.floor(n / 10000), r = n % 10000;
    return m.toLocaleString('ja-JP') + '万' + (r ? r.toLocaleString('ja-JP') : '') + '円';
  }
  function period() { return state.period ? C.periodById(state.period) : C.periodFor(todayYm); }
  function ageplan() { return state.plan === 'kouki' ? 'kouki' : state.rows[0].age; }
  function cat() { return C.catById(period(), state.cat); }
  // 窓口の割合の既定: 70歳未満 3割、70〜74歳 2割、75歳以上 1割。70歳以上でも現役並み（外来の上限なし）は3割
  function defRate(age) {
    var c = cat();
    if (age === 'o70' && c && (c.gairai === null || c.gairai === undefined)) return 0.3;
    return C.defaultRate(age, state.plan);
  }
  function formula(l, many) {
    if (many && l.many !== null) return yen(l.many) + '（多数回該当）';
    return l.thr ? yen(l.base) + '＋（医療費−' + yen(l.thr) + '）×1%' : yen(l.base);
  }

  // --- 選択肢 ---
  V.PERIODS.forEach(function (p) {
    var o = document.createElement('option'); o.value = p.id; o.textContent = p.label + (p.id === C.periodFor(todayYm).id ? '（今月）' : ''); $('period').appendChild(o);
  });
  function fillCats() {
    var sel = $('cat'), p = period(), ap = ageplan();
    sel.textContent = '';
    var o0 = document.createElement('option'); o0.value = ''; o0.textContent = '選んでください'; sel.appendChild(o0);
    p.cats.forEach(function (c) {
      if (ap === 'u70' && c.o70only) return;
      var o = document.createElement('option'); o.value = c.id;
      o.textContent = ap === 'u70' ? c.name + '・標準報酬月額' + c.kenpo.replace('住民税非課税', '—') : c.o70name + '（' + c.name + '）';
      if (c.kenpo === '住民税非課税' && ap === 'u70') o.textContent = c.name;
      sel.appendChild(o);
    });
    if (!C.catById(p, state.cat) || (ap === 'u70' && C.catById(p, state.cat).o70only)) state.cat = '';
    sel.value = state.cat;
    $('cat-hint').textContent = ap === 'u70' ? '健保は標準報酬月額、国保は世帯の所得で決まる。' : '70歳以上の国保・後期は課税所得で決まる。表は下に。';
  }

  // --- 世帯合算の行 ---
  function rowHtml(i) {
    var li = document.createElement('li');
    li.className = 'row';
    li.dataset.i = String(i);
    var kouki = state.plan === 'kouki';
    li.innerHTML =
      '<div class="row-grid">' +
      '<label>だれ<select data-r="who">' + ['self', 'f1', 'f2', 'f3', 'f4'].map(function (w) { return '<option value="' + w + '">' + WHO_LABEL[w] + '</option>'; }).join('') + '</select></label>' +
      (kouki ? '' : '<label>年齢<select data-r="age"><option value="u70">70歳未満</option><option value="o70">70〜74歳</option></select></label>') +
      '<label>入院・外来<select data-r="place"><option value="in">入院</option><option value="out">外来・薬局</option></select></label>' +
      '<label>割合<select data-r="rate"><option value="0.3">3割</option><option value="0.2">2割</option><option value="0.1">1割</option></select></label>' +
      '<label class="wide">医療費（10割）<span class="money"><input type="number" data-r="cost" inputmode="numeric" min="0" step="1" placeholder="例：100000"><span class="unit">円</span></span></label>' +
      '</div>' +
      '<button type="button" class="btn del" aria-label="この行を消す">消す</button>';
    var r = state.rows[i];
    li.querySelectorAll('[data-r]').forEach(function (el) { var v = r[el.dataset.r]; el.value = el.dataset.r === 'cost' ? (v ? String(v) : '') : String(v); });
    return li;
  }
  function renderRows() {
    var ol = $('rows');
    ol.textContent = '';
    for (var i = 1; i < state.rows.length; i++) ol.appendChild(rowHtml(i));
    $('add-row').disabled = state.rows.length >= C.MAX_ROWS;
  }
  $('add-row').addEventListener('click', function () {
    var age = ageplan() === 'u70' ? 'u70' : 'o70';
    state.rows.push(C.normalizeRow({ who: 'f1', age: age, place: 'out', rate: defRate(age) }, state.plan, state.rows.length));
    renderRows();
    var inputs = $('rows').querySelectorAll('input[data-r=cost]');
    if (inputs.length) inputs[inputs.length - 1].focus();
    update(true);
  });
  $('rows').addEventListener('click', function (e) {
    if (!e.target.classList.contains('del')) return;
    var i = +e.target.closest('li').dataset.i;
    state.rows.splice(i, 1);
    renderRows();
    update(true);
  });
  function onRowInput(e) {
    var el = e.target, li = el.closest('li.row');
    if (!li || !el.dataset.r) return;
    var r = state.rows[+li.dataset.i];
    var k = el.dataset.r;
    r[k] = k === 'rate' ? Number(el.value) : k === 'cost' ? Number(el.value) || 0 : el.value;
    if (k === 'age') { r.rate = defRate(r.age); li.querySelector('[data-r=rate]').value = String(r.rate); }
    update();
  }
  $('rows').addEventListener('input', onRowInput);
  $('rows').addEventListener('change', onRowInput);

  // --- 上の欄 ---
  function fillForm() {
    $('ageplan').value = ageplan();
    $('period').value = period().id;
    fillCats();
    var r0 = state.rows[0];
    $('cost0').value = r0.cost ? String(r0.cost) : '';
    page.querySelectorAll('input[name=place0]').forEach(function (el) { el.checked = el.value === r0.place; });
    $('rate0').value = String(r0.rate);
    $('many').checked = state.many;
    $('yearPaid').value = state.yearPaid ? String(state.yearPaid) : '';
    renderRows();
    updateYomi();
  }
  function updateYomi() {
    page.querySelectorAll('output.yomi').forEach(function (o) {
      var input = $(o.getAttribute('for'));
      o.textContent = input && input.value ? '（' + yomi(Number(input.value)) + '）' : '';
    });
  }
  $('ageplan').addEventListener('change', function () {
    var v = this.value;
    state.plan = v === 'kouki' ? 'kouki' : 'kenpo';
    state.rows[0].age = v === 'u70' ? 'u70' : 'o70';
    if (state.plan === 'kouki') state.rows.forEach(function (r) { r.age = 'o70'; });
    fillCats();
    state.rows.forEach(function (r) { r.rate = defRate(r.age); });
    $('rate0').value = String(state.rows[0].rate);
    renderRows();
    update();
  });
  $('period').addEventListener('change', function () { state.period = this.value; fillCats(); update(); });
  $('cat').addEventListener('change', function () {
    state.cat = this.value;
    state.rows.forEach(function (r) { r.rate = defRate(r.age); });
    $('rate0').value = String(state.rows[0].rate);
    renderRows();
    update();
  });
  $('cost0').addEventListener('input', function () { state.rows[0].cost = Number(this.value) || 0; updateYomi(); update(); });
  page.querySelectorAll('input[name=place0]').forEach(function (el) { el.addEventListener('change', function () { state.rows[0].place = this.value; update(); }); });
  $('rate0').addEventListener('change', function () { state.rows[0].rate = Number(this.value); update(); });
  $('many').addEventListener('change', function () { state.many = this.checked; update(); });
  $('yearPaid').addEventListener('input', function () { state.yearPaid = Number(this.value) || 0; updateYomi(); update(); });

  function tr(tb, cells) {
    var row = document.createElement('tr');
    cells.forEach(function (c, i) { var e = document.createElement(i === 0 ? 'th' : 'td'); if (i === 0) e.scope = 'row'; e.textContent = c; row.appendChild(e); });
    tb.appendChild(row);
  }

  // 区分の表（選んでいる診療月の表）
  function renderTable() {
    var p = period(), tb = $('cat-table').tBodies[0];
    tb.textContent = '';
    p.cats.forEach(function (c) {
      tr(tb, [c.name, c.kenpo, c.kokuho, c.kouki,
        c.o70only ? '—' : formula(c.u70) + '（' + (c.u70.many ? yen(c.u70.many) : '—') + '）',
        c.o70name + ' ' + formula(c.o70) + (c.gairai ? '（外来 ' + yen(c.gairai) + '）' : '（外来の上限なし）')]);
    });
    $('table-note').textContent = p.label + 'の表。年収は目安で、区分は加入先の保険者が決めます。';
  }

  function render() {
    var r = C.calc(state, todayYm);
    var d = r.input, p = r.period, c = r.cat;
    var msgs = $('r-msgs');
    msgs.textContent = '';
    function msg(t) { var li = document.createElement('li'); li.textContent = t; msgs.appendChild(li); }
    document.querySelectorAll('[data-need=cat]').forEach(function (el) { el.classList.toggle('is-missing', !c); });
    document.querySelectorAll('[data-need=cost]').forEach(function (el) { el.classList.toggle('is-missing', !d.rows[0].cost); });
    var extra = d.rows.length - 1;
    $('s-rows').textContent = extra ? extra + '件' : 'なし';
    $('s-when').textContent = p.label + (d.many ? '・多数回該当' : '・多数回でない');
    $('s-year').textContent = d.yearPaid ? yen(d.yearPaid) : '入力なし';
    $('steps-box').hidden = !r.ready;
    renderTable();
    drawZu(r);
    $('year-note').textContent = c && c.year ? p.label + 'の' + (c.o70name && ageplan() !== 'u70' ? c.o70name : c.name) + 'の年間上限は' + yen(c.year) + '。8月〜翌年7月の自己負担が超えた分は申請で戻ります（申請は2027年8月から）。' : '年間上限は2026年8月診療分からです。';

    if (!r.ready) {
      $('r-lead').textContent = p.label;
      $('r-big').textContent = '—';
      $('r-detail').textContent = !c ? '所得区分を選ぶと出ます（診療月を変えたら選び直し）。' : '医療費を入れると出ます。';
      ['paid', 'refund', 'formula', 'year'].forEach(function (k) { $('t-' + k).textContent = '—'; });
      $('year-result').textContent = '';
      $('steps').textContent = '';
      setBar('');
      return;
    }

    $('r-lead').textContent = p.label + '・' + (ageplan() === 'u70' ? c.name.split('（')[0] : c.o70name);
    $('r-big').textContent = yen(r.self);
    $('r-detail').textContent = r.refund > 0 ? '窓口の' + yen(r.paid) + 'のうち' + yen(r.refund) + 'が戻ります（マイナ保険証なら窓口で上限まで）。' : '上限に届かないので、高額療養費はありません。';
    $('t-paid').textContent = yen(r.paid);
    $('t-refund').textContent = yen(r.refund);
    var outer = d.plan === 'kouki' || !d.rows.some(function (x) { return x.age === 'u70' && x.cost; }) ? c.o70 : c.u70;
    $('t-formula').textContent = formula(outer, d.many) + (r.limit !== null ? ' ＝ ' + yen(r.limit) : '');
    $('row-year').hidden = !r.year;
    if (r.year) $('t-year').textContent = yen(r.year.cap) + (r.year.gairaiYear && ageplan() !== 'u70' ? '（70歳以上の外来は' + yen(r.year.gairaiYear) + '）' : '');
    $('year-result').textContent = r.year && d.yearPaid ? (r.year.over > 0 ? '年間上限を' + yen(r.year.over) + '超えています。超えた分は申請で戻ります。' : '年間上限まで あと' + yen(r.year.cap - d.yearPaid) + 'です。') : '';

    if (r.msgs.indexOf('o1u70') >= 0) msg('「所得が一定以下」は70歳以上の区分です。70歳未満の人は住民税非課税の額で計算しました。');
    if (r.smallU70) msg('70歳未満で1か所21,000円未満の分（' + r.smallU70 + '件）は合算していません（その分は窓口の負担のまま）。');
    if (d.many && ageplan() !== 'u70' && c.o70.many === null) msg('この区分には多数回該当の額がありません。');
    if (r.year && r.year.cap200) msg('年収約200万円以下（健保の標準報酬月額15万円以下）と確認できた人は、年間上限41万円を2027年8月以降に償還払い。');
    if (period().id !== C.periodFor(todayYm).id) msg('今月とは別の診療月の表（' + p.label + '）で計算しています。');
    if (d.plan === 'kouki' && d.rows.some(function (x) { return x.rate === 0.3; }) && c.gairai) msg('75歳以上で3割は現役並みの区分です。所得区分を確かめてください。');

    // 途中の計算
    var box = $('steps');
    box.textContent = '';
    var t = document.createElement('table'); t.className = 'steps tbl';
    var tb = document.createElement('tbody');
    r.rows.forEach(function (x) { tr(tb, [WHO_LABEL[x.who] + '・' + (x.age === 'u70' ? '70歳未満' : '70歳以上') + '・' + (x.place === 'in' ? '入院' : '外来'), yen(x.cost) + ' × ' + Math.round(x.rate * 10) + '割 ＝ ' + yen(x.pay)]); });
    r.steps.forEach(function (s) {
      if (s.kind === 'gairai') tr(tb, ['① 70歳以上の外来（' + WHO_LABEL[s.who] + '）', yen(s.paid) + ' → 上限 ' + yen(s.limit) + '、戻る ' + yen(s.refund)]);
      if (s.kind === 'o70') tr(tb, ['② 70歳以上の世帯', yen(s.paid) + ' → 上限 ' + yen(s.limit) + '、戻る ' + yen(s.refund)]);
      if (s.kind === 'u70') tr(tb, ['③ 世帯全体（70歳未満は21,000円以上の分）', yen(s.paid) + ' → 上限 ' + yen(s.limit) + '、戻る ' + yen(s.refund)]);
    });
    tr(tb, ['高額療養費の合計', yen(r.refund)]);
    t.appendChild(tb); box.appendChild(t);

    setBar('自己負担 ' + yen(r.self));
    window.yzUsed?.();
  }

  // --- 医療費と払う額の図（Q-480）: 窓口の負担（破線）と自己負担（実線）。印を左右に引く・← → で、1か月の医療費の欄を変える ---
  // 線の点は chart.js が calc を呼んだ値。範囲は欄の min・max（属性から取る）と、calc が結果を出せる額
  var KC = window.KogakuChart;
  var SVG = 'http://www.w3.org/2000/svg';
  var W = 400, H = 230, PL = 52, PR = 10, PT = 14, PB = 22;
  var zu = null;        // 直近の { f: 枠, x, y }（引くときに使う）
  var slow = false;     // 1 回の計算と描き直しが 50 ms を超えたら、引いている間は計算せず、指を離した時だけ計算する
  var drag = null;
  function el(name, attrs, text) {
    var e = document.createElementNS(SVG, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function man(v) { return v ? (v / 10000).toLocaleString('ja-JP') + '万' : '0'; }
  function drawZu(r) {
    var box = $('kzu-box'), btn = $('kzu-mark'), old = $('kzu').querySelector('svg');
    var show = KC.shows(r);
    box.hidden = !show;
    if (!show) { if (old) old.remove(); zu = null; return; }
    var f = KC.frame(C, state, todayYm, r, drag ? drag.f.xMax : 0);
    var x = function (v) { return PL + (W - PL - PR) * v / f.xMax; };
    var y = function (v) { return PT + (H - PT - PB) * (1 - v / f.yMax); };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', class: 'zu', 'aria-label': '1か月の医療費と、窓口の負担・自己負担' });
    for (var v = 0; v <= f.yMax + 0.5; v += f.yStep) {
      svg.appendChild(el('line', { x1: PL, x2: W - PR, y1: y(v), y2: y(v), class: 'zu-grid' }));
      svg.appendChild(el('text', { x: PL - 4, y: y(v) + 4, class: 'zu-tick zu-tick-y' }, man(v)));
    }
    for (var c = 0; c <= f.xMax + 0.5; c += f.xStep) {
      svg.appendChild(el('text', { x: x(c), y: H - 6, class: 'zu-tick' + (c + f.xStep > f.xMax + 0.5 ? ' zu-tick-end' : '') }, man(c)));
    }
    function path(k) { return f.line.map(function (p, i) { return (i ? 'L' : 'M') + x(p.cost).toFixed(1) + ' ' + y(p[k]).toFixed(1); }).join(''); }
    svg.appendChild(el('path', { d: path('paid'), class: 'zu-base' }));
    svg.appendChild(el('path', { d: path('self'), class: 'zu-opt' }));
    // 線の端の名前
    var end = f.line[f.line.length - 1], mid = f.line[Math.round((f.line.length - 1) * 0.75)];   // 破線は右上がりなので、名前は 3/4 の所の線の左上に
    svg.appendChild(el('text', { x: x(mid.cost) - 4, y: y(mid.paid) - 6, class: 'zu-name' }, '窓口の負担'));
    svg.appendChild(el('text', { x: W - PR, y: y(end.self) - 6, class: 'zu-name zu-name-opt' }, '自己負担'));
    // 今の医療費の所: 2 本の間（戻る額）
    var cx = x(r.input.rows[0].cost), yp = y(r.paid), ys = y(r.self);
    svg.appendChild(el('line', { x1: cx, x2: cx, y1: PT, y2: H - PB, class: 'zu-pick' }));
    if (r.refund > 0) {
      svg.appendChild(el('line', { x1: cx, x2: cx, y1: yp, y2: ys, class: 'zu-gap' }));
      var right = cx < W * 0.6;
      svg.appendChild(el('text', { x: cx + (right ? 6 : -6), y: (yp + ys) / 2 + 4, class: 'zu-gap-label' + (right ? '' : ' zu-gap-label-l') }, '戻る額 ' + yen(r.refund)));
    }
    if (old) $('kzu').replaceChild(svg, old); else $('kzu').insertBefore(svg, btn);
    zu = { f: f };
    btn.style.left = (cx / W * 100) + '%';
    btn.style.top = (ys / H * 100) + '%';
    btn.setAttribute('aria-label', '1か月の医療費 ' + yen(r.input.rows[0].cost));
  }
  function setCost(v) {
    $('cost0').value = String(v);
    state.rows[0].cost = v;
    updateYomi();
  }
  function runNow(force) {
    var t0 = performance.now();
    update(force);
    slow = performance.now() - t0 > 50;
  }
  function tryCost(v, compute) {
    var ci = $('cost0');
    if (v === state.rows[0].cost || !KC.allowed(C, state, todayYm, v, ci.min, ci.max)) return false;   // 結果が出ない額へは動かない
    setCost(v);
    if (compute) runNow();
    return true;
  }
  var markBtn = $('kzu-mark');
  markBtn.addEventListener('keydown', function (e) {
    var d = KC.keyStep(e.key, e.shiftKey);
    if (!d || !zu) return;
    e.preventDefault();
    tryCost(state.rows[0].cost + d, true);
  });
  markBtn.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || !zu) return;
    e.preventDefault();
    this.focus();
    this.setPointerCapture(e.pointerId);
    var rect = $('kzu').querySelector('svg').getBoundingClientRect();
    drag = { id: e.pointerId, f: zu.f, left: rect.left + rect.width * PL / W, width: rect.width * (W - PL - PR) / W, moved: false };
  });
  markBtn.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var v = KC.costAtRatio((e.clientX - drag.left) / drag.width, drag.f);
    if (tryCost(v, !slow)) {
      drag.moved = true;
      if (slow) markBtn.style.left = ((PL + (W - PL - PR) * v / drag.f.xMax) / W * 100) + '%';   // 計算は指を離した時。印だけ指の下に付いてくる
    }
  });
  function markUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var moved = drag.moved;
    drag = null;
    if (moved) runNow(true);   // 横の端を今の医療費に合わせて描き直す
  }
  markBtn.addEventListener('pointerup', markUp);
  markBtn.addEventListener('pointercancel', markUp);

  var saveTimer = null, lastSig = '';
  function update(force) {
    var sig = JSON.stringify(C.normalizeInput(state));
    if (sig === lastSig && !force) return;
    lastSig = sig;
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { store.set(DRAFT, C.normalizeInput(state)); }, 300);
  }

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
    fileMsg('書き出しました（' + a.download + '）。医療費が入っているので、取り扱いにご注意ください。');
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
      update(true);
      fileMsg('読み込みました（' + f.name + '）。');
    };
    reader.onerror = function () { fileMsg('ファイルを読み込めませんでした。'); };
    reader.readAsText(f);
  });
  // 保存を消すのは全ツール共通の「保存した内容をすべて消す」ボタン（../reset-storage.js）

  // --- 確認日（一定期間たったら注意） ---
  (function () {
    var c = V.CHECKED.split('-');
    $('asof-date').textContent = c[0] + '年' + (+c[1]) + '月' + (+c[2]) + '日';
    var months = (now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]);
    if (months >= V.STALE_MONTHS) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode('。確認日から時間がたっています。最新の上限額は加入先の案内をご確認ください'));
    }
    if (todayYm >= '2027-08') $('asof').firstChild.textContent = '2027年8月診療分からの上限額・確認日 ';
  })();

  fillForm();
  update(true);
  document.documentElement.classList.remove('js-loading');
})();
