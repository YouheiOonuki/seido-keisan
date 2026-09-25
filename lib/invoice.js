// ===========================
// インボイス 2割特例の後の消費税の比較（画面から切り離した純粋関数）
// 手順は国税庁「２割特例用 確定申告の手引き」の付表6・申告書の欄の順:
//   売上（税込）× 100/110（1円未満切り捨て）→ 課税標準額（1,000円未満切り捨て）× 7.8% ＝ 売上税額
//   控除する税額: 3割特例は（売上税額 − 返還等の税額）× 70%、2割特例は × 80%、簡易課税は × みなし仕入率、
//                 本則課税は 仕入れ（税込）× 7.8/110（割戻し計算）＋ インボイスのない仕入れ × 7.8/110 × 経過措置の割合
//   差引税額 ＝ 売上税額 − 控除する税額 − 返還等の税額（100円未満切り捨て）、地方消費税 ＝ 差引税額 × 22/78（100円未満切り捨て）
// 標準税率 10% の取引だけを扱う（軽減税率 8% は扱わない）。DOM や localStorage には触らない。
// ブラウザでは window.Invoice、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var NODE = typeof module !== 'undefined' && module.exports;
  var V = NODE ? require('./invoice-values.js') : root.InvoiceValues;

  var TOOL_ID = 'seido-keisan-invoice';
  var FILE_VERSION = 1;

  function yen(n) { return Number(n).toLocaleString('ja-JP') + '円'; }
  function floor100(x) { return Math.floor(x / 100) * 100; }
  // 税込の支払対価・売上 → 7.8% 分の税額（× 7.8/110、1円未満切り捨て）
  function tax78of110(amount) { return Math.floor(amount * 78 / 1100); }

  // --- 入力の正規化（保存・ファイル読み込み・計算の前に必ず通す） ---
  // 金額は 0 以上の整数。空欄は null（「入れていない」と 0 を分ける）
  function amount(v) {
    if (v === undefined || v === null) return null;
    var s = String(v).replace(/[,，\s円]/g, '');
    if (s === '') return null;
    var n = Math.floor(Number(s));
    if (!isFinite(n)) return null;
    return Math.min(Math.max(0, n), 1e11);
  }
  function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }

  function normalizeInput(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var year = Number(r.year);
    var kubun = Number(r.kubun);
    return {
      year: V.years[year] ? year : V.defaultYear,           // 計算する年分
      uriage: amount(r.uriage),                              // 課税売上（税込・10%）
      kubun: kubun >= 1 && kubun <= 6 ? kubun : V.defaultKubun,  // 簡易課税の事業区分
      shiire: amount(r.shiire),                              // インボイスのある課税仕入れ（税込）
      noinv: amount(r.noinv),                                // インボイスのない課税仕入れ（税込）
      noinvLate: amount(r.noinvLate),                        // そのうち 10〜12 月分（令和10年分だけ使う）
      kijun: pick(r.kijun, ['le10m', 'le50m', 'gt50m'], 'le10m'),   // 2年前の課税売上高
      henkan: amount(r.henkan),                              // 売上の返品・値引き（税込。売上から引いていない分）
    };
  }

  // その年（1〜12月）の中で、インボイスのない仕入れの控除割合が変わる区切り
  // 戻り値 [{ from, to, pct }]（年の中に収まるように切った期間）
  function keikaSegments(year) {
    var ys = year + '-01-01', ye = year + '-12-31', out = [];
    V.keika.forEach(function (k) {
      if (k.to < ys || k.from > ye) return;
      out.push({ from: k.from < ys ? ys : k.from, to: k.to > ye ? ye : k.to, pct: k.pct });
    });
    return out;   // どの期間にも当たらない年（2031年10月以降）は空 → 控除なし
  }

  // 差引税額（国）→ 納付額（国＋地方）。マイナスは還付の目安（端数処理は 1 円未満切り捨てだけ）
  function finish(uriageTax, kojo, henkanTax) {
    var diff = uriageTax - kojo - henkanTax;
    if (diff >= 0) {
      var koku = floor100(diff);
      var chiho = floor100(koku * V.chihoRate[0] / V.chihoRate[1]);
      return { diff: diff, koku: koku, chiho: chiho, total: koku + chiho, refund: false };
    }
    var kk = diff;   // 控除不足還付税額（マイナス）
    var ch = -Math.floor(-kk * V.chihoRate[0] / V.chihoRate[1]);
    return { diff: diff, koku: kk, chiho: ch, total: kk + ch, refund: true };
  }

  /**
   * 3割特例・簡易課税・本則課税（と参考の2割特例）の納付税額を計算する
   * @returns {object} { ready, missing[], input, base, methods: { sanwari, kani, honsoku, niwari }, best, steps{} }
   */
  function calc(input) {
    var d = normalizeInput(input);
    var Y = V.years[d.year];
    var missing = [];
    if (d.uriage === null) missing.push('uriage');
    var res = { ready: false, missing: missing, input: d, yearLabel: Y.label, kigen: Y.kigen };
    if (missing.length) return res;

    // 1. 売上税額（申告書の ①・②）
    var zeinuki = Math.floor(d.uriage * 100 / 110);
    var hyojun = Math.floor(zeinuki / 1000) * 1000;
    var uriageTax = Math.floor(hyojun * V.kokuRate[0] / V.kokuRate[1]);
    var henkanTax = tax78of110(d.henkan || 0);
    var base = Math.max(0, uriageTax - henkanTax);   // 控除対象仕入税額の計算の基礎となる消費税額
    res.base = { zeinuki: zeinuki, hyojun: hyojun, uriageTax: uriageTax, henkanTax: henkanTax, base: base };

    var baseSteps = [
      { label: '課税売上（税込）', amount: d.uriage, rule: '入力した金額' },
      { label: '税抜の売上', amount: zeinuki, rule: '× 100/110（1円未満切り捨て）' },
      { label: '課税標準額', amount: hyojun, rule: '1,000円未満切り捨て' },
      { label: '売上税額（国・7.8%）', amount: uriageTax, rule: '課税標準額 × 7.8%' },
    ];
    if (henkanTax) baseSteps.push({ label: '返品・値引きの税額', amount: henkanTax, rule: yen(d.henkan) + ' × 7.8/110' });

    var ok10 = d.kijun === 'le10m', ok50 = d.kijun !== 'gt50m';
    var m = {};
    function tokurei(key, name, pct, available, why) {
      var kojo = Math.floor(base * pct / 100);
      var f = finish(uriageTax, kojo, henkanTax);
      m[key] = { key: key, name: name, available: available, why: why, kojo: kojo, r: f,
        steps: baseSteps.concat([
          { label: '控除する税額', amount: kojo, rule: (henkanTax ? '（売上税額 − 返品・値引きの税額）' : '売上税額') + ' × ' + pct + '%' },
        ]) };
    }

    // 2. 3割特例（令和9年分・令和10年分、基準期間 1,000万円以下）
    tokurei('sanwari', '3割特例', V.sanwariKojo, Y.sanwari && ok10,
      !Y.sanwari ? '令和10年分で終わり' : !ok10 ? '2年前の課税売上高が1,000万円超' : '');

    // 3. 簡易課税
    var kb = V.kubun[d.kubun - 1];
    var kaniKojo = Math.floor(base * kb.rate / 100);
    m.kani = { key: 'kani', name: '簡易課税（' + kb.name.replace(/（.*/, '') + ' ' + kb.rate + '%）', available: ok50,
      why: ok50 ? '' : '2年前の課税売上高が5,000万円超', kojo: kaniKojo, r: finish(uriageTax, kaniKojo, henkanTax),
      steps: baseSteps.concat([
        { label: '控除する税額（みなし仕入率 ' + kb.rate + '%）', amount: kaniKojo, rule: (henkanTax ? '（売上税額 − 返品・値引きの税額）' : '売上税額') + ' × ' + kb.rate + '%' },
      ]) };

    // 4. 本則課税（割戻し計算）
    var segs = keikaSegments(d.year);
    var inv = d.shiire || 0, noinv = d.noinv || 0;
    var invTax = tax78of110(inv);
    var parts = [];
    if (segs.length === 2) {
      var late = Math.min(noinv, d.noinvLate || 0);
      parts.push({ amount: noinv - late, pct: segs[0].pct, seg: segs[0] });
      parts.push({ amount: late, pct: segs[1].pct, seg: segs[1] });
    } else if (segs.length === 1) {
      parts.push({ amount: noinv, pct: segs[0].pct, seg: segs[0] });
    }
    var hSteps = baseSteps.concat([
      { label: 'インボイスのある仕入れの税額', amount: invTax, rule: yen(inv) + ' × 7.8/110' },
    ]);
    var noinvTax = 0;
    parts.forEach(function (p) {
      var t = Math.floor(p.amount * 78 * p.pct / 110000);
      noinvTax += t;
      if (p.amount || parts.length === 1) {
        hSteps.push({ label: 'インボイスのない仕入れの税額（' + p.seg.from.slice(5).replace('-', '/') + '〜' + p.seg.to.slice(5).replace('-', '/') + ' ' + p.pct + '%）', amount: t, rule: yen(p.amount) + ' × 7.8/110 × ' + p.pct + '%' });
      }
    });
    var hKojo = invTax + noinvTax;
    hSteps.push({ label: '控除する税額', amount: hKojo, rule: '上の合計' });
    m.honsoku = { key: 'honsoku', name: '本則課税（一般課税）', available: true, why: '', kojo: hKojo, r: finish(uriageTax, hKojo, henkanTax), steps: hSteps,
      noinvPct: parts.map(function (p) { return p.pct; }), shiireEntered: d.shiire !== null || d.noinv !== null };

    // 5. 参考: 2割特例（令和8年分まで）
    tokurei('niwari', '2割特例（令和8年分まで）', V.niwariKojo, false, '令和8年分で終わり');
    m.niwari.reference = true;
    m.niwari.eligible10 = ok10;

    // 6. 差引税額・地方消費税の行を足す
    ['sanwari', 'kani', 'honsoku', 'niwari'].forEach(function (k) {
      var x = m[k], f = x.r;
      if (f.refund) {
        x.steps.push({ label: '控除しきれない税額（還付・国）', amount: -f.koku, rule: '控除する税額 − 売上税額' + (henkanTax ? ' ＋ 返品・値引きの税額' : '') });
        x.steps.push({ label: '還付される地方消費税（目安）', amount: -f.chiho, rule: '× 22/78（1円未満切り捨て）' });
        x.steps.push({ label: '還付の目安（国＋地方）', amount: -f.total, rule: '', cls: 'total' });
      } else {
        x.steps.push({ label: '差引税額（国）', amount: f.koku, rule: '売上税額 − 控除する税額' + (henkanTax ? ' − 返品・値引きの税額' : '') + '（100円未満切り捨て）' });
        x.steps.push({ label: '地方消費税', amount: f.chiho, rule: '差引税額 × 22/78（100円未満切り捨て）' });
        x.steps.push({ label: '納付税額（国＋地方）', amount: f.total, rule: '', cls: 'total' });
      }
    });

    // 7. いちばん少ない方式（使えるものだけ。本則課税は仕入れを入れたときだけ比べる）
    var cand = ['sanwari', 'kani', 'honsoku'].filter(function (k) {
      return m[k].available && (k !== 'honsoku' || m.honsoku.shiireEntered);
    });
    var best = cand.reduce(function (a, k) { return a === null || m[k].r.total < m[a].r.total ? k : a; }, null);
    res.ready = true;
    res.methods = m;
    res.best = best;
    res.ties = best ? cand.filter(function (k) { return k !== best && m[k].r.total === m[best].r.total; }) : [];
    res.segments = segs;
    return res;
  }

  // 簡易課税の届出の期限（その年分から簡易課税にするとき）
  //   前の年分を 2割特例・3割特例で申告した → その年分の確定申告期限まで（28年改正法附則51条の2第6項・51条の3）
  //   それ以外 → 前の年の 12月31日まで（消法37条1項）
  function kaniDeadline(year) {
    var y = V.years[year];
    return { tokurei: y.kigen, normal: (year - 1) + '-12-31' };
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
  function toExportFile(data, now) {
    return { tool: TOOL_ID, version: FILE_VERSION, exportedAt: (now || new Date()).toISOString(), data: normalizeInput(data) };
  }
  function fromExportFile(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, message: 'ファイルの形式が違います（JSON ではありません）。' };
    if (obj.tool !== TOOL_ID) return { ok: false, message: 'このツール（2割特例の後の消費税の比較）で書き出したファイルではありません。' };
    if (typeof obj.version !== 'number' || obj.version > FILE_VERSION) return { ok: false, message: '新しい版のファイルのため読み込めません。ページを再読み込みしてからお試しください。' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, message: 'ファイルに入力内容がありません。' };
    return { ok: true, data: normalizeInput(obj.data), exportedAt: obj.exportedAt };
  }

  var api = {
    TOOL_ID: TOOL_ID, FILE_VERSION: FILE_VERSION,
    calc: calc, normalizeInput: normalizeInput, keikaSegments: keikaSegments, kaniDeadline: kaniDeadline,
    finish: finish, tax78of110: tax78of110,
    toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (NODE) module.exports = api;
  else root.Invoice = api;
})(this);
