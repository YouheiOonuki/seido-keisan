// ===========================
// 住民税の計算・非課税判定（令和9年度）— 画面の制御
// 計算は ../lib/juminzei.js（純粋関数）、制度の値は ../lib/juminzei-values.js にだけ置く
// ===========================
(function () {
  'use strict';

  var J = window.Juminzei;
  var JV = window.JuminzeiValues;
  var CUR = JV.CURRENT, PREV = JV.PREVIOUS;

  // --- ブラウザへの保存（README「ツールを追加するとき」12） ---
  // キーは必ず "seido-keisan_" で始める。全ツールが同じオリジンで localStorage を共有しているため
  var KEY_PREFIX = 'seido-keisan_';
  var DRAFT = 'juminzei_draft';
  var NENMATSU_DRAFT = 'nenmatsu_draft';
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
  var state = J.normalizeInput(store.get(DRAFT, {}));

  function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円'; }
  function yomi(n) {
    n = Number(n) || 0;
    if (n < 10000) return n ? n.toLocaleString('ja-JP') + '円' : '';
    var m = Math.floor(n / 10000), r = n % 10000;
    return m.toLocaleString('ja-JP') + '万' + (r ? r.toLocaleString('ja-JP') : '') + '円';
  }

  // data-k="seimei.newIppan" のような入力欄と state を結ぶ
  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, obj); }
  function setPath(obj, path, v) {
    var ks = path.split('.'), o = obj;
    for (var i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = v;
  }

  // 税率・均等割の欄は、自分で直していないときは標準の値を見せる
  function syncCityFields() {
    var c = state.city;
    if (!c.custom) {
      var d = J.normalizeInput({ city: { shitei: c.shitei } }).city;
      c.prefRate = d.prefRate; c.cityRate = d.cityRate; c.prefKinto = d.prefKinto; c.cityKinto = d.cityKinto;
    }
  }

  function fillForm() {
    syncCityFields();
    form.querySelectorAll('[data-k]').forEach(function (el) {
      var v = getPath(state, el.dataset.k);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'number') el.value = (v || v === 0) && (v !== 0 || el.dataset.k.indexOf('city.') === 0) ? String(v) : '';
      else el.value = String(v);
    });
    renderRels();
    updateYomi();
    updateUi();
  }

  function readField(el) {
    var v = el.type === 'checkbox' ? el.checked : el.value;
    setPath(state, el.dataset.k, v);
  }

  function updateYomi() {
    form.querySelectorAll('output.yomi').forEach(function (o) {
      var input = $(o.getAttribute('for'));
      o.textContent = input && input.value ? '（' + yomi(Number(input.value)) + '）' : '';
    });
  }

  function updateUi() {
    $('sp-block').hidden = !state.spouse.has;
    $('sp-amount-label').textContent = state.spouse.incomeType === 'shotoku' ? '配偶者の令和8年の合計所得金額' : '配偶者の令和8年の給与の収入金額';
    $('parent-block').hidden = state.self.kafu !== 'hitorioya';
    var y = state.jutaku.year;
    $('jutaku-tokutei').disabled = !(y === 'h26_27' || y === 'h28_r3');
    ['c-prefRate', 'c-cityRate', 'c-prefKinto', 'c-cityKinto'].forEach(function (id) { $(id).disabled = !state.city.custom; });
    if (state.city.custom) $('custom-block').open = true;
  }

  // --- 扶養親族・特定親族の行（年末調整の計算と同じ形） ---
  var AGE_OPTIONS = [['u16', '16歳未満'], ['16-18', '16〜18歳'], ['19-22', '19〜22歳'], ['23-69', '23〜69歳'], ['70', '70歳以上'], ['70dokyo', '70歳以上（同居老親等）']];
  var SHOGAI_OPTIONS = [['none', 'なし'], ['ippan', '障害者'], ['tokubetsu', '特別障害者（同居していない）'], ['dokyo', '同居特別障害者']];
  var TYPE_OPTIONS = [['kyuyo', '給与の収入金額'], ['shotoku', '合計所得金額']];

  function select(options, value, label, cls) {
    var wrap = document.createElement('label');
    wrap.className = 'mini';
    wrap.appendChild(document.createTextNode(label));
    var s = document.createElement('select');
    if (cls) s.dataset.f = cls;
    options.forEach(function (o) {
      var op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      if (o[0] === value) op.selected = true;
      s.appendChild(op);
    });
    wrap.appendChild(s);
    return wrap;
  }

  function renderRels() {
    var box = $('rels');
    box.textContent = '';
    state.relatives.forEach(function (p, i) {
      var row = document.createElement('div');
      row.className = 'rel';
      row.dataset.i = i;
      var head = document.createElement('div');
      head.className = 'rel-head';
      var title = document.createElement('span');
      title.textContent = (i + 1) + '人目';
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'icon-btn'; del.dataset.del = i;
      del.textContent = '削除';
      del.setAttribute('aria-label', (i + 1) + '人目を削除');
      head.appendChild(title); head.appendChild(del);
      row.appendChild(head);

      var body = document.createElement('div');
      body.className = 'rel-body';
      body.appendChild(select(AGE_OPTIONS, p.age, '年齢', 'age'));
      body.appendChild(select(TYPE_OPTIONS, p.incomeType, '収入の入れ方', 'incomeType'));
      var amt = document.createElement('label');
      amt.className = 'mini';
      amt.appendChild(document.createTextNode(p.incomeType === 'shotoku' ? '合計所得金額（円）' : '令和8年の給与の収入（円）'));
      var inp = document.createElement('input');
      inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = '0'; inp.step = '1'; inp.placeholder = '0';
      inp.dataset.f = 'amount';
      inp.value = p.amount ? String(p.amount) : '';
      amt.appendChild(inp);
      body.appendChild(amt);
      body.appendChild(select(SHOGAI_OPTIONS, p.shogai, '障害', 'shogai'));
      row.appendChild(body);

      var note = document.createElement('p');
      note.className = 'rel-note';
      note.dataset.note = i;
      row.appendChild(note);
      box.appendChild(row);
    });
  }

  $('rels').addEventListener('input', onRelChange);
  $('rels').addEventListener('change', onRelChange);
  function onRelChange(e) {
    var row = e.target.closest('.rel');
    if (!row || !e.target.dataset.f) return;
    var p = state.relatives[Number(row.dataset.i)];
    p[e.target.dataset.f] = e.target.value;
    if (e.target.dataset.f === 'incomeType' && e.type === 'change') {
      state = J.normalizeInput(state);
      renderRels();
      var again = $('rels').querySelectorAll('.rel')[Number(row.dataset.i)];
      if (again) again.querySelector('[data-f="incomeType"]').focus();
    }
    update();
  }
  $('rels').addEventListener('click', function (e) {
    var i = e.target.dataset.del;
    if (i === undefined) return;
    state.relatives.splice(Number(i), 1);
    renderRels();
    update();
    $('add-rel').focus();
  });
  $('add-rel').addEventListener('click', function () {
    state.relatives.push({ age: 'u16', incomeType: 'kyuyo', amount: 0, shogai: 'none' });
    renderRels();
    update();
    var rows = $('rels').querySelectorAll('.rel');
    rows[rows.length - 1].querySelector('select').focus();
  });

  // --- 結果の表示 ---
  function row(tbody, cells, cls) {
    var tr = document.createElement('tr');
    if (cls) tr.className = cls;
    cells.forEach(function (c, i) {
      var cell = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) cell.scope = 'row';
      if (c && c.nodeType) cell.appendChild(c); else cell.textContent = c;
      tr.appendChild(cell);
    });
    tbody.appendChild(tr);
    return tr;
  }
  function li(list, name, text) {
    var l = document.createElement('li');
    var b = document.createElement('span');
    b.className = 'pay-name';
    b.textContent = name;
    l.appendChild(b);
    l.appendChild(document.createTextNode(text));
    list.appendChild(l);
  }
  function judge(id, hikazei, why, has) {
    var box = $(id);
    box.classList.toggle('is-hikazei', has && hikazei);
    box.querySelector('.judge-tag').textContent = has ? (hikazei ? '非課税' : '課税') : '—';
    box.querySelector('.judge-why').textContent = has ? why : '';
  }

  function render() {
    var d = J.normalizeInput(state);
    var r = J.calc(d, CUR);
    var p = J.calc(d, PREV);
    var y = r.y;
    var msgs = [];
    var main = $('result-main');
    main.className = 'result-main';
    var has = d.income > 0 || d.self.seikatsuhogo;

    if (!has) {
      $('r-lead').textContent = '給与の収入金額を入れると計算します';
      $('r-big').textContent = '—';
      $('r-detail').textContent = '';
    } else if (r.total === 0) {
      main.classList.add('is-refund');
      $('r-lead').textContent = y.label + 'の住民税（' + y.incomeLabel + 'の所得にかかる分）';
      $('r-big').textContent = '非課税（0円）';
      $('r-detail').textContent = r.special ? r.special + 'ため、均等割・所得割・森林環境税がかかりません。' : '均等割・所得割・森林環境税がかかりません。';
    } else {
      $('r-lead').textContent = y.label + 'の住民税（年額）';
      $('r-big').textContent = yen(r.total);
      $('r-detail').textContent = '所得割 ' + yen(r.wari) + ' ＋ 均等割 ' + yen(r.prefKinto + r.cityKinto) + ' ＋ 森林環境税 ' + yen(r.shinrin) + (r.wari === 0 ? '（所得割は非課税）' : '');
    }
    if (d.income > 20000000) msgs.push('給与の収入が2,000万円を超えるため、年末調整の対象外です。住民税の計算は給与所得を「収入 − 195万円」として続けていますが、確定申告の内容によって変わります。');
    if (r.choseiMaybe) msgs.push('給与が850万円を超え、23歳未満の扶養親族か特別障害者がいるため「所得金額調整控除」の対象になる可能性があります。このツールでは計算に入れていないので、実際の税額はこれより少なくなることがあります。');
    if (r.jutaku.note && d.jutaku.amount > 0 && r.jutaku.pref + r.jutaku.city === 0 && r.jutaku.left === 0) msgs.push('住宅ローン控除は所得税から全額引ききれる見込みのため、住民税からは引かれません。');
    if (d.city.custom) msgs.push('税率・均等割は、入力した値（' + d.city.prefRate + '%・' + d.city.cityRate + '%・' + d.city.prefKinto + '円・' + d.city.cityKinto + '円）で計算しています。');

    var box = $('msgs');
    box.textContent = '';
    msgs.forEach(function (m) { var p0 = document.createElement('p'); p0.textContent = m; box.appendChild(p0); });
    box.hidden = msgs.length === 0;

    // 「くわしく入れる」の summary に今の状態を出す（SCREEN.md 1.1 の 4）
    updateSummaries(d);
    // 固定バーの文言は結果の大きな数字に名前を付けたもの
    setBar(!has ? '' : r.total === 0 ? '住民税 ' + $('r-big').textContent : '住民税（年額） ' + $('r-big').textContent);

    // 均等割・所得割の判定
    judge('j-kinto', r.kintoHikazei, r.reasons.kinto, has);
    judge('j-shotoku', r.shotokuHikazei, r.reasons.shotoku, has);
    var who = r.count ? '同一生計配偶者・扶養親族 ' + r.count + '人（16歳未満を含む）の場合' : '配偶者・扶養親族がいない場合';
    var ln = function (v) { return v < 0 ? 'なし' : yen(v); };
    $('line-note').textContent = has
      ? who + '、非課税になる合計所得金額は 均等割 ' + yen(r.kintoLimit) + '以下（給与だけなら収入 ' + ln(r.kintoLine) + '以下。' + d.city.kyuchi + '級地の基準）、所得割 ' + yen(r.shotokuLimit) + '以下（収入 ' + ln(r.shotokuLine) + '以下）です。均等割の基準は市区町村の条例で決まるので、お住まいの案内でも確かめてください。'
      : '';

    // 内訳
    var bt = $('breakdown').tBodies[0];
    bt.textContent = '';
    row(bt, ['道府県民税', yen(r.prefWari), yen(r.prefKinto), yen(r.pref)]);
    row(bt, ['市町村民税', yen(r.cityWari), yen(r.cityKinto), yen(r.city)]);
    row(bt, ['森林環境税（国税）', '—', yen(r.shinrin), yen(r.shinrin)]);
    var tr = row(bt, ['合計', yen(r.wari), yen(r.prefKinto + r.cityKinto + r.shinrin), yen(r.total)]);
    tr.querySelectorAll('td, th').forEach(function (c) { c.style.fontWeight = '700'; });

    // 納める時期
    var pay = $('pay');
    pay.textContent = '';
    if (has && r.total > 0) {
      var t = r.installments.tokubetsu, f = r.installments.futsu;
      li(pay, '会社員など（給与から引かれる特別徴収）',
        y.payFrom + 'から' + y.payTo + 'までの12回。6月は ' + yen(t.first) + '、7月から翌年5月は毎月 ' + yen(t.rest) + '（年税額の12分の1。100円未満の端数は6月に寄せます）');
      li(pay, '自分で納める場合（普通徴収）',
        f.count === 1 ? '均等割だけなので、6月に1回 ' + yen(f.first)
          : '6月・8月・10月・翌年1月の4回。6月は ' + yen(f.first) + '、ほかは各 ' + yen(f.rest) + '（1,000円未満の端数は6月に寄せます。納期は市区町村の条例で決まります）');
    } else {
      li(pay, '—', has ? '非課税のため、納める住民税はありません。' : '給与の収入金額を入れると出します。');
    }

    // ふるさと納税
    var fu = $('furusato');
    if (r.furusato) {
      var lim = Math.floor(r.furusato.limit / 1000) * 1000;
      fu.textContent = y.furusatoYear + '中の寄附で、自己負担2,000円で済む寄附額の上限の目安は 約' + yen(lim) + '（' + yen(r.furusato.limit) + '）です。計算：' + r.furusato.rule + '。総務省のふるさと納税ポータルの計算式によります。確定申告でもワンストップ特例でも、控除の合計は同じです。医療費控除など、このツールで入れていない控除があると上限は下がります。';
    } else {
      fu.textContent = has ? '所得割がかからないため、ふるさと納税の住民税からの控除（特例分）はありません。' : '給与の収入金額を入れると出します。';
    }

    // 途中の計算
    var tb = $('steps').tBodies[0];
    tb.textContent = '';
    r.steps.forEach(function (s) {
      var th = document.createElement('span');
      th.textContent = s.label;
      var rule = document.createElement('span');
      rule.className = 'rule';
      rule.textContent = s.rule;
      var frag = document.createDocumentFragment();
      frag.appendChild(th); frag.appendChild(rule);
      var cls = s.sub ? 'sub' : (s.key === 'total' || s.key === 'kojo' || s.key === 'taxable') ? 'total' : '';
      row(tb, [frag, yen(s.amount)], cls);
    });

    // 親族ごとの判定
    var list = $('rel-list');
    list.textContent = '';
    r.relatives.lines.forEach(function (l, i) {
      var li0 = document.createElement('li');
      var parts = [l.label + '：所得 ' + yen(l.shotoku) + '・' + l.note];
      if (l.fuyo) parts.push('扶養控除 ' + yen(l.fuyo));
      if (l.tokutei) parts.push('特定親族特別控除 ' + yen(l.tokutei));
      if (l.shogai) parts.push('障害者控除 ' + yen(l.shogai));
      li0.textContent = parts.join('・');
      list.appendChild(li0);
      var note = document.querySelector('[data-note="' + i + '"]');
      if (note) note.textContent = '→ ' + l.note + (l.fuyo ? '（扶養控除 ' + yen(l.fuyo) + '）' : '') + (l.tokutei ? '（特定親族特別控除 ' + yen(l.tokutei) + '）' : '');
    });
    $('rel-detail').hidden = r.relatives.lines.length === 0;

    // 令和8年度との比較
    var cb = $('cmp').tBodies[0];
    cb.textContent = '';
    if (has) {
      var diffCell = function (a, b) { var v = a - b; return v === 0 ? '0円' : (v > 0 ? '+' : '−') + yen(Math.abs(v)); };
      var hk = function (x) { return x.total === 0 ? '非課税' : x.wari === 0 ? '均等割のみ' : '課税'; };
      [
        ['給与所得', r.kyuyoShotoku, p.kyuyoShotoku],
        ['所得控除の合計', r.kojo, p.kojo],
        ['課税総所得金額', r.taxable, p.taxable],
        ['所得割', r.wari, p.wari],
        ['均等割＋森林環境税', r.prefKinto + r.cityKinto + r.shinrin, p.prefKinto + p.cityKinto + p.shinrin],
        ['年税額', r.total, p.total],
      ].forEach(function (c) { row(cb, [c[0], yen(c[1]), yen(c[2]), diffCell(c[1], c[2])], c[0] === '年税額' ? 'total' : ''); });
      cb.lastChild.querySelectorAll('td, th').forEach(function (c) { c.style.fontWeight = '700'; });
      row(cb, ['判定', hk(r), hk(p), '']);
      var cap = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 4; td.style.textAlign = 'left'; td.style.whiteSpace = 'normal';
      var saved = p.total - r.total;
      td.textContent = saved > 0 ? '令和9年度の改正で、年税額が ' + yen(saved) + ' 少なくなります。' : saved < 0 ? '令和9年度の制度のほうが年税額が ' + yen(-saved) + ' 多くなります。' : 'この入力では、年税額は令和8年度の制度と同じです。';
      cap.appendChild(td);
      cb.appendChild(cap);
    } else {
      var tr2 = document.createElement('tr');
      var td2 = document.createElement('td');
      td2.colSpan = 4; td2.style.textAlign = 'left';
      td2.textContent = '給与の収入金額を入れると比べます。';
      tr2.appendChild(td2); cb.appendChild(tr2);
    }
  }

  // --- 「くわしく入れる」の summary（入力の状態。控除が付くかどうかは結果の「途中の計算」で見る） ---
  var setText = window.ScreenParts.setText, optText = window.ScreenParts.optText;
  function updateSummaries(d) {
    var hoken = ['newIppan', 'oldIppan', 'kaigo', 'newNenkin', 'oldNenkin'].some(function (k) { return d.seimei[k] > 0; }) ||
      d.jishin.jishin > 0 || d.jishin.oldLong > 0;
    setText('sum-shokibo', d.shokibo > 0 ? yen(d.shokibo) : '入力なし');
    setText('sum-hoken', hoken ? '入力あり' : '入力なし');
    setText('sum-spouse', d.spouse.has ? 'あり' : 'なし');
    setText('sum-rel', d.relatives.length ? d.relatives.length + ' 人を入力' : '0 人');
    var self = [];
    if (d.self.shogai !== 'none') self.push(optText($('self-shogai')));
    if (d.self.kafu !== 'none') self.push(optText($('self-kafu')));
    if (d.self.kinro) self.push('勤労学生');
    if (d.self.minor) self.push('未成年者');
    if (d.self.seikatsuhogo) self.push('生活保護');
    setText('sum-self', self.length ? self.join('・') + 'を選択' : 'なし');
    setText('sum-jutaku', d.jutaku.amount > 0 ? yen(d.jutaku.amount) : 'なし');
    setText('sum-city', d.city.custom ? '入力した値で計算' : '標準の値');
  }

  // --- 固定バー（SCREEN.md 1.1・D59）: 結果が出たあと、結果の数字が画面の外にあるときだけ上端に出す（../lib/screen.js） ---
  var setBar = window.ScreenParts.fixbar();

  // 入力欄から離れたときの change でも呼ばれるので、中身が同じなら描き直さない
  var saveTimer = null, lastSig = '';
  function update() {
    var sig = JSON.stringify(J.normalizeInput(state));
    if (sig === lastSig) return;
    lastSig = sig;
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { store.set(DRAFT, J.normalizeInput(state)); }, 300);
  }
  function renderNow() {
    lastSig = JSON.stringify(J.normalizeInput(state));
    render();
  }

  form.addEventListener('input', function (e) {
    if (!e.target.dataset.k) return;
    readField(e.target);
    updateYomi();
    updateUi();
    update();
  });
  form.addEventListener('change', function (e) {
    if (!e.target.dataset.k) return;
    readField(e.target);
    if (e.target.id === 'city-shitei' || e.target.id === 'city-custom') {
      state = J.normalizeInput(state);
      fillForm();
    }
    updateUi();
    update();
  });
  $('city-reset').addEventListener('click', function () {
    state.city.custom = false;
    state = J.normalizeInput(state);
    fillForm();
    update();
  });

  // --- 年末調整の計算の入力を使う ---
  $('from-nenmatsu').addEventListener('click', function () {
    var nen = store.get(NENMATSU_DRAFT, null);
    if (!nen || !nen.income) { $('nenmatsu-msg').textContent = 'この端末には、年末調整の計算の入力が保存されていません。'; return; }
    if (hasInput() && !window.confirm('今の入力内容を、年末調整の計算の入力で置き換えます（市区町村の設定はそのまま）。よろしいですか？')) return;
    state = J.fromNenmatsu(nen, state);
    fillForm();
    update();
    $('nenmatsu-msg').textContent = '年末調整の計算の入力を読み込みました（給与の収入 ' + yomi(state.income) + '）。';
  });

  // --- ファイルへの書き出し・読み込み（D31） ---
  function hasInput() {
    var d = J.normalizeInput(state), blank = J.normalizeInput({});
    return JSON.stringify(d) !== JSON.stringify(blank);
  }
  function fileMsg(t) { $('file-msg').textContent = t; }

  $('export').addEventListener('click', function () {
    var data = J.toExportFile(state);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var dt = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = J.TOOL_ID + '-backup-' + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + '.json';
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    fileMsg('書き出しました（' + a.download + '）。年収や家族の情報が入っているので、取り扱いにご注意ください。');
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
      var res = J.fromExportFile(obj);
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
    state = J.normalizeInput({});
    store.remove(DRAFT);
    fillForm();
    renderNow();
    fileMsg('入力を消しました。');
  });

  // --- 制度の確認日（一定期間たったら注意） ---
  (function () {
    var c = JV.CHECKED.split('-');
    $('asof-date').textContent = c[0] + '年' + (+c[1]) + '月' + (+c[2]) + '日';
    var now = new Date();
    var months = (now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]);
    if (months >= JV.STALE_MONTHS) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode('。確認日から1年以上たっています。制度が変わっていないか、お住まいの市区町村の最新の案内をご確認ください'));
    }
  })();

  fillForm();
  renderNow();
  document.documentElement.classList.remove('js-loading');
})();
