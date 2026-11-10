// ===========================
// 人生の数字を 1 枚に（/seido-keisan/lifeplan/、yorozu-plans 企画書 102 の枝 1）— 画面の制御
// 計算は ../lib/lifeplan.js（住宅ローンは ../lib/loan.js、年金は ../lib/kuriage.js、子の学年は ../lib/gakunen.js をそのまま呼ぶ）。数をここで作らない
// 入力は保存も送信もしない（箱への保存は企画書 102 の枝 7）
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
  var W = 400, PAD_L = 4, PAD_R = 4, ROW_H = 44, GAP = 22, TOP = 30, KID_H = 14;
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
    if (b.loan && b.loan.byAge) layers.push('loan');
    if (b.pension) layers.push('pension');
    var kids = b.children || [];
    var H = TOP + layers.length * (ROW_H + GAP) + kids.length * (KID_H + GAP) + 18;
    var label = ['0〜100歳の時間軸。今の年齢 ' + b.input.age + '歳'];
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', class: 'tl' });
    var bw = (W - PAD_L - PAD_R) / 101;
    var max = 0;
    layers.forEach(function (k) { b[k].byAge.forEach(function (r) { max = Math.max(max, k === 'loan' ? r.paid : r.annual); }); });
    var yNext = TOP;
    layers.forEach(function (k) {
      var y0 = yNext;
      yNext += ROW_H + GAP;
      var name = k === 'loan' ? '住宅ローンの返済' : '年金';
      svg.appendChild(el('text', { x: PAD_L, y: y0 - 5, class: 'tl-name' }, name));
      svg.appendChild(el('line', { x1: PAD_L, x2: W - PAD_R, y1: y0 + ROW_H, y2: y0 + ROW_H, class: 'tl-base' }));
      b[k].byAge.forEach(function (r) {
        if (k === 'loan') {
          var hp = ROW_H * r.principal / max, hi = ROW_H * r.interest / max;
          svg.appendChild(el('rect', { x: x(r.age), y: y0 + ROW_H - hp, width: bw, height: hp, class: 'tl-principal' }));
          svg.appendChild(el('rect', { x: x(r.age), y: y0 + ROW_H - hp - hi, width: bw, height: hi, class: 'tl-interest' }));
        } else {
          var h = ROW_H * r.annual / max;
          svg.appendChild(el('rect', { x: x(r.age), y: y0 + ROW_H - h, width: bw, height: h, class: 'tl-pension' }));
        }
      });
      var first = b[k].byAge[0], last = b[k].byAge[b[k].byAge.length - 1];
      var full = k === 'loan' ? first.paid : (b[k].byAge[1] || first).annual;
      var t = first.age + '歳から 年' + man(full);
      var tx = Math.min(x(first.age), W - PAD_R - 7 * t.length);
      svg.appendChild(el('text', { x: tx, y: y0 + ROW_H + 14, class: 'tl-num' }, t));
      label.push(name + ': ' + first.age + '〜' + last.age + '歳、年' + man(full));
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
      var t = parts.join('　');
      svg.appendChild(el('text', { x: Math.max(PAD_L, Math.min(x(c.bands[0].from), W - PAD_R - 9 * t.length)), y: y0 + KID_H + 13, class: 'tl-num' }, t));
      label.push(name + ': 入学の年の親の年齢 ' + c.bands.map(function (bd) { return STAGE_NAME[bd.key] + ' ' + bd.entryAge + '歳'; }).join('、'));
    });
    // 目盛り（10 歳ごと）と今の年齢
    for (var a = 0; a <= 100; a += 10) svg.appendChild(el('text', { x: x(a), y: H - 2, class: 'tl-tick' }, String(a)));
    var nx = x(b.input.age) + bw / 2;
    svg.appendChild(el('line', { x1: nx, x2: nx, y1: 4, y2: H - 14, class: 'tl-now' }));
    svg.appendChild(el('text', { x: Math.min(nx + 3, W - 40), y: 11, class: 'tl-now-label' }, '今 ' + b.input.age + '歳'));
    svg.setAttribute('aria-label', label.join('。'));
    box.appendChild(svg);
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
        '<span class="sw sw-support"></span>就学支援金の対象の期間（全日制の場合。<a href="../koko-mushoka/">高校無償化の計算</a>）';
      box.appendChild(kg);
    }
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
    if (!b.ready || !b.pension) {
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
      if (r.grades) cells.push(r.grades.filter(function (g) { return g; }).join('・'));
      cells.forEach(function (v, i) {
        var c = document.createElement(i ? 'td' : 'th');
        if (!i) c.scope = 'row';
        c.textContent = v;
        tr.appendChild(c);
      });
      tb.appendChild(tr);
    });
    setBar('年金 月' + yen(p.monthly));
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
  render();
  document.documentElement.classList.remove('js-loading');
})();
