// ===========================
// 子ども・子育て支援金（いくら引かれる）— 画面の制御
// 計算は ../lib/shienkin.js（純粋関数）、制度の値は ../lib/shienkin-values.js と ../lib/ikukyu-values.js（等級表）にだけ置く
// ===========================
(function () {
  'use strict';

  var C = window.Shienkin;
  var V = window.ShienkinValues;
  var S = window.ScreenParts;

  // --- ブラウザへの保存（README「ツールを追加するとき」12） ---
  // キーは必ず "seido-keisan_" で始める。全ツールが同じオリジンで localStorage を共有しているため
  var KEY_PREFIX = 'seido-keisan_';
  var DRAFT = 'shienkin_draft';
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
  var page = document.querySelector('main');
  var state = C.normalizeInput(store.get(DRAFT, {}));
  var setBar = S.fixbar();

  function yen(n) { return Math.round(n).toLocaleString('ja-JP') + '円'; }
  function yomi(n) {
    n = Number(n) || 0;
    if (n < 10000) return n ? n.toLocaleString('ja-JP') + '円' : '';
    var m = Math.floor(n / 10000), r = n % 10000;
    return m.toLocaleString('ja-JP') + '万' + (r ? r.toLocaleString('ja-JP') : '') + '円';
  }
  // 1か月分は 0.1円まで（協会けんぽの額表と同じ）、1年分は円に丸めて「約」
  var y1 = C.yenAuto;
  function yAbout(sen) { return (sen % 100 === 0 ? '' : '約') + C.yenStr(sen, 0); }

  function fields() { return page.querySelectorAll('[data-k]'); }
  function fillForm() {
    fields().forEach(function (el) {
      var v = state[el.dataset.k];
      if (el.type === 'radio') el.checked = el.value === v;
      else el.value = v === undefined || v === null || v === 0 ? '' : String(v);
    });
    updateYomi();
    updateUi();
  }
  function readField(el) {
    if (el.type === 'radio') { if (el.checked) state[el.dataset.k] = el.value; }
    else state[el.dataset.k] = el.value;
  }
  function updateYomi() {
    page.querySelectorAll('output.yomi').forEach(function (o) {
      var input = $(o.getAttribute('for'));
      o.textContent = input && input.value ? '（' + yomi(Number(input.value)) + '）' : '';
    });
  }
  function updateUi() {
    var d = C.normalizeInput(state);
    var municipal = d.kind === 'kokuho' || d.kind === 'kouki';
    page.querySelectorAll('[data-for=wage]').forEach(function (el) { el.hidden = municipal; });
    page.querySelectorAll('[data-for=bonus]').forEach(function (el) { el.hidden = municipal || d.kind === 'ninkei'; });
    var hy = d.mode === 'hyojun';
    $('amount-label').textContent = hy ? '標準報酬月額（健康保険）' : '月給（額面・通勤手当や残業代を含む）';
    $('amount-hint').textContent = hy ? '勤め先で確かめられる額。分からなければ月給で。' : '4〜6月の平均に近い額。等級に直して計算。';
  }

  // 令和10年度の参考（国が示した機械的な計算）。個人の額は会社員の結果が出たときだけ足す
  function setRef(extra) {
    $('ref2028').textContent = '参考: 国は令和10年度の被用者保険について、令和4年度の総報酬で機械的に割ると' + V.MIKOMI.refRate2028 + '%（本人' + (V.MIKOMI.refRate2028 / 2) + '%）と示しています。' + (extra || '');
  }

  // --- 結果の表示 ---
  function render() {
    var r = C.calc(state);
    setRef('');
    var d = r.input;
    var msgs = $('r-msgs');
    msgs.textContent = '';
    function msg(t) { var li = document.createElement('li'); li.textContent = t; msgs.appendChild(li); }
    document.querySelectorAll('[data-need]').forEach(function (el) {
      el.classList.toggle('is-missing', !r.municipal && !r.ready);
    });

    $('municipal').hidden = !r.municipal;
    $('sum-wrap').hidden = !!r.municipal;
    $('steps-box').hidden = !r.ready;

    if (r.municipal) {
      var kokuho = d.kind === 'kokuho';
      $('r-lead').textContent = kokuho ? '国民健康保険の支援金は' : '後期高齢者医療の支援金は';
      $('r-big').textContent = kokuho ? '市町村が決めます' : '広域連合が決めます';
      $('r-detail').textContent = '医療分の保険料（税）と合わせて徴収。世帯や所得で決まるので、通知書で確かめます。';
      $('m-note').textContent = '国のモデル試算（' + r.model.note + '、50円丸め）。実際の額は条例で決まります。';
      var tb = $('m-table').tBodies[0];
      tb.textContent = '';
      r.model.rows.forEach(function (row) {
        var tr = document.createElement('tr');
        var th = document.createElement('th'); th.scope = 'row'; th.textContent = row[0] + '万円';
        var td = document.createElement('td'); td.textContent = row[1].toLocaleString('ja-JP') + '円';
        tr.appendChild(th); tr.appendChild(td); tb.appendChild(tr);
      });
      if (kokuho) msg('高校生年代（18歳になった後の最初の3月31日まで）の子の均等割は全額軽減されます。');
      setBar('');
      return;
    }

    if (!r.ready) {
      $('r-lead').textContent = '毎月の給与から';
      $('r-big').textContent = '—';
      $('r-detail').textContent = (d.mode === 'hyojun' ? '標準報酬月額' : '月給') + 'を入れると出ます。';
      ['month', 'bonus', 'year', '2026', 'employer'].forEach(function (k) { $('t-' + k).textContent = '—'; });
      $('steps').textContent = '';
      setBar('');
      return;
    }

    var ninkei = d.kind === 'ninkei';
    $('r-lead').textContent = ninkei ? '毎月の保険料に（全額を本人が負担）' : '毎月の給与から';
    $('r-big').textContent = y1(r.selfSen);
    $('r-detail').textContent = '標準報酬月額 ' + yen(r.hyojun) + ' × ' + V.rate + '%' + (ninkei ? '' : ' の半分');
    $('t-month').textContent = y1(r.selfSen);
    $('row-bonus').hidden = ninkei;
    $('t-bonus').textContent = r.bonusStd ? y1(r.bonusSelfSen) : 'なし';
    $('th-year').textContent = '1年分（12か月' + (r.bonusStd ? '＋賞与' : '') + '）';
    $('t-year').textContent = yAbout(r.yearSen);
    $('th-2026').textContent = '2026年に' + (ninkei ? '納める' : '引かれる') + '分（' + (ninkei ? '4〜12月分' : '5〜12月の給与' + (r.bonusStd ? '＋賞与' : '')) + '）';
    $('t-2026').textContent = yAbout(r.y2026Sen);
    $('row-employer').hidden = ninkei;
    $('t-employer').textContent = y1(r.employerSen);

    if (r.regraded) msg('入れた額は標準報酬月額の等級にないので、月給として等級（' + yen(r.hyojun) + '）に直しました。');
    if (r.capped) msg('任意継続の標準報酬月額は協会けんぽでは' + yen(V.ninkeiMax) + 'が上限です（令和8年度）。健保組合は組合ごとに違います。');
    if (r.bonusCapped) msg('標準賞与額は年度（4月〜翌年3月）の合計' + yen(V.bonusCapYear) + 'までです。');
    if (!ninkei && r.selfSen % 100 !== 0) msg('給与から引くときは円未満を処理するので（50銭以下は切り捨てなど）、明細と1円ずれることがあります。');

    // 途中の計算
    var box = $('steps');
    box.textContent = '';
    var t = document.createElement('table'); t.className = 'steps tbl';
    var tb2 = document.createElement('tbody');
    function row(label, val) {
      var tr = document.createElement('tr');
      var th = document.createElement('th'); th.scope = 'row'; th.textContent = label;
      var td = document.createElement('td'); td.textContent = val;
      tr.appendChild(th); tr.appendChild(td); tb2.appendChild(tr);
    }
    if (d.mode === 'salary') row('月給 → 標準報酬月額（等級）', yen(d.amount) + ' → ' + yen(r.hyojun));
    row('標準報酬月額 × ' + V.rate + '%（全額）', y1(r.fullSen));
    row(ninkei ? '本人負担（全額）' : '本人負担（半分）', y1(r.selfSen));
    if (r.bonusStd) {
      row('賞与 → 標準賞与額（1,000円未満切り捨て）', yen(d.bonus) + ' → ' + yen(r.bonusStd));
      row('標準賞与額 × ' + V.rate + '% の半分', y1(r.bonusSelfSen));
    }
    row('1年分 ＝ 毎月 × 12' + (r.bonusStd ? ' ＋ 賞与分' : ''), y1(r.yearSen));
    row('2026年分 ＝ 毎月 × ' + r.months2026 + (r.bonusStd ? ' ＋ 賞与分' : ''), y1(r.y2026Sen));
    t.appendChild(tb2); box.appendChild(t);

    if (!ninkei) setRef('この率なら、あなたの毎月は ' + y1(r.ref2028Sen) + 'です（決まった率ではありません）。');

    setBar('毎月 ' + y1(r.selfSen));
  }

  // 2027年度からの見込みの表（値だけ。入力に関係なく出す）
  (function () {
    var tbl = $('mikomi');
    var hr = tbl.tHead.rows[0];
    V.MIKOMI.years.forEach(function (y) { var th = document.createElement('th'); th.scope = 'col'; th.textContent = y; hr.appendChild(th); });
    V.MIKOMI.rows.forEach(function (r) {
      var tr = document.createElement('tr');
      var th = document.createElement('th'); th.scope = 'row'; th.textContent = r.label; tr.appendChild(th);
      r.v.forEach(function (v) { var td = document.createElement('td'); td.textContent = v.toLocaleString('ja-JP') + '円'; tr.appendChild(td); });
      tbl.tBodies[0].appendChild(tr);
    });
  })();

  // 中身が同じなら描き直さない。保存は 300ms まとめる
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
    readField(e.target); updateYomi(); updateUi(); update();
  });
  page.addEventListener('change', function (e) {
    if (!e.target.dataset || !e.target.dataset.k) return;
    readField(e.target); updateUi(); update();
  });

  // --- ファイルへの書き出し・読み込み（D31） ---
  function hasInput() { return JSON.stringify(C.normalizeInput(state)) !== JSON.stringify(C.normalizeInput({})); }
  function fileMsg(t) { $('file-msg').textContent = t; }

  $('export').addEventListener('click', function () {
    var data = C.toExportFile(state);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var dt = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = C.TOOL_ID + '-backup-' + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + '.json';
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    fileMsg('書き出しました（' + a.download + '）。給与の額が入っているので、取り扱いにご注意ください。');
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
  $('clear').addEventListener('click', function () {
    if (!hasInput()) return;
    if (!window.confirm('入力内容をすべて消します。よろしいですか？（書き出したファイルは消えません）')) return;
    state = C.normalizeInput({});
    store.remove(DRAFT);
    fillForm();
    renderNow();
    fileMsg('入力を消しました。');
  });

  // --- 制度の確認日（一定期間たったら注意）・率の期間（令和9年度に入ったら注意） ---
  (function () {
    var c = V.CHECKED.split('-');
    $('asof-date').textContent = c[0] + '年' + (+c[1]) + '月' + (+c[2]) + '日';
    var now = new Date();
    var months = (now.getFullYear() - c[0]) * 12 + (now.getMonth() + 1 - c[1]);
    var ym = now.getFullYear() + '-' + (now.getMonth() < 9 ? '0' : '') + (now.getMonth() + 1);
    if (months >= V.STALE_MONTHS || ym > V.rateTo) {
      $('asof').classList.add('is-stale');
      $('asof').appendChild(document.createTextNode('。' + (ym > V.rateTo ? '令和9年度（2027年4月分）からの率は反映していません' : '確認日から時間がたっています') + '。最新の率はこども家庭庁・加入先の案内をご確認ください'));
    }
  })();

  fillForm();
  renderNow();
  document.documentElement.classList.remove('js-loading');
})();
