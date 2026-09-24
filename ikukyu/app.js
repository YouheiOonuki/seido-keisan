// ===========================
// 育休・産休の給付金の計算 — 画面の制御
// 計算は ../lib/ikukyu.js（純粋関数）、制度の値は ../lib/ikukyu-values.js にだけ置く
// ===========================
(function () {
  'use strict';

  var I = window.Ikukyu;
  var IV = window.IkukyuValues;

  // --- ブラウザへの保存（README「ツールを追加するとき」12） ---
  // キーは必ず "seido-keisan_" で始める。全ツールが同じオリジンで localStorage を共有しているため
  var KEY_PREFIX = 'seido-keisan_';
  var DRAFT = 'ikukyu_draft';
  var store = {
    get: function (name, fallback) {
      try {
        var v = localStorage.getItem(KEY_PREFIX + name);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
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
  var state = I.normalizeInput(store.get(DRAFT, {}));

  function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円'; }
  function yomi(n) {
    n = Number(n) || 0;
    if (n < 10000) return n ? n.toLocaleString('ja-JP') + '円' : '';
    var m = Math.floor(n / 10000), r = n % 10000;
    return m.toLocaleString('ja-JP') + '万' + (r ? r.toLocaleString('ja-JP') : '') + '円';
  }
  function jp(n) { return I.jp(n); }
  function md(n) { var s = I.fmt(n).split('-'); return (+s[1]) + '/' + (+s[2]); }

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
      else if (el.type === 'number') el.value = v ? String(v) : (el.dataset.k === 'customRate' ? String(v) : '');
      else el.value = v === undefined || v === null ? '' : String(v);
    });
    updateYomi();
    updateUi();
  }
  function readField(el) { setPath(state, el.dataset.k, el.type === 'checkbox' ? el.checked : el.value); }
  function updateYomi() {
    form.querySelectorAll('output.yomi').forEach(function (o) {
      var input = $(o.getAttribute('for'));
      o.textContent = input && input.value ? '（' + yomi(Number(input.value)) + '）' : '';
    });
  }
  function updateUi() {
    var mother = state.role === 'mother';
    document.querySelectorAll('.mother-only').forEach(function (el) { el.hidden = !mother; });
    document.querySelectorAll('.father-only').forEach(function (el) { el.hidden = mother; });
    $('papa-block').hidden = !state.papa.use;
    $('custom-rate-block').hidden = state.pref !== 'custom';
    $('jitan-block').hidden = !state.jitan.use;
    // 育休の期間の既定値を案内に出す
    var due = I.parseDate(state.dueDate), birth = I.parseDate(state.birthDate);
    var b = birth === null ? due : birth;
    if (b !== null) {
      $('leaveEnd-hint').textContent = '空なら子が1歳になる前日（' + jp(I.firstBirthday(b) - 1) + '）まで。';
      $('leaveStart-hint').textContent = state.papa.use ? '空なら産後パパ育休の翌日から。' : '空なら生まれた日（' + jp(b) + '）から。';
    }
  }

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
  function benefit(list, name, amount, lines, src) {
    var li = document.createElement('li');
    var head = document.createElement('p');
    head.className = 'b-head';
    var n = document.createElement('span'); n.textContent = name;
    var a = document.createElement('strong'); a.textContent = amount;
    head.appendChild(n); head.appendChild(a);
    li.appendChild(head);
    lines.forEach(function (t) { var p = document.createElement('p'); p.className = 'b-rule'; p.textContent = t; li.appendChild(p); });
    var s = document.createElement('p'); s.className = 'b-src';
    s.textContent = '根拠: ' + src + '（確認日 ' + checkedJp + '）';
    li.appendChild(s);
    list.appendChild(li);
  }
  function judge(id, ok, why, has) {
    var box = $(id);
    box.classList.toggle('is-hikazei', has && ok);
    box.querySelector('.judge-tag').textContent = has ? (ok ? '満たす' : '満たさない') : '—';
    box.querySelector('.judge-why').textContent = has ? why : '';
  }
  function clearTable(id) { var tb = $(id).tBodies[0]; tb.textContent = ''; return tb; }

  var checkedJp = (function () { var c = IV.CHECKED.split('-'); return c[0] + '年' + (+c[1]) + '月' + (+c[2]) + '日'; })();

  function render() {
    var r = I.calc(state);
    // 「くわしく入れる」の summary に今の状態を出す（SCREEN.md 1.1 の 4）
    updateSummaries(I.normalizeInput(state));
    // 固定バーの文言は結果の大きな数字に名前を付けたもの
    setBar(r.ok ? '受け取る給付の合計 ' + yen(r.totalWithIchiji) : '');
    var box = $('msgs');
    box.textContent = '';
    var list = $('benefits');
    list.textContent = '';
    ['net', 'sched', 'periods', 'steps'].forEach(clearTable);
    $('exempt').textContent = ''; $('net-note').textContent = '';
    $('jitan-result').hidden = true;

    if (!r.ok) {
      $('r-lead').textContent = r.need === 'due' ? '出産予定日と毎月の給与を入れると計算します' : '毎月の給与を入れると計算します';
      $('r-big').textContent = '—';
      $('r-detail').textContent = '';
      box.hidden = true;
      judge('j-days', false, '', false); judge('j-spouse', false, '', false);
      $('period-detail').hidden = true;
      return;
    }
    $('period-detail').hidden = !(r.leave && r.leave.periods.length);

    var msgs = r.messages.concat(r.notes);
    msgs.forEach(function (m) { var p = document.createElement('p'); p.textContent = m; box.appendChild(p); });
    box.hidden = msgs.length === 0;

    // 合計
    $('r-lead').textContent = '受け取る給付の合計（目安）';
    $('r-big').textContent = yen(r.totalWithIchiji);
    var parts = [];
    if (r.teate) parts.push('出産手当金 ' + yen(r.teate.total));
    parts.push('出産育児一時金 ' + yen(r.ichiji.total));
    if (r.papa) parts.push('出生時育児休業給付金 ' + yen(r.papa.amount));
    if (r.leave) parts.push('育児休業給付金 ' + yen(r.leave.total));
    if (r.shien.ok) parts.push('出生後休業支援給付金 ' + yen(r.shien.amount));
    $('r-detail').textContent = parts.join(' ＋ ') + '。どれも非課税です。ほかに社会保険料の免除が 約' + yen(r.exemptTotal) + '。';

    // 給付ごと
    if (r.teate) {
      var tp = r.teate.period;
      benefit(list, '出産手当金（健康保険）', yen(r.teate.total), [
        '1日あたり: ' + r.teate.daily.rule,
        '期間: ' + jp(tp.start) + '〜' + jp(tp.end) + '（' + tp.days + '日。出産日は産前に入り、予定日より遅れた日数' + (tp.late ? '（' + tp.late + '日）' : '') + 'も支給）。' + yen(r.teate.daily.daily) + ' × ' + tp.days + '日',
        r.born ? '' : '予定日に生まれたとして計算しています。予定日より早く生まれると産前の日数が減り、遅れると増えます。',
      ].filter(Boolean), '健康保険法102条・99条2項、協会けんぽ「出産手当金」');
    }
    benefit(list, r.mother ? '出産育児一時金（健康保険）' : '出産育児一時金（配偶者の健康保険、または家族出産育児一時金）', yen(r.ichiji.total), [
      '1児につき ' + yen(r.ichiji.per) + (r.ichiji.babies > 1 ? ' × ' + r.ichiji.babies + '人' : '') + '（' + (state.sanka ? '産科医療補償制度の加入機関で在胎週数22週以降の出産' : '産科医療補償制度に入っていない機関、または22週未満の出産') + '）',
      '直接支払制度を使うと、健康保険から病院へ直接支払われます。出産費用が一時金より少なければ、差額を申請して受け取れます。',
    ], '健康保険法101条・同施行令36条、協会けんぽ「出産育児一時金」');
    if (r.papa) {
      benefit(list, '出生時育児休業給付金（産後パパ育休）', yen(r.papa.amount), [
        jp(r.papa.start) + '〜' + jp(r.papa.end) + '（' + r.papa.days + '日。給付は28日まで）',
        '休業開始時賃金日額 ' + yen(r.wage.daily) + ' × ' + r.papa.paidDays + '日 × 67%',
      ], '雇用保険法61条の8、厚生労働省リーフレット（2026年8月1日改訂版）');
    }
    if (r.leave) {
      var pd = r.leave.periods;
      benefit(list, '育児休業給付金（雇用保険）', yen(r.leave.total), [
        jp(r.leave.start) + '〜' + jp(r.leave.payEnd) + '、支給単位期間 ' + pd.length + '回分（1回はほぼ1か月）',
        '1か月（30日）あたり: ' + yen(r.wage.daily) + ' × 30日 × 67% ＝ ' + yen(r.leave.monthlyHigh) + '（180日目まで）、× 50% ＝ ' + yen(r.leave.monthlyLow) + '（181日目から）',
        '休業開始時賃金日額 ＝ 休業前6か月の給与 ' + yen(r.wage6) + ' ÷ 180。上限 ' + yen(IV.koyo.dailyMax) + '・下限 ' + yen(IV.koyo.dailyMin) + '（' + jp(I.parseDate(IV.koyo.validTo)) + 'までの額）',
      ].filter(Boolean), '雇用保険法61条の7・17条、厚生労働省リーフレット・支給限度額の案内（令和8年8月1日から）');
    }
    benefit(list, '出生後休業支援給付金（13%の上乗せ）', r.shien.ok ? yen(r.shien.amount) : '対象外', r.shien.ok ? [
      '休業開始時賃金日額 ' + yen(r.wage.daily) + ' × ' + r.shien.days + '日（28日まで） × 13%',
      '67%と合わせて80%。給付は非課税で社会保険料も免除されるため、その期間は手取りでほぼ10割に相当します（賃金日額の上限を超える人は10割に届きません）。',
    ] : [r.shien.daysOk ? r.shien.whySpouse : r.shien.whyDays], '雇用保険法61条の10、厚生労働省リーフレット 13〜16ページ');

    // 出生後休業支援給付金の要件
    judge('j-days', r.shien.daysOk, r.shien.whyDays, true);
    judge('j-spouse', r.shien.spouseOk, r.shien.whySpouse, true);

    // 手取り
    var nt = clearTable('net');
    if (r.leave) {
      if (r.tedori.before) row(nt, ['休業前の手取り（入力）', yen(r.tedori.before)]);
      row(nt, ['育児休業給付金（67%の期間・30日分）', yen(r.leave.monthlyHigh)]);
      if (r.shien.ok) row(nt, ['＋ 出生後休業支援給付金（13%。28日分まで）', '+' + yen(r.shien.amount)]);
      row(nt, ['社会保険料（免除）・所得税（非課税）', '0円']);
      row(nt, ['住民税（前の年の所得にかかる）', state.juminzei ? '−' + yen(state.juminzei) : '入力なし']);
      var tr = row(nt, ['休業中の手取りの目安（67%の期間）', yen(r.tedori.high)], 'total');
      tr.querySelectorAll('td, th').forEach(function (c) { c.style.fontWeight = '700'; });
      row(nt, ['休業中の手取りの目安（50%の期間）', yen(r.tedori.low)]);
      $('net-note').textContent = (r.tedori.ratio !== null ? '67%の期間の手取りは、休業前の手取りの約' + r.tedori.ratio + '%です。' : '休業前の手取りを入れると、割合を出します。') +
        '休業中は給与が出ないので雇用保険料もかかりません。住民税は、休業中は勤め先から請求されたり自分で納める形に切り替わったりします（勤め先に確認してください）。';
    }

    // 社会保険料の免除
    if (r.exempt.length) {
      var p0 = r.exempt[0].premium;
      $('exempt').textContent = r.exempt[0].label + '〜' + r.exempt[r.exempt.length - 1].label + ' の ' + r.exempt.length + 'か月、健康保険・厚生年金の保険料（本人分）が免除される見込みです。合計 約' + yen(r.exemptTotal) +
        '（1か月 約' + yen(p0.total) + '：健康保険 ' + yen(p0.kenpo) + (p0.shien ? '・子ども・子育て支援金 ' + yen(p0.shien) : '') + '・厚生年金 ' + yen(p0.kounen) + '。標準報酬月額 ' + yen(r.hyojun) + '・健康保険料率 ' + p0.rate + '%' + (p0.kaigo ? '＋介護 ' + p0.kaigo + '%' : '') + '）。' +
        '免除になるのは、休業を始めた月から、休業が終わる日の翌日がある月の前の月まで（月末に休んでいる月）と、同じ月の中で14日以上育休を取った月です。免除の間も、年金の記録は保険料を納めたものとして扱われます。賞与の保険料は、1か月を超える育休のときだけ免除されます。';
    } else {
      $('exempt').textContent = '入力した期間では、保険料が免除になる月はありません（月末に休んでいないか、同じ月の中の育休が14日未満です）。';
    }

    // 月ごとの表
    var sb = clearTable('sched');
    r.months.forEach(function (m) {
      var rc = m.receipts.map(function (p) { return p.name + ' ' + yen(p.amount); }).join('、');
      row(sb, [m.label, m.state, m.exempt ? '免除' : '約' + yen(m.premium), rc || '—'], m.receipts.length ? 'has-pay' : '');
    });

    // 支給単位期間
    var pb = clearTable('periods');
    if (r.leave) r.leave.periods.forEach(function (p) {
      var rate = p.d50 === 0 ? '67%' : p.d67 === 0 ? '50%' : '67%（' + p.d67 + '日）・50%（' + p.d50 + '日）';
      row(pb, [String(p.no), md(p.start) + '〜' + md(p.end), p.days + '日', rate, yen(p.amount)]);
    });

    // 時短
    if (r.jitan) {
      $('jitan-result').hidden = false;
      var jt = r.jitan;
      $('jitan-text').textContent = (jt.amount
        ? '時短勤務の給与 ' + yen(jt.salary) + ' に対して、育児時短就業給付金は 毎月 約' + yen(jt.amount) + '（' + jt.rule + '）。給与と合わせて ' + yen(jt.salary + jt.amount) + '（給与は額面、給付は非課税）。'
        : jt.reason) +
        ' 時短前の賃金月額は ' + yen(jt.base) + '（休業開始時賃金日額 × 30）。子が2歳になる前の月まで、月ごとに支給されます。' +
        (r.leave ? ' 比べると、育休を続けた場合の給付（50%の期間）は 毎月 ' + yen(r.leave.monthlyLow) + ' です（1歳以降の育休の延長は、保育所に入れないときなどに限られます）。' : '');
    }

    // 途中の計算
    var st = clearTable('steps');
    r.steps.forEach(function (s) {
      var th = document.createElement('span'); th.textContent = s.label;
      var rule = document.createElement('span'); rule.className = 'rule'; rule.textContent = s.rule;
      var frag = document.createDocumentFragment(); frag.appendChild(th); frag.appendChild(rule);
      row(st, [frag, s.amount === null ? s.days + '日' : yen(s.amount)]);
    });
  }

  // --- 「くわしく入れる」の summary（入力の状態） ---
  var setText = window.ScreenParts.setText, optText = window.ScreenParts.optText;
  function updateSummaries(d) {
    var mother = d.role === 'mother';
    setText('sum-kyuyo', d.hyojun || d.wage6 || (mother && d.under12) ? '入力あり' : '入力なし');
    var birth = [optText($('babies'))];
    if (d.birthDate) birth.push('生まれた日 ' + jp(I.parseDate(d.birthDate)));
    if (!d.sanka) birth.push('産科医療補償制度に入っていない');
    setText('sum-birth', birth.join('・'));
    setText('sum-leave', d.leaveEnd || (!mother && (d.leaveStart || d.papa.use)) ? '入力あり' : '入力なし');
    setText('sum-spouse', optText($('spouse')));
    var net = [d.pref === 'custom' ? '健康保険組合など（' + d.customRate + '%）' : optText($('pref'))];
    if (d.over40) net.push('40歳以上');
    if (d.juminzei || d.tedori) net.push('住民税・手取りの入力あり');
    setText('sum-net', net.join('・'));
    setText('sum-jitan', d.jitan.use ? (d.jitan.salary ? yen(d.jitan.salary) : 'あり') : 'なし');
  }

  // --- 固定バー（SCREEN.md 1.1・D59）: 結果が出たあと、結果の数字が画面の外にあるときだけ上端に出す（../lib/screen.js） ---
  var setBar = window.ScreenParts.fixbar();

  // 中身が同じなら描き直さない
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

  form.addEventListener('input', function (e) {
    if (!e.target.dataset.k) return;
    readField(e.target); updateYomi(); updateUi(); update();
  });
  form.addEventListener('change', function (e) {
    if (!e.target.dataset.k) return;
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
    fileMsg('書き出しました（' + a.download + '）。給与や出産予定日が入っているので、取り扱いにご注意ください。');
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

  // --- 制度の確認日（一定期間たったら・上限額の改定日を過ぎたら注意） ---
  (function () {
    var c = IV.CHECKED.split('-');
    $('asof-date').textContent = checkedJp;
    var now = new Date();
    var months = (now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]);
    var today = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
    if (months >= IV.STALE_MONTHS || today > IV.koyo.validTo) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode('。確認日から時間がたっています（育児休業給付の上限額は毎年8月1日に改定されます）。最新の額は厚生労働省・ハローワークの案内をご確認ください'));
    }
  })();

  fillForm();
  renderNow();
  document.documentElement.classList.remove('js-loading');
})();
