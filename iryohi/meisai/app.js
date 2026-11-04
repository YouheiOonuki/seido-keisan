// ===========================
// 医療費控除の明細書を作る（令和8年分）— 画面の制御
// 行の形と保存は ../../lib/box.js、合計と CSV は ../../lib/meisai.js、控除と税金は ../../lib/iryohi.js。
// 保存するのは表だけ（箱の years[年].meisai）。所得の 2 欄は保存しない。サーバーには何も送らない
// ===========================
(function () {
  'use strict';

  var B = window.Box, M = window.Meisai, V = window.IryohiValues;
  var YEAR = V.year;
  var $ = function (id) { return document.getElementById(id); };

  // --- 箱から表を読む（壊れていても空の表で始める） ---
  var store = null;
  try { store = window.localStorage; } catch (e) { store = null; }
  var box = B.load(store).box;
  var rows = B.section(box, YEAR, 'meisai').rows;
  if (!rows.length) rows = [B.emptyRow()];
  var income = null, kojo = null;

  function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円'; }

  // --- 表を描く（行の追加・削除・並べ替え・読み込みのときだけ。入力中は描き直さない） ---
  var list = $('rows');
  function rowEl(r, i) {
    var li = document.createElement('li');
    li.className = 'm-row';
    li.dataset.i = i;
    var id = 'r' + i + '-';
    var kubun = B.KUBUN.map(function (k) {
      return '<label class="inline"><input type="checkbox" data-f="kubun" value="' + k.code + '"' + (r.kubun.indexOf(k.code) >= 0 ? ' checked' : '') + '> ' + k.label + '</label>';
    }).join('');
    li.innerHTML =
      '<div class="m-head"><span class="m-no">' + (i + 1) + '</span>' +
        '<button type="button" class="btn icon-btn" data-act="up" aria-label="' + (i + 1) + '行目を上へ">↑</button>' +
        '<button type="button" class="btn icon-btn" data-act="down" aria-label="' + (i + 1) + '行目を下へ">↓</button>' +
        '<button type="button" class="btn icon-btn" data-act="del" aria-label="' + (i + 1) + '行目を消す">消す</button></div>' +
      '<div class="field"><label for="' + id + 'who">医療を受けた方の氏名</label><input type="text" id="' + id + 'who" data-f="who" list="names" maxlength="' + B.MAX_TEXT + '"></div>' +
      '<div class="field"><label for="' + id + 'payee">病院・薬局などの支払先の名称</label><input type="text" id="' + id + 'payee" data-f="payee" maxlength="' + B.MAX_TEXT + '"></div>' +
      '<fieldset class="m-kubun"><legend>医療費の区分</legend>' + kubun + '</fieldset>' +
      '<div class="field"><label for="' + id + 'amount">支払った医療費の額</label><div class="money"><input type="number" id="' + id + 'amount" data-f="amount" inputmode="numeric" min="0" step="1"><span class="unit">円</span></div></div>' +
      '<div class="field"><label for="' + id + 'hoten">そのうち保険金などで補塡される金額</label><div class="money"><input type="number" id="' + id + 'hoten" data-f="hoten" inputmode="numeric" min="0" step="1" placeholder="0"><span class="unit">円</span></div></div>';
    // 値は DOM のプロパティで入れる（打った文字を HTML として解釈させない）
    li.querySelector('[data-f="who"]').value = r.who;
    li.querySelector('[data-f="payee"]').value = r.payee;
    li.querySelector('[data-f="amount"]').value = r.amount === null ? '' : String(r.amount);
    li.querySelector('[data-f="hoten"]').value = r.hoten === null ? '' : String(r.hoten);
    li.querySelector('[data-act="up"]').disabled = i === 0;
    li.querySelector('[data-act="down"]').disabled = i === rows.length - 1;
    return li;
  }
  function drawRows() {
    list.textContent = '';
    rows.forEach(function (r, i) { list.appendChild(rowEl(r, i)); });
    drawNames();
  }
  function drawNames() {
    var dl = $('names');
    dl.textContent = '';
    M.names(rows).forEach(function (n) { var o = document.createElement('option'); o.value = n; dl.appendChild(o); });
  }
  function readRow(li) {
    var i = +li.dataset.i;
    var k = [];
    li.querySelectorAll('[data-f="kubun"]').forEach(function (c) { if (c.checked) k.push(c.value); });
    rows[i] = B.normalizeRow({
      who: li.querySelector('[data-f="who"]').value,
      payee: li.querySelector('[data-f="payee"]').value,
      kubun: k,
      amount: li.querySelector('[data-f="amount"]').value,
      hoten: li.querySelector('[data-f="hoten"]').value,
    });
  }

  // --- 結果 ---
  var shown = false;
  function render() {
    var t = M.totals(rows);
    var est = income !== null ? M.estimate(t, income, kojo) : null;
    var useIncome = !!(est && est.iryohi);
    var has = t.count > 0 && t.a > 0;
    var kojoVal, f;
    if (useIncome) { kojoVal = est.iryohi.kojo; f = est.iryohi.f; }
    else { var o = M.overFloor(t); kojoVal = o.value; f = o.floor; }
    $('r-lead').textContent = useIncome ? '医療費控除額（所得の5%か10万円を超えた分）' : '10万円を超えた分';
    $('r-big').textContent = has ? yen(kojoVal) : '—';
    $('r-detail').textContent = !has ? '支払った医療費の額を入れると出ます。'
      : t.count + '行・差引金額 ' + yen(t.c) + ' − ' + yen(f);
    $('s-a').textContent = has ? yen(t.a) : '—';
    $('s-b').textContent = has ? yen(t.b) : '—';
    $('s-c').textContent = has ? yen(t.c) : '—';
    $('s-f-label').textContent = useIncome ? '引く額（F。所得の5%と10万円の少ないほう）' : '引く額（F。10万円）';
    $('s-f').textContent = has ? yen(f) : '—';
    var taxReady = !!(est && est.ready && has);
    $('s-tax-row').hidden = !taxReady;
    $('s-tax').textContent = taxReady ? yen(est.total) : '—';
    var note = [];
    if (t.over.length) note.push('補塡される金額が支払った額を超える行は、支払った額までを引いています。');
    if (est && !est.ready && income !== null && kojo === null) note.push('戻る税金の目安は、所得控除の額の合計額を入れると出ます。');
    $('r-note').textContent = note.join(' ');
    $('topbar-num').textContent = has ? yen(kojoVal) : '—';
    if (has) shown = true;
    updateTopbar();
    setState();
    drawPrint(t, est, useIncome, kojoVal, f);
    window.yzUsed?.();
  }
  function setState() {
    $('d-tax').querySelector('.state').textContent = income === null ? '入力なし' : '支払金額 ' + yen(income) + (kojo === null ? '（所得控除の合計が未入力）' : '');
  }

  // --- 印刷用の表（様式の列の順） ---
  function td(tr, text, cls) { var c = document.createElement('td'); c.textContent = text; if (cls) c.className = cls; tr.appendChild(c); }
  function drawPrint(t, est, useIncome, kojoVal, f) {
    var tb = $('p-rows');
    tb.textContent = '';
    t.rows.forEach(function (r) {
      var tr = document.createElement('tr');
      td(tr, r.who); td(tr, r.payee); td(tr, M.kubunLabel(r.kubun));
      td(tr, r.amount === null ? '' : yen(r.amount), 'num'); td(tr, r.hoten === null ? '' : yen(M.rowHoten(r)), 'num');
      tb.appendChild(tr);
    });
    var tot = document.createElement('tr');
    tot.className = 'p-total';
    var th = document.createElement('th'); th.colSpan = 3; th.textContent = V.MEISAI.total; tot.appendChild(th);
    td(tot, yen(t.a), 'num'); td(tot, yen(t.b), 'num');
    tb.appendChild(tot);
    var calc = [
      ['A', '支払った医療費', yen(t.a)],
      ['B', '保険金などで補塡される金額', yen(t.b)],
      ['C', '差引金額（A − B）', yen(t.c)],
      ['D', '所得金額の合計額', useIncome ? yen(est.iryohi.d) : ''],
      ['E', 'D × 0.05', useIncome ? yen(est.iryohi.e) : ''],
      ['F', 'E と10万円のいずれか少ない方の金額', useIncome ? yen(f) : ''],
      ['G', '医療費控除額（C − F）', useIncome ? yen(kojoVal) : ''],
    ];
    var pc = $('p-calc');
    pc.textContent = '';
    calc.forEach(function (c) {
      var tr = document.createElement('tr');
      var h = document.createElement('th'); h.scope = 'row'; h.textContent = c[1]; tr.appendChild(h);
      td(tr, c[0], 'p-key'); td(tr, c[2], 'num');
      pc.appendChild(tr);
    });
  }

  // --- 固定バー: 結果が一度出たあと、結果が画面の外にあるときだけ（SCREEN 3 章） ---
  var resultVisible = true;
  function updateTopbar() { $('topbar').hidden = !shown || resultVisible; }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { resultVisible = es[0].isIntersecting; updateTopbar(); }, { threshold: 0 }).observe($('result-main'));
  }

  // --- 保存（表だけ。既定で残す。300ms まとめる） ---
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      box = B.setSection(B.load(store).box, YEAR, 'meisai', { rows: rows });   // ほかの画面が書いた区画を消さないよう、保存の直前に読み直す
      if (store) B.save(store, box);
    }, 300);
  }

  list.addEventListener('input', function (e) {
    var li = e.target.closest('.m-row');
    if (!li) return;
    readRow(li); render(); save();
    if (e.target.dataset.f === 'who') drawNames();
  });
  list.addEventListener('change', function (e) {
    var li = e.target.closest('.m-row');
    if (!li) return;
    readRow(li); render(); save();
  });
  list.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var i = +b.closest('.m-row').dataset.i, act = b.dataset.act;
    if (act === 'del') { rows.splice(i, 1); if (!rows.length) rows.push(B.emptyRow()); }
    else rows = M.move(rows, i, act === 'up' ? -1 : 1);
    drawRows(); render(); save();
    var next = list.querySelector('.m-row[data-i="' + Math.min(act === 'del' ? i : i + (act === 'up' ? -1 : 1), rows.length - 1) + '"] [data-act="' + act + '"]');
    if (next && !next.disabled) next.focus();
  });
  $('add').addEventListener('click', function () {
    if (rows.length >= B.MAX_ROWS) return;
    rows.push(B.emptyRow());
    drawRows(); render(); save();
    list.lastElementChild.querySelector('[data-f="who"]').focus();
  });

  function num(id) { return B.amount($(id).value); }
  ['income', 'kojo'].forEach(function (id) {
    $(id).addEventListener('input', function () { income = num('income'); kojo = num('kojo'); render(); });
  });

  // --- CSV と印刷 ---
  function download(name, blob) {
    var a = document.createElement('a');
    a.download = name;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  $('csv').addEventListener('click', function () {
    download(M.csvFileName(YEAR), new Blob([M.toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  });
  $('print').addEventListener('click', function () { window.print(); });

  // --- ファイルへの書き出し・読み込み（箱ごと。D31） ---
  function fileMsg(t) { $('file-msg').textContent = t; }
  $('export').addEventListener('click', function () {
    var cur = B.setSection(B.load(store).box, YEAR, 'meisai', { rows: rows });
    var name = B.exportFileName();
    download(name, new Blob([JSON.stringify(B.toExportFile(cur), null, 2)], { type: 'application/json' }));
    fileMsg('書き出しました（' + name + '）。医療を受けた方の氏名と医療費が入っています。');
  });
  $('import').addEventListener('click', function () { $('import-file').click(); });
  $('import-file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { fileMsg('ファイルが大きすぎます（この画面で書き出したファイルを選んでください）。'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(String(reader.result)); } catch (err) { fileMsg('ファイルを読み込めませんでした（JSON の形式ではありません）。'); return; }
      var res = B.fromExportFile(obj);
      if (!res.ok) { fileMsg(res.message); return; }
      if (M.totals(rows).count && !window.confirm('今の入力内容を、ファイルの内容で置き換えます。よろしいですか？')) { fileMsg('読み込みをやめました。'); return; }
      box = res.data;
      if (store) B.save(store, box);
      rows = B.section(box, YEAR, 'meisai').rows;
      if (!rows.length) rows = [B.emptyRow()];
      drawRows(); render();
      fileMsg('読み込みました（' + f.name + '）。');
    };
    reader.onerror = function () { fileMsg('ファイルを読み込めませんでした。'); };
    reader.readAsText(f);
  });
  // 保存を消すのは全ツール共通の「保存した内容をすべて消す」ボタン（../../reset-storage.js）

  // --- 確認日（一定期間たったら注意） ---
  (function () {
    var c = V.MEISAI.CHECKED.split('-');
    $('asof-date').textContent = c[0] + '年' + (+c[1]) + '月' + (+c[2]) + '日';
    var now = new Date();
    if ((now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]) >= V.STALE_MONTHS) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode('。確認日から時間がたっています。最新の制度は国税庁の案内をご確認ください'));
    }
  })();

  drawRows();
  render();
  document.documentElement.classList.remove('js-loading');
})();
