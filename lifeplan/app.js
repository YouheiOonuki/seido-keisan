// ===========================
// 人生の数字を 1 枚に（/seido-keisan/lifeplan/、yorozu-plans 企画書 102 の枝 1）— 画面の制御
// 計算は ../lib/lifeplan.js（住宅ローンは ../lib/loan.js、年金は ../lib/kuriage.js をそのまま呼ぶ）。数をここで作らない
// 入力は保存も送信もしない（箱への保存は企画書 102 の枝 7）
// ===========================
(function () {
  'use strict';

  var L = window.Lifeplan;
  var SP = window.ScreenParts;
  var $ = function (id) { return document.getElementById(id); };
  var page = document.querySelector('main');
  var state = { pensionStart: 65, loan: {} };
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
  var W = 400, PAD_L = 4, PAD_R = 4, ROW_H = 44, GAP = 22, TOP = 30;
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
    var H = TOP + layers.length * (ROW_H + GAP) + 18;
    var label = ['0〜100歳の時間軸。今の年齢 ' + b.input.age + '歳'];
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', class: 'tl' });
    var bw = (W - PAD_L - PAD_R) / 101;
    var max = 0;
    layers.forEach(function (k) { b[k].byAge.forEach(function (r) { max = Math.max(max, k === 'loan' ? r.paid : r.annual); }); });
    layers.forEach(function (k, i) {
      var y0 = TOP + i * (ROW_H + GAP);
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
  }

  function render() {
    var b = L.build(state, today());
    var d = b.input;
    $('pensionStart-out').textContent = d.pensionStart + '歳';
    var loanOn = !!(b.loan && b.loan.byAge);
    $('s-loan').textContent = loanOn ? man(d.loan.principal) + '・' + d.loan.years + '年・' + d.loan.rate + '%' : 'なし';
    $('loan-msg').textContent = b.loan && b.loan.errors ? b.loan.errors.join(' ') : '';
    if (!b.ready || !b.pension) {
      SP.setText('r-big', '—');
      SP.setText('r-detail', '今の年齢を入れると出ます。');
      SP.setText('r-loan', '');
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
    draw(b);
    var tb = $('rows').tBodies[0];
    tb.textContent = '';
    L.rows(b).forEach(function (r) {
      var tr = document.createElement('tr');
      [r.age + '歳', r.loanPaid ? yen(r.loanPaid) : '', r.loanInterest ? yen(r.loanInterest) : '', r.pension ? yen(r.pension) : ''].forEach(function (v, i) {
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

  page.querySelectorAll('[data-k]').forEach(function (f) {
    f.addEventListener('input', function () {
      setPath(state, f.dataset.k, f.value);
      var o = page.querySelector('output.yomi[for="' + f.id + '"]');
      if (o) o.textContent = f.value ? '（' + yomi(Number(f.value)) + '）' : '';
      render();
    });
  });
  render();
  document.documentElement.classList.remove('js-loading');
})();
