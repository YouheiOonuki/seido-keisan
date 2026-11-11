// ===========================
// 人生の数字を 1 枚に（/seido-keisan/lifeplan/、yorozu-plans 企画書 102 の枝 1）— 画面の制御
// 計算は ../lib/lifeplan.js（住宅ローンは ../lib/loan.js、年金は ../lib/kuriage.js、子の学年は ../lib/gakunen.js、税と社会保険は ../lib/take-home.js、医療費控除は ../lib/iryohi.js、制度の改定は ../lib/kaitei.js、育休・産休の給付は ../lib/ikukyu.js をそのまま呼ぶ）。数をここで作らない
// 入力は送信しない。「この端末に保存」を押したときだけ、家庭の書類の箱（../lib/box.js、localStorage）の区画 lifeplan に入力を置く（企画書 102 の枝 7）
// ===========================
(function () {
  'use strict';

  var L = window.Lifeplan;
  var SP = window.ScreenParts;
  var $ = function (id) { return document.getElementById(id); };
  var page = document.querySelector('main');
  var state = { pensionStart: 65, loan: {}, children: [{}, {}, {}] };
  var setBar = SP.fixbar();
  var SVG = 'http://www.w3.org/2000/svg';
  var B = window.Box;
  var lastRows = [], lastLayers = 0;
  var store = (function () { try { return window.localStorage; } catch (e) { return null; } })();

  function today() { var n = new Date(); return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() }; }
  function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円'; }
  function man(n) { var v = Math.round(n / 10000); return v.toLocaleString('ja-JP') + '万円'; }
  function yomi(n) {
    n = Number(n) || 0;
    if (n < 10000) return n ? n.toLocaleString('ja-JP') + '円' : '';
    var m = Math.floor(n / 10000), r = n % 10000;
    return m.toLocaleString('ja-JP') + '万' + (r ? r.toLocaleString('ja-JP') : '') + '円';
  }
  function setPath(obj, path, v) {
    var ks = path.split('.'), o = obj;
    for (var i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = v;
  }

  // --- 時間軸（SVG）: 横 0〜100 歳、住宅ローンの帯（元金と利息の 2 色）と年金の帯、今の年齢の縦の線 ---
  var W = 400, PAD_L = 4, PAD_R = 4, ROW_H = 44, GAP = 22, TOP = 30, KID_H = 14, KAI_H = 18;
  var STAGE_NAME = { elementary: '小学校', junior: '中学校', high: '高校', university: '大学' };
  var STAGE_SHORT = { elementary: '小', junior: '中', high: '高', university: '大' };
  function x(age) { return PAD_L + (W - PAD_L - PAD_R) * age / 101; }
  function el(name, attrs, text) {
    var e = document.createElementNS(SVG, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function draw(b) {
    var box = $('timeline');
    box.textContent = '';
    if (!b.ready) return;
    var layers = [];
    if (b.tax && b.tax.byAge.length) layers.push('tax');
    if (b.iryohi && b.iryohi.byAge.some(function (r) { return r.total > 0; })) layers.push('iryohi');
    if (b.loan && b.loan.byAge) layers.push('loan');
    if (b.pension) layers.push('pension');
    var kids = b.children || [];
    var kai = b.kaitei ? b.kaitei.byAge : [];
    var H = TOP + layers.length * (ROW_H + GAP) + kids.length * (KID_H + GAP) + (kai.length ? KAI_H + GAP : 0) + 18;
    var label = ['0〜100歳の時間軸。今の年齢 ' + b.input.age + '歳'];
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', class: 'tl' });
    var bw = (W - PAD_L - PAD_R) / 101;
    var max = 0;
    var val = function (k, r) { return k === 'loan' ? r.paid : (k === 'tax' || k === 'iryohi') ? r.total : r.annual; };
    // 医療費控除の軽くなる税は桁が小さいので、ほかの層と同じ物差しにせず、その行の中の最大で描く
    layers.forEach(function (k) { if (k !== 'iryohi') b[k].byAge.forEach(function (r) { max = Math.max(max, val(k, r)); }); });
    var maxIr = 0;
    if (layers.indexOf('iryohi') >= 0) b.iryohi.byAge.forEach(function (r) { maxIr = Math.max(maxIr, r.total); });
    var yNext = TOP;
    layers.forEach(function (k) {
      var y0 = yNext;
      yNext += ROW_H + GAP;
      var name = k === 'loan' ? '住宅ローンの返済' : k === 'tax' ? '税と社会保険' : k === 'iryohi' ? '医療費控除で軽くなる税' : '年金';
      svg.appendChild(el('text', { x: PAD_L, y: y0 - 5, class: 'tl-name' }, name));
      svg.appendChild(el('line', { x1: PAD_L, x2: W - PAD_R, y1: y0 + ROW_H, y2: y0 + ROW_H, class: 'tl-base' }));
      b[k].byAge.forEach(function (r) {
        if (k === 'tax') {
          var yy = y0 + ROW_H;
          [['si', 'tl-si'], ['incomeTax', 'tl-itax'], ['resident', 'tl-rtax']].forEach(function (p) {
            var hh = ROW_H * r[p[0]] / max;
            yy -= hh;
            svg.appendChild(el('rect', { x: x(r.age), y: yy, width: bw, height: hh, class: p[1] }));
          });
        } else if (k === 'iryohi') {
          if (!r.total) return;
          var hr = ROW_H * r.total / maxIr;
          svg.appendChild(el('rect', { x: x(r.age), y: y0 + ROW_H - hr, width: bw, height: hr, class: 'tl-iryohi' }));
        } else if (k === 'loan') {
          var hp = ROW_H * r.principal / max, hi = ROW_H * r.interest / max;
          svg.appendChild(el('rect', { x: x(r.age), y: y0 + ROW_H - hp, width: bw, height: hp, class: 'tl-principal' }));
          svg.appendChild(el('rect', { x: x(r.age), y: y0 + ROW_H - hp - hi, width: bw, height: hi, class: 'tl-interest' }));
        } else {
          var h = ROW_H * r.annual / max;
          svg.appendChild(el('rect', { x: x(r.age), y: y0 + ROW_H - h, width: bw, height: h, class: 'tl-pension' }));
        }
      });
      var first = b[k].byAge[0], last = b[k].byAge[b[k].byAge.length - 1];
      var full = k === 'loan' ? first.paid : (k === 'tax' || k === 'iryohi') ? first.total : (b[k].byAge[1] || first).annual;
      var t = k === 'tax' ? '年' + man(full) + '（手取り 年' + man(first.net) + '）' : k === 'iryohi' ? '軽くなる税 年' + yen(full) : first.age + '歳から 年' + man(full);
      var tx = Math.min(x(first.age), W - PAD_R - 7 * t.length);
      svg.appendChild(el('text', { x: tx, y: y0 + ROW_H + 14, class: 'tl-num' }, t));
      label.push(name + ': ' + first.age + '〜' + last.age + '歳、年' + (k === 'iryohi' ? yen(full) : man(full)) + (k === 'tax' ? '（手取り 年' + man(first.net) + '）' : ''));
    });
    // 子の学年: 1 人 1 行、小・中・高・大学の帯。高校の帯のうち就学支援金の対象の年数に縁取り
    kids.forEach(function (c) {
      var y0 = yNext;
      yNext += KID_H + GAP;
      var name = c.n + '人目の子';
      svg.appendChild(el('text', { x: PAD_L, y: y0 - 5, class: 'tl-name' }, name));
      var parts = [];
      c.bands.forEach(function (bd) {
        if (bd.to > bd.from) svg.appendChild(el('rect', { x: x(bd.from), y: y0, width: x(bd.to) - x(bd.from), height: KID_H, class: 'tl-' + bd.key }));
        parts.push(STAGE_SHORT[bd.key] + ' ' + bd.entryAge);
      });
      if (c.support.to > c.support.from) svg.appendChild(el('rect', { x: x(c.support.from), y: y0, width: x(c.support.to) - x(c.support.from), height: KID_H, class: 'tl-support' }));
      // 育休・産休の給付: 期間は 1 年ほどで帯にならないので、生まれた年の所に印 1 つ
      var ik = b.ikukyu && b.ikukyu.n === c.n ? b.ikukyu : null;
      if (ik) svg.appendChild(el('circle', { cx: x(ik.pos), cy: y0 + KID_H / 2, r: 4, class: 'tl-ikukyu' }));
      var t = parts.join('　');
      svg.appendChild(el('text', { x: Math.max(PAD_L, Math.min(x(c.bands[0].from), W - PAD_R - 9 * t.length)), y: y0 + KID_H + 13, class: 'tl-num' }, t));
      label.push(name + ': 入学の年の親の年齢 ' + c.bands.map(function (bd) { return STAGE_NAME[bd.key] + ' ' + bd.entryAge + '歳'; }).join('、') +
        (ik ? '、育休・産休の給付の印 ' + ik.birthAge + '歳の年' : ''));
    });
    // 制度の改定: 1 行。年ごとに印 1 つ（その年の件数）。1 年の幅はスマホで 4px ほどで指で押せないので、
    // 時間軸の上の印は見せるだけにし、押すのは時間軸の下の年ごとのボタン（その年の項目の題と施行日、/kaitei/ へのリンク）
    if (kai.length) {
      var ky = yNext;
      yNext += KAI_H + GAP;
      svg.appendChild(el('text', { x: PAD_L, y: ky - 5, class: 'tl-name' }, '制度の改定'));
      kai.forEach(function (r) {
        svg.appendChild(el('rect', { x: x(r.age), y: ky, width: bw, height: KAI_H, class: 'tl-kai' }));
      });
      var kn = kai.reduce(function (s, r) { return s + r.items.length; }, 0);
      var kt = kn + '件（' + kai[0].age + (kai.length > 1 ? '〜' + kai[kai.length - 1].age : '') + '歳の年）';
      svg.appendChild(el('text', { x: Math.min(x(kai[0].age), W - PAD_R - 7 * kt.length), y: ky + KAI_H + 14, class: 'tl-num' }, kt));
      label.push('制度の改定: ' + kai.map(function (r) { return r.age + '歳の年 ' + r.items.length + '件'; }).join('、'));
    }
    // 目盛り（10 歳ごと）と今の年齢
    for (var a = 0; a <= 100; a += 10) svg.appendChild(el('text', a === 100 ? { x: W - PAD_R, y: H - 2, class: 'tl-tick tl-tick-end' } : { x: x(a), y: H - 2, class: 'tl-tick' }, String(a)));   // 100 は右端に寄せる（中央寄せだと右にはみ出して切れる）
    var nx = x(b.input.age) + bw / 2;
    svg.appendChild(el('line', { x1: nx, x2: nx, y1: 4, y2: H - 14, class: 'tl-now' }));
    svg.appendChild(el('text', { x: Math.min(nx + 3, W - 40), y: 11, class: 'tl-now-label' }, '今 ' + b.input.age + '歳'));
    svg.setAttribute('aria-label', label.join('。'));
    box.appendChild(svg);
    if (layers.indexOf('tax') >= 0) {
      var tg = document.createElement('p');
      tg.className = 'small tl-legend';
      tg.innerHTML = '<span class="sw sw-si"></span>社会保険料 <span class="sw sw-itax"></span>所得税 <span class="sw sw-rtax"></span>住民税';
      box.appendChild(tg);
    }
    if (layers.indexOf('loan') >= 0) {
      var lg = document.createElement('p');
      lg.className = 'small tl-legend';
      lg.innerHTML = '<span class="sw sw-principal"></span>元金 <span class="sw sw-interest"></span>利息 <span class="sw sw-pension"></span>年金';
      box.appendChild(lg);
    }
    if (kids.length) {
      var kg = document.createElement('p');
      kg.className = 'small tl-legend';
      kg.innerHTML = '<span class="sw sw-elementary"></span>小学校 <span class="sw sw-junior"></span>中学校 <span class="sw sw-high"></span>高校 <span class="sw sw-university"></span>大学 ' +
        '<span class="sw sw-support"></span>就学支援金の対象の期間（全日制の場合。<a href="../koko-mushoka/">高校無償化の計算</a>）' +
        (b.ikukyu ? ' <span class="sw sw-ikukyu"></span>育休・産休の給付' : '');
      box.appendChild(kg);
    }
    if (kai.length) {
      var kb = document.createElement('div');
      kb.className = 'kai-years';
      kai.forEach(function (r) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = r.age + '歳 ' + r.items.length + '件';
        btn.setAttribute('aria-controls', 'kai-detail');
        btn.addEventListener('click', function () { showKai(r); });
        kb.appendChild(btn);
      });
      box.appendChild(kb);
    }
  }

  function jdate(s) { var p = s.split('-'); return +p[0] + '年' + (+p[1]) + '月' + (+p[2]) + '日'; }
  function showKai(r) {
    var p = $('kai-detail');
    p.textContent = '';
    var h = document.createElement('p');
    h.textContent = r.age + '歳の年の制度の改定';
    p.appendChild(h);
    var ul = document.createElement('ul');
    r.items.forEach(function (it) {
      var li = document.createElement('li');
      li.textContent = jdate(it.date) + '　' + it.title;
      ul.appendChild(li);
    });
    p.appendChild(ul);
    var a = document.createElement('a');
    a.href = '../kaitei/';
    a.textContent = '制度の改定カレンダー';
    p.appendChild(a);
    p.hidden = false;
  }

  function render() {
    var b = L.build(state, today());
    var d = b.input;
    $('pensionStart-out').textContent = d.pensionStart + '歳';
    var loanOn = !!(b.loan && b.loan.byAge);
    $('s-loan').textContent = loanOn ? man(d.loan.principal) + '・' + d.loan.years + '年・' + d.loan.rate + '%' : 'なし';
    $('loan-msg').textContent = b.loan && b.loan.errors ? b.loan.errors.join(' ') : '';
    var kids = b.children || [];
    $('s-kids').textContent = d.children ? d.children.length + '人' : 'なし';
    page.querySelectorAll('.col-kids').forEach(function (c) { c.hidden = !kids.length; });
    var taxOn = !!(b.tax && b.tax.byAge.length);
    page.querySelectorAll('.col-tax').forEach(function (c) { c.hidden = !taxOn; });
    var irOn = !!(b.iryohi && b.iryohi.byAge.length);
    page.querySelectorAll('.col-iryohi').forEach(function (c) { c.hidden = !irOn; });
    $('iryohi-msg').textContent = d.iryohi === undefined ? '' : !taxOn ? '医療費控除の層は、年収を入れると出ます（64歳まで）。' :
      irOn && !b.iryohi.byAge.some(function (r) { return r.total > 0; }) ? 'この医療費では、医療費控除で軽くなる税はありません。' : '';
    var kaiOn = !!b.kaitei;
    page.querySelectorAll('.col-kai').forEach(function (c) { c.hidden = !kaiOn; });
    // 育休・産休: select は対象の子（1 歳になっていない子・これから生まれる子）と年収があるときだけ。前提の details と lib の注意は層が出ているときだけ
    $('f-ikukyu').hidden = !(b.ready && d.children && d.income !== undefined && L.ikukyuChild(d.children, today()));
    var ikOn = !!b.ikukyu;
    page.querySelectorAll('.col-ikukyu').forEach(function (c) { c.hidden = !ikOn; });
    $('d-ikukyu').hidden = !ikOn;
    var notes = $('ikukyu-notes');
    notes.textContent = '';
    if (ikOn) b.ikukyu.notes.forEach(function (s) { var li = document.createElement('li'); li.textContent = s; notes.appendChild(li); });
    var rik = $('r-ikukyu');
    rik.textContent = '';
    if (ikOn) {
      rik.appendChild(document.createTextNode((b.ikukyu.choice === 'leave' ? '育休の給付の目安' : '産休と育休の給付の目安') + ' 合計' + man(b.ikukyu.total) + '（子が1歳になるまで取った場合）'));
      var ia = document.createElement('a');
      ia.href = '../ikukyu/';
      ia.textContent = '育休・産休の計算';
      rik.appendChild(document.createTextNode(' '));
      rik.appendChild(ia);
    }
    $('kai-detail').hidden = true;
    $('income-msg').textContent = !b.tax ? '' : b.tax.error === 'over' ? '年収が2,000万円を超えると、税と社会保険の層は出せません（年末調整の対象外のため）。' :
      b.tax.error ? '税と社会保険の層は出せません。' : taxOn ? '' : '税と社会保険の層は64歳までです。';
    if (!b.ready || !b.pension) {
      $('lp-actions').hidden = true;
      SP.setText('r-big', '—');
      SP.setText('r-detail', '今の年齢を入れると出ます。');
      SP.setText('r-loan', '');
      SP.setText('r-kids', '');
      $('rows').tBodies[0].textContent = '';
      draw(b);
      setBar('');
      return;
    }
    var p = b.pension;
    SP.setText('r-big', '月' + yen(p.monthly));
    SP.setText('r-detail', p.startAge + '歳から（65歳からと比べて ' + (p.pct > 0 ? '+' : '') + p.pct + '%）。老齢基礎年金の満額の場合' +
      (p.clipped ? '。繰下げは' + p.startAge + '歳までの生まれ年です' : ''));
    SP.setText('r-loan', loanOn ? '住宅ローンは' + (b.loan.beyond ? '100歳を過ぎても続きます' : b.loan.payoffAge + '歳で完済') + '（毎月' + yen(b.loan.monthly) + '・利息の合計' + man(b.loan.totalInterest) + '）' : '');
    var last = kids.slice().sort(function (p, q) { return (q.birth.y - p.birth.y) || (q.birth.m - p.birth.m); })[0];
    SP.setText('r-kids', last ? 'いちばん下の子の大学卒業は 親が' + last.gradAge + '歳の年（4年制に進んだ場合）' : '');
    draw(b);
    var tb = $('rows').tBodies[0];
    tb.textContent = '';
    L.rows(b, today()).forEach(function (r) {
      var tr = document.createElement('tr');
      var cells = [r.age + '歳', r.loanPaid ? yen(r.loanPaid) : '', r.loanInterest ? yen(r.loanInterest) : '', r.pension ? yen(r.pension) : ''];
      if (taxOn) cells.push(r.tax ? yen(r.tax) : '');
      if (irOn) cells.push(r.iryohi ? yen(r.iryohi) : '');
      if (ikOn) cells.push(r.ikukyu ? yen(r.ikukyu) : '');
      if ('grades' in r) cells.push(r.grades ? r.grades.filter(function (g) { return g; }).join('・') : '');
      if (kaiOn) cells.push(r.kaitei ? r.kaitei + '件' : '');
      cells.forEach(function (v, i) {
        var c = document.createElement(i ? 'td' : 'th');
        if (!i) c.scope = 'row';
        c.textContent = v;
        tr.appendChild(c);
      });
      tb.appendChild(tr);
    });
    setBar('年金 月' + yen(p.monthly));
    $('lp-actions').hidden = false;
    lastRows = L.rows(b, today());
    lastLayers = ['tax', 'iryohi', 'loan', 'pension', 'children', 'kaitei', 'ikukyu'].filter(function (k) { return b[k] && !b[k].error && !b[k].errors; }).length;
    window.yzUsed?.();
  }

  // 子の入力: 3 人まで、生まれた年と月の select（名前は聞かない）。年は今年の 10 年後から 30 年前まで
  (function () {
    var box = $('kid-rows'), ty = today().y;
    for (var i = 0; i < 3; i++) {
      var row = document.createElement('div');
      row.className = 'kid-row';
      var n = document.createElement('span');
      n.className = 'kid-n';
      n.textContent = (i + 1) + '人目';
      row.appendChild(n);
      [['y', '生まれた年', ty + 10, ty - 30, '年'], ['m', '生まれた月', 1, 12, '月']].forEach(function (f) {
        var s = document.createElement('select');
        s.id = 'kid' + (i + 1) + '-' + f[0];
        s.dataset.k = 'children.' + i + '.' + f[0];
        s.setAttribute('aria-label', (i + 1) + '人目の' + f[1]);
        var o = document.createElement('option');
        o.value = '';
        o.textContent = '—';
        s.appendChild(o);
        var step = f[2] > f[3] ? -1 : 1;
        for (var v = f[2]; step < 0 ? v >= f[3] : v <= f[3]; v += step) {
          o = document.createElement('option');
          o.value = String(v);
          o.textContent = v + f[4];
          s.appendChild(o);
        }
        row.appendChild(s);
      });
      box.appendChild(row);
    }
  })();

  page.querySelectorAll('[data-k]').forEach(function (f) {
    f.addEventListener(f.tagName === 'SELECT' ? 'change' : 'input', function () {
      setPath(state, f.dataset.k, f.value);
      var o = page.querySelector('output.yomi[for="' + f.id + '"]');
      if (o) o.textContent = f.value ? '（' + yomi(Number(f.value)) + '）' : '';
      render();
    });
  });
  // --- 印刷・CSV・箱 ---
  function download(name, blob) {
    var a = document.createElement('a');
    a.download = name;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  $('lp-csv').addEventListener('click', function () { download(L.CSV_NAME, new Blob([L.toCsv(lastRows)], { type: 'text/csv;charset=utf-8' })); });
  // 印刷では表の折りたたみを開き、終わったら元に戻す
  // 印刷では年ごとの表を左右 2 段に組み直して A4 横 1 枚に収める（画面の表はそのまま。印刷のあとで消す）
  window.addEventListener('beforeprint', function () {
    var src = $('rows'), body = src.tBodies[0].rows;
    var box = document.getElementById('rows-print') || document.createElement('div');
    box.id = 'rows-print';
    box.className = 'print-only';
    box.textContent = '';
    var half = Math.ceil(body.length / 2);
    [[0, half], [half, body.length]].forEach(function (r) {
      if (r[0] >= r[1]) return;
      var t = document.createElement('table');
      t.className = 'tbl num';
      t.appendChild(src.tHead.cloneNode(true));
      var tb = document.createElement('tbody');
      for (var i = r[0]; i < r[1]; i++) tb.appendChild(body[i].cloneNode(true));
      t.appendChild(tb);
      box.appendChild(t);
    });
    $('rows-box').after(box);
  });
  window.addEventListener('afterprint', function () { var b = document.getElementById('rows-print'); if (b) b.remove(); });
  $('lp-print').addEventListener('click', function () { window.print(); });
  $('lp-save').addEventListener('click', function () {
    var cur = B.load(store);
    var ok = B.save(store, B.setLifeplan(cur.box, { input: state, layers: lastLayers }));
    SP.setText('lp-box-msg', ok ? '入力をこの端末に保存しました。次に開いたとき、この入力から始まります。' : 'この端末に保存できませんでした（ブラウザの設定や容量のため）。');
  });
  // 箱に保存した入力があれば、そこから始める（壊れた値は空から）
  (function () {
    var saved = B.lifeplan(B.load(store).box);
    if (!saved) return;
    var i = saved.input;
    state.pensionStart = i.pensionStart === null ? 65 : i.pensionStart;
    page.querySelectorAll('[data-k]').forEach(function (f) {
      var v = f.dataset.k.split('.').reduce(function (o, k) { return o === null || o === undefined ? null : o[k]; }, i);
      if (v === null || v === undefined) return;
      f.value = String(v);
      setPath(state, f.dataset.k, f.value);
      var o = page.querySelector('output.yomi[for="' + f.id + '"]');
      if (o) o.textContent = f.value ? '（' + yomi(Number(f.value)) + '）' : '';
    });
  })();

  // 確認日は年金の値の表（lib/kuriage-values.js の CHECKED）から。HTML の値は読み込めなかったときの控え
  $('asof-date').textContent = jdate(window.KuriageValues.CHECKED);
  render();
  document.documentElement.classList.remove('js-loading');
})();
