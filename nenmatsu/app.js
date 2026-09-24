// ===========================
// 年末調整の計算（令和8年分）— 画面の制御
// 計算は ../lib/nenmatsu.js（純粋関数）、制度の値は ../lib/tax2026.js にだけ置く
// ===========================
(function () {
  'use strict';

  var N = window.Nenmatsu;
  var TAX = window.TaxValues;
  var CUR = TAX.CURRENT, PREV = TAX.PREVIOUS;

  // --- ブラウザへの保存（README「ツールを追加するとき」12） ---
  // キーは必ず "seido-keisan_" で始める。全ツールが同じオリジンで localStorage を共有しているため
  var KEY_PREFIX = 'seido-keisan_';
  var DRAFT = 'nenmatsu_draft';
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
  var state = N.normalizeInput(store.get(DRAFT, {}));

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

  function fillForm() {
    form.querySelectorAll('[data-k]').forEach(function (el) {
      var v = getPath(state, el.dataset.k);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'number') el.value = v ? String(v) : '';
      else el.value = v;
    });
    renderRels();
    updateYomi();
    updateSpouseUi();
  }

  function readField(el) {
    var v = el.type === 'checkbox' ? el.checked : el.value;
    setPath(state, el.dataset.k, v);
  }

  function updateYomi() {
    form.querySelectorAll('output.yomi').forEach(function (o) {
      var input = $(o.htmlFor.value || o.getAttribute('for'));
      o.textContent = input && input.value ? '（' + yomi(Number(input.value)) + '）' : '';
    });
  }

  function updateSpouseUi() {
    $('sp-block').hidden = !state.spouse.has;
    $('sp-amount-label').textContent = state.spouse.incomeType === 'shotoku' ? '配偶者の合計所得金額' : '配偶者の1年間の給与の収入金額';
  }

  // --- 扶養親族・特定親族の行 ---
  var AGE_OPTIONS = [
    ['u16', '16歳未満'],
    ['16-18', '16〜18歳'],
    ['19-22', '19〜22歳'],
    ['23-69', '23〜69歳'],
    ['70', '70歳以上'],
    ['70dokyo', '70歳以上（同居老親等）'],
  ];
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
      amt.appendChild(document.createTextNode(p.incomeType === 'shotoku' ? '合計所得金額（円）' : '1年間の給与の収入（円）'));
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
      state = N.normalizeInput(state);
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

  function render() {
    var d = N.normalizeInput(state);
    var r = N.calc(d, CUR);
    var p = N.calc(d, PREV);
    var msgs = [];
    var main = $('result-main');
    main.className = 'result-main';

    if (!r.ok) {
      msgs.push(r.message);
      $('r-lead').textContent = 'このツールでは計算できません';
      $('r-big').textContent = '対象外';
      $('r-detail').textContent = '';
    } else if (!d.income) {
      $('r-lead').textContent = '給与の収入金額を入れると計算します';
      $('r-big').textContent = '—';
      $('r-detail').textContent = '';
    } else {
      if (!d.withheld) {
        $('r-lead').textContent = '年調年税額（1年間の所得税と復興特別所得税）';
        $('r-big').textContent = yen(r.nenzei);
        $('r-detail').textContent = '源泉徴収された税額を入れると、戻るか足りないかを出します。';
      } else if (r.diff > 0) {
        main.classList.add('is-refund');
        $('r-lead').textContent = '年末調整で';
        $('r-big').textContent = '戻る見込み ' + yen(r.diff);
        $('r-detail').textContent = '源泉徴収された ' + yen(d.withheld) + ' − 年調年税額 ' + yen(r.nenzei);
      } else if (r.diff < 0) {
        main.classList.add('is-short');
        $('r-lead').textContent = '年末調整で';
        $('r-big').textContent = '足りない見込み ' + yen(-r.diff);
        $('r-detail').textContent = '年調年税額 ' + yen(r.nenzei) + ' − 源泉徴収された ' + yen(d.withheld) + '（12月の給与などから差し引かれます）';
      } else {
        $('r-lead').textContent = '年末調整で';
        $('r-big').textContent = '過不足なし';
        $('r-detail').textContent = '年調年税額 ' + yen(r.nenzei);
      }
      if (r.jutakuLeft > 0) msgs.push('住宅ローン控除のうち ' + yen(r.jutakuLeft) + ' は所得税から引ききれませんでした（住民税から引かれる場合があります）。');
      if (r.choseiMaybe) msgs.push('給与が850万円を超え、23歳未満の扶養親族か特別障害者がいるため「所得金額調整控除」の対象になる可能性があります。このツールでは計算に入れていないので、実際の税額はこれより少なくなることがあります。');
    }

    // 配偶者の収入を入れたときだけ、社会保険の加入判定（shaho-check）への導線を出す
    $('to-shaho').hidden = !(r.ok && d.income && d.spouse.has && d.spouse.amount > 0);

    // 「くわしく入れる」の summary に今の状態を出す（SCREEN.md 1.1 の 4）
    updateSummaries(d);
    // 固定バーの文言は結果の大きな数字と同じ。年調年税額だけのときは名前を付ける
    fixbarText = !r.ok || !d.income ? '' : d.withheld ? $('r-big').textContent : '年調年税額 ' + yen(r.nenzei);
    updateBar();

    var box = $('msgs');
    box.textContent = '';
    msgs.forEach(function (m) { var p0 = document.createElement('p'); p0.textContent = m; box.appendChild(p0); });
    box.hidden = msgs.length === 0;

    // 途中の計算
    var tb = $('steps').tBodies[0];
    tb.textContent = '';
    (r.steps || []).forEach(function (s) {
      var th = document.createElement('span');
      th.textContent = s.label;
      var rule = document.createElement('span');
      rule.className = 'rule';
      rule.textContent = s.rule;
      var frag = document.createDocumentFragment();
      frag.appendChild(th); frag.appendChild(rule);
      var cls = s.sub ? 'sub' : (s.key === 'nenzei' || s.key === 'kojo' || s.key === 'taxable') ? 'total' : '';
      row(tb, [frag, yen(s.amount)], cls);
    });
    if (r.ok && d.withheld) {
      row(tb, [r.diff >= 0 ? '戻る見込み（源泉徴収された税額 − 年調年税額）' : '足りない見込み（年調年税額 − 源泉徴収された税額）', yen(Math.abs(r.diff))], 'total');
    }

    // 親族ごとの判定
    var list = $('rel-list');
    list.textContent = '';
    var lines = r.ok ? r.relatives.lines : [];
    lines.forEach(function (l, i) {
      var li = document.createElement('li');
      var parts = [l.label + '：所得 ' + yen(l.shotoku) + '・' + l.note];
      if (l.fuyo) parts.push('扶養控除 ' + yen(l.fuyo));
      if (l.tokutei) parts.push('特定親族特別控除 ' + yen(l.tokutei));
      if (l.shogai) parts.push('障害者控除 ' + yen(l.shogai));
      li.textContent = parts.join('・');
      list.appendChild(li);
      var note = document.querySelector('[data-note="' + i + '"]');
      if (note) note.textContent = '→ ' + l.note + (l.fuyo ? '（扶養控除 ' + yen(l.fuyo) + '）' : '') + (l.tokutei ? '（特定親族特別控除 ' + yen(l.tokutei) + '）' : '');
    });
    $('rel-detail').hidden = lines.length === 0;
    if (!r.ok) document.querySelectorAll('[data-note]').forEach(function (n) { n.textContent = ''; });

    // 令和7年分との比較
    var cb = $('cmp').tBodies[0];
    cb.textContent = '';
    if (r.ok && p.ok && d.income) {
      var get = function (x, k) { var s = x.steps.find(function (t) { return t.key === k; }); return s ? s.amount : 0; };
      var diffCell = function (a, b) { var v = a - b; return v === 0 ? '0円' : (v > 0 ? '+' : '−') + yen(Math.abs(v)); };
      [
        ['給与所得控除後の金額', r.kyuyoShotoku, p.kyuyoShotoku],
        ['基礎控除', get(r, 'kiso'), get(p, 'kiso')],
        ['配偶者（特別）控除', get(r, 'haigusha'), get(p, 'haigusha')],
        ['扶養控除＋特定親族特別控除', get(r, 'fuyo') + get(r, 'tokutei'), get(p, 'fuyo') + get(p, 'tokutei')],
        ['生命保険料控除', get(r, 'seimei'), get(p, 'seimei')],
        ['所得控除の合計', r.kojo, p.kojo],
        ['課税給与所得金額', r.taxable, p.taxable],
        ['年調年税額', r.nenzei, p.nenzei],
      ].forEach(function (c) { row(cb, [c[0], yen(c[1]), yen(c[2]), diffCell(c[1], c[2])], c[0] === '年調年税額' ? 'total' : ''); });
      var tr = cb.lastChild;
      tr.querySelectorAll('td, th').forEach(function (c) { c.style.fontWeight = '700'; });
      var cap = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 4;
      td.style.textAlign = 'left';
      td.style.whiteSpace = 'normal';
      var saved = p.nenzei - r.nenzei;
      td.textContent = saved > 0 ? '令和8年分の改正で、年税額が ' + yen(saved) + ' 少なくなります。' : saved < 0 ? '令和8年分の制度のほうが年税額が ' + yen(-saved) + ' 多くなります。' : 'この入力では、年税額は令和7年分の制度と同じです。';
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
  function setText(id, t) { var e = $(id); if (e.textContent !== t) e.textContent = t; }
  function optText(sel) { return sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : ''; }
  function updateSummaries(d) {
    var hoken = ['newIppan', 'oldIppan', 'kaigo', 'newNenkin', 'oldNenkin'].some(function (k) { return d.seimei[k] > 0; }) ||
      d.jishin.jishin > 0 || d.jishin.oldLong > 0;
    setText('sum-hoken', hoken ? '入力あり' : '入力なし');
    setText('sum-shokibo', d.shokibo > 0 ? yen(d.shokibo) : '入力なし');
    setText('sum-spouse', d.spouse.has ? 'あり' : 'なし');
    setText('sum-rel', d.relatives.length ? d.relatives.length + ' 人を入力' : '0 人');
    var self = [];
    if (d.self.shogai !== 'none') self.push(optText($('self-shogai')));
    if (d.self.kafu !== 'none') self.push(optText($('self-kafu')));
    if (d.self.kinro) self.push('勤労学生');
    setText('sum-self', self.length ? self.join('・') + 'を選択' : 'なし');
    setText('sum-jutaku', d.jutaku > 0 ? yen(d.jutaku) : 'なし');
  }

  // --- 固定バー（SCREEN.md 1.1・D59）: 結果が出たあと、結果の数字が画面の外にあるときだけ上端に出す ---
  // 読み込み時は hidden（位置は fixed なのでレイアウトはずれない）。スクリーンリーダーには最初に出たときの 1 回だけ読ませる
  var fixbar = $('fixbar'), fixbarText = '', resultInView = true, barAnnounced = false;
  function updateBar() {
    var show = !!fixbarText && !resultInView;
    if (show && !barAnnounced) {
      barAnnounced = true;
      setText('fixbar-text', '');
      fixbar.hidden = false;
      // 見えるようにしてから文字を入れると読み上げられる。そのあとは読み上げを止める（結果の aria-live と重ねない）
      setTimeout(function () { setText('fixbar-text', fixbarText); setTimeout(function () { fixbar.setAttribute('aria-live', 'off'); }, 1000); }, 50);
      return;
    }
    setText('fixbar-text', fixbarText);
    fixbar.hidden = !show;
  }
  if ('IntersectionObserver' in window) {
    // バーの高さ（44px）の分だけ上を狭めて、バーに隠れている結果は「画面の外」とみなす
    new IntersectionObserver(function (es) {
      resultInView = es[es.length - 1].isIntersecting;
      updateBar();
    }, { rootMargin: '-44px 0px 0px 0px' }).observe($('result-main'));
  }
  $('fixbar-link').addEventListener('click', function (e) {
    e.preventDefault();
    var card = $('result-card');
    card.scrollIntoView({ block: 'start' });   // style.css の scroll-margin-top でバーの下に見出しが来る
    try { card.focus({ preventScroll: true }); } catch (err) { card.focus(); }
  });

  // 入力欄から離れたときの change でも呼ばれるので、中身が同じなら描き直さない
  // （描き直すと結果の表が作り直されてスクロール位置がずれ、直後のボタンの押下が外れることがある）
  var saveTimer = null, lastSig = '';
  function update() {
    var sig = JSON.stringify(N.normalizeInput(state));
    if (sig === lastSig) return;
    lastSig = sig;
    render();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { store.set(DRAFT, N.normalizeInput(state)); }, 300);
  }

  function renderNow() {
    lastSig = JSON.stringify(N.normalizeInput(state));
    render();
  }

  form.addEventListener('input', function (e) {
    if (!e.target.dataset.k) return;
    readField(e.target);
    if (e.target.closest('#sp-block') || e.target.id === 'sp-has') updateSpouseUi();
    updateYomi();
    update();
  });
  form.addEventListener('change', function (e) {
    if (!e.target.dataset.k) return;
    readField(e.target);
    updateSpouseUi();
    update();
  });

  // --- ファイルへの書き出し・読み込み（D31） ---
  function hasInput() {
    var d = N.normalizeInput(state), blank = N.normalizeInput({});
    return JSON.stringify(d) !== JSON.stringify(blank);
  }
  function fileMsg(t) { $('file-msg').textContent = t; }

  $('export').addEventListener('click', function () {
    var data = N.toExportFile(state);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var dt = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = 'nenmatsu-' + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + '.json';
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
      var res = N.fromExportFile(obj);
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
    state = N.normalizeInput({});
    store.remove(DRAFT);
    fillForm();
    renderNow();
    fileMsg('入力を消しました。');
  });

  // --- 制度の確認日（一定期間たったら注意） ---
  (function () {
    var c = TAX.CHECKED.split('-');
    $('asof-date').textContent = c[0] + '年' + (+c[1]) + '月' + (+c[2]) + '日';
    var now = new Date();
    var months = (now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]);
    if (months >= TAX.STALE_MONTHS) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode('。確認日から1年以上たっています。制度が変わっていないか国税庁の最新の案内をご確認ください'));
    }
  })();

  fillForm();
  renderNow();
  document.documentElement.classList.remove('js-loading');
})();
