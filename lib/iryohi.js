// ===========================
// 医療費控除の計算（画面から切り離した純粋関数）
// 手順は国税庁「医療費控除の明細書」「セルフメディケーション税制の明細書」の控除額の計算欄のとおり:
//   医療費控除 = （支払った医療費 − 補てん額）− min(10万円, 総所得金額等 × 5%)（最高200万円）
//   セルフメディケーション = （対象医薬品の購入費 − 補てん額）− 1万2千円（最高8万8千円）。どちらか一方だけ
// 戻る所得税は「控除を入れる前の税額 − 入れた後の税額」（どちらも 102.1% 込み）。
//   給与だけの人は、年末調整どおりに源泉徴収されている前提で、前の税額を年調年税額（100円未満切り捨て）とする
// 住民税の減額は 控除額 × 10%（所得割の標準税率）の目安。
// 値は lib/iryohi-values.js、給与所得の表・基礎控除は lib/tax2026.js と lib/nenmatsu.js を使う。DOM や localStorage には触らない。
// ブラウザでは window.Iryohi、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var NODE = typeof module !== 'undefined' && module.exports;
  var V = NODE ? require('./iryohi-values.js') : root.IryohiValues;
  var TAX = NODE ? require('./tax2026.js') : root.TaxValues;
  var N = NODE ? require('./nenmatsu.js') : root.Nenmatsu;

  var TOOL_ID = 'seido-keisan-iryohi';
  var FILE_VERSION = 1;
  var Y = V.year;

  function yen(n) { return Number(n).toLocaleString('ja-JP') + '円'; }

  // --- 医療費控除（通常） ---
  // 戻り値 { a, b, c, d, e, f, kojo, capped }（明細書の A〜F の記号どおり）
  function iryohiKojo(hiyo, hoten, shotoku) {
    var a = Math.max(0, hiyo || 0), b = Math.max(0, hoten || 0);
    var c = Math.max(0, a - b);
    var d = shotoku || 0;
    var e = d < 0 ? 0 : Math.floor(d * V.iryohi.pct / 100);
    var f = Math.min(e, V.iryohi.floor);
    var raw = Math.max(0, c - f);
    return { a: a, b: b, c: c, d: d, e: e, f: f, kojo: Math.min(raw, V.iryohi.cap), capped: raw > V.iryohi.cap };
  }

  // --- セルフメディケーション税制 ---
  function selfKojo(amount, hoten) {
    var a = Math.max(0, amount || 0), b = Math.max(0, hoten || 0);
    var c = Math.max(0, a - b);
    var raw = Math.max(0, c - V.self.floor);
    return { a: a, b: b, c: c, kojo: Math.min(raw, V.self.cap), capped: raw > V.self.cap };
  }

  // --- 所得税 ---
  function bracket(taxable) {
    var t = V.sokusan;
    for (var i = 0; i < t.length; i++) if (taxable <= t[i][0]) return { pct: t[i][1], minus: t[i][2] };
    return null;
  }
  function floor1000(x) { return Math.max(0, Math.floor(x / 1000) * 1000); }
  // 確定申告の税額（1円単位）: 課税所得（1,000円未満切り捨て）→ 速算表 → 基準所得税額 × 2.1%（1円未満切り捨て）を足す
  function shinkokuTax(taxableRaw) {
    var taxable = floor1000(taxableRaw);
    var br = bracket(taxable);
    var kijun = Math.max(0, Math.floor(taxable * br.pct / 100) - br.minus);
    var fukko = Math.floor(kijun * V.fukkou / 1000);
    return { taxable: taxable, pct: br.pct, minus: br.minus, kijun: kijun, fukko: fukko, total: kijun + fukko };
  }
  // 年末調整の年税額: 年調所得税額 × 102.1%、100円未満切り捨て（年末調整のしかた 109.pdf 39 ページ）
  function nenchoTax(taxableRaw) {
    var s = shinkokuTax(taxableRaw);
    s.total = Math.floor(s.kijun * TAX.years[Y].fukkou / 100000) * 100;
    return s;
  }

  // 給与の収入 → 給与所得（令和8年分の表。2,000 万円を超えたら 収入 − 195 万円）
  function kyuyoShotoku(income) {
    var t = TAX.years[Y].kyuyoTable;
    if (income > t.max) return { value: income - 1950000, rule: '給与の収入が2,000万円を超えるので 収入 − 195万円' };
    return N.kyuyoShotoku(income, Y);
  }

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
    var s = r.self && typeof r.self === 'object' ? r.self : {};
    var rate = Number(r.rate);
    return {
      hiyo: amount(r.hiyo),                                    // 支払った医療費の合計
      hoten: amount(r.hoten),                                  // 保険金などで補てんされる金額
      mode: pick(r.mode, ['kyuyo', 'shotoku'], 'kyuyo'),       // 所得の入れ方
      income: amount(r.income),                                // 給与の収入金額（源泉徴収票の支払金額）
      shotoku: amount(r.shotoku),                              // 総所得金額等（直接入れるとき）
      kojo: amount(r.kojo),                                    // 所得控除の合計（医療費控除を入れる前）
      shakai: amount(r.shakai),                                // 所得控除がわからないときの社会保険料
      rateMode: pick(r.rateMode, ['auto', 'manual'], 'auto'),
      rate: V.rates.indexOf(rate) >= 0 ? rate : 10,
      self: { use: !!s.use, torikumi: !!s.torikumi, amount: amount(s.amount), hoten: amount(s.hoten) },
      jumin: r.jumin === undefined ? true : !!r.jumin,
    };
  }

  /**
   * 医療費控除と、戻る税金の目安を計算する
   * @returns {object} { ready, missing[], shotoku, kojoTotal, iryohi, self, best, kojo, tax, jumin, total, steps[] }
   */
  function calc(input) {
    var d = normalizeInput(input);
    var steps = [];
    var push = function (key, label, amt, rule, cls) { steps.push({ key: key, label: label, amount: amt, rule: rule || '', cls: cls || '' }); };
    var missing = [];
    if (d.hiyo === null && !(d.self.use && d.self.amount !== null)) missing.push('hiyo');

    // 1. 総所得金額等
    var shotoku = null, kyuyo = null;
    if (d.mode === 'kyuyo') {
      if (d.income === null) missing.push('income');
      else { kyuyo = kyuyoShotoku(d.income); shotoku = kyuyo.value; }
    } else {
      if (d.shotoku === null) missing.push('shotoku');
      else shotoku = d.shotoku;
    }
    // 2. 所得控除の合計（医療費控除の前）: 入力 → なければ 社会保険料 ＋ 基礎控除 で見積もる
    var kojoTotal = null, kojoEstimated = false;
    if (d.kojo !== null) kojoTotal = d.kojo;
    else if (d.shakai !== null && shotoku !== null) { kojoTotal = d.shakai + N.kisoKojo(shotoku, Y); kojoEstimated = true; }
    if (kojoTotal === null && d.rateMode === 'auto') missing.push('kojo');

    var res = { ready: false, missing: missing, input: d, steps: steps, label: V.label };
    if (shotoku === null || (d.hiyo === null && !(d.self.use && d.self.amount !== null))) return res;

    // 3. 控除額（通常・セルフ）
    var ir = iryohiKojo(d.hiyo || 0, d.hoten || 0, shotoku);
    var sf = d.self.use ? selfKojo(d.self.amount || 0, d.self.hoten || 0) : null;
    var selfOk = !!(sf && d.self.torikumi);
    var best = 'iryohi';
    if (selfOk && sf.kojo > ir.kojo) best = 'self';
    var kojo = best === 'self' ? sf.kojo : ir.kojo;
    if (kojo === 0) best = 'none';

    if (d.mode === 'kyuyo') {
      push('income', '給与の収入金額', d.income, '入力した金額（源泉徴収票の「支払金額」）');
      push('kyuyo', '給与所得（総所得金額等）', shotoku, V.label + 'の給与所得控除後の給与等の金額の表: ' + kyuyo.rule);
    } else {
      push('shotoku', '総所得金額等', shotoku, '入力した金額');
    }
    push('a', '支払った医療費（A）', ir.a, '入力した金額');
    push('b', '保険金などで補てんされる金額（B）', ir.b, '入力した金額');
    push('c', '差引金額（C）', ir.c, 'A − B（マイナスは 0）');
    push('e', '総所得金額等 × 5%（E）', ir.e, yen(shotoku) + ' × 5%（1円未満切り捨て）');
    push('f', '引く額（F）', ir.f, 'E と 10万円の少ないほう' + (shotoku < 2000000 ? '（総所得金額等が200万円未満なので 5%）' : ''));
    push('iryohi', '医療費控除額', ir.kojo, 'C − F（赤字は 0' + (ir.capped ? '。200万円が上限' : '、最高200万円') + '）', 'total');
    if (sf) {
      push('selfA', 'セルフメディケーション税制: 対象医薬品の購入費', sf.a, '入力した金額');
      if (sf.b) push('selfB', '　うち保険金などで補てんされる金額', sf.b, '入力した金額');
      push('self', 'セルフメディケーション税制の控除額', sf.kojo,
        (sf.b ? '（購入費 − 補てん額）' : '購入費') + ' − 1万2千円（赤字は 0' + (sf.capped ? '。8万8千円が上限' : '、最高8万8千円') + '）' +
        (d.self.torikumi ? '' : '。健康診断などの取組がないと使えません'), 'total');
    }

    // 4. 戻る所得税
    var tax = null;
    if (d.rateMode === 'manual') {
      var simple = Math.floor(kojo * d.rate / 100);
      var refundM = simple + Math.floor(simple * V.fukkou / 1000);
      tax = { manual: true, rate: d.rate, refund: refundM };
      push('refund', '戻る所得税（目安）', refundM, '控除額 ' + yen(kojo) + ' × 税率 ' + d.rate + '%（入力）× 102.1%', 'total');
    } else if (kojoTotal !== null) {
      var before = d.mode === 'kyuyo' ? nenchoTax(shotoku - kojoTotal) : shinkokuTax(shotoku - kojoTotal);
      var after = shinkokuTax(shotoku - kojoTotal - kojo);
      var refund = Math.max(0, before.total - after.total);
      var afterBr = bracket(after.taxable);
      tax = { manual: false, before: before, after: after, refund: refund, rate: before.pct, rateAfter: afterBr.pct, sameBracket: before.pct === afterBr.pct };
      push('kojoTotal', '所得控除の合計（医療費控除の前）', kojoTotal, kojoEstimated ? '見積もり: 社会保険料 ' + yen(d.shakai) + ' ＋ 基礎控除 ' + yen(kojoTotal - d.shakai) : '入力した金額');
      push('taxable0', '課税所得（医療費控除の前）', before.taxable, '総所得金額等 − 所得控除の合計（1,000円未満切り捨て）');
      push('tax0', d.mode === 'kyuyo' ? '所得税（年末調整の年税額）' : '所得税（医療費控除の前）', before.total,
        '速算表 ' + before.pct + '%' + (before.minus ? ' − ' + yen(before.minus) : '') + ' = ' + yen(before.kijun) + '、× 102.1%' + (d.mode === 'kyuyo' ? '（100円未満切り捨て）' : '（復興特別所得税は1円未満切り捨て）'));
      push('taxable1', '課税所得（医療費控除の後）', after.taxable, '前の課税所得の計算から さらに ' + yen(kojo) + ' を引く（1,000円未満切り捨て）');
      push('tax1', '所得税（確定申告）', after.total, '速算表 ' + after.pct + '%' + (after.minus ? ' − ' + yen(after.minus) : '') + ' = ' + yen(after.kijun) + ' ＋ 復興特別所得税 ' + yen(after.fukko));
      push('refund', '戻る所得税（目安）', refund, '前の税額 − 後の税額' + (tax.sameBracket && refund ? '（税率 ' + before.pct + '% のまま。およそ 控除額 × ' + before.pct + '% × 102.1%）' : ''), 'total');
    }

    // 5. 住民税（翌年度）
    var jumin = null;
    if (d.jumin) {
      jumin = Math.floor(kojo * V.jumin / 100);
      push('jumin', V.jumindo + 'の住民税の減額（目安）', jumin, '控除額 × 10%（所得割の標準税率）', 'total');
    }

    res.ready = tax !== null;
    res.shotoku = shotoku;
    res.kyuyo = kyuyo;
    res.kojoTotal = kojoTotal;
    res.kojoEstimated = kojoEstimated;
    res.iryohi = ir;
    res.self = sf;
    res.selfOk = selfOk;
    res.best = best;
    res.kojo = kojo;
    res.tax = tax;
    res.jumin = jumin;
    res.total = (tax ? tax.refund : 0) + (jumin || 0);
    res.noTax = !!(tax && !tax.manual && tax.before.total === 0);
    return res;
  }

  // --- ファイルへの書き出し・読み込み（D31） ---
  function toExportFile(data, now) {
    return { tool: TOOL_ID, version: FILE_VERSION, exportedAt: (now || new Date()).toISOString(), data: normalizeInput(data) };
  }
  function fromExportFile(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, message: 'ファイルの形式が違います（JSON ではありません）。' };
    if (obj.tool !== TOOL_ID) return { ok: false, message: 'このツール（医療費控除の計算）で書き出したファイルではありません。' };
    if (typeof obj.version !== 'number' || obj.version > FILE_VERSION) return { ok: false, message: '新しい版のファイルのため読み込めません。ページを再読み込みしてからお試しください。' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, message: 'ファイルに入力内容がありません。' };
    return { ok: true, data: normalizeInput(obj.data), exportedAt: obj.exportedAt };
  }

  var api = {
    TOOL_ID: TOOL_ID, FILE_VERSION: FILE_VERSION,
    iryohiKojo: iryohiKojo, selfKojo: selfKojo, bracket: bracket,
    shinkokuTax: shinkokuTax, nenchoTax: nenchoTax, kyuyoShotoku: kyuyoShotoku,
    calc: calc, normalizeInput: normalizeInput, toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (NODE) module.exports = api;
  else root.Iryohi = api;
})(this);
