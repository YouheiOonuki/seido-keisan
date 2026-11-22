// ===========================
// 退職金の税金（/seido-keisan/taishoku/。K213）— 画面から切り離した純粋関数（所得税の側。yorozu-plans 企画書 114 の 5 章・7 章）
// 退職金の額と勤続年数から、退職所得控除・退職所得・課税退職所得・所得税・所得税及び復興特別所得税（源泉徴収の額）・住民税（特別徴収の額）を出す。
// 値は lib/taishoku-values.js、速算表は lib/sokusan.js（正本）。
// 住民税は総務省のページに在る式だけで出す。短期退職手当等で 収入 − 控除 が 300万円を超える時は、そのページに式が無いので null（画面は値を出さない）。
// 入れた額を保存しない・送らない（このファイルは何も書き出さない）。
// ブラウザでは window.Taishoku、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var V = isNode ? require('./taishoku-values.js') : root.TaishokuValues;
  var S = isNode ? require('./sokusan.js') : root.Sokusan;

  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

  // 勤続年数: 年と月 → 1 年未満の端数を 1 年に切り上げた年。読めない入力は null
  function years(y, m) {
    y = Number(y); m = Number(m || 0);
    if (!isInt(y) || !isInt(m) || y < 0 || m < 0 || m > 11) return null;
    return y + (m > 0 ? 1 : 0);
  }

  // 退職所得控除額。勤続年数は切り上げた後の年（1 以上）
  function kojo(n, shogai) {
    var K = V.kojo;
    var k = n <= K.pivot ? Math.max(K.perYear * n, K.min) : K.base + K.perYearOver * (n - K.pivot);
    return k + (shogai ? K.shogai : 0);
  }

  // 区分: 'ippan'（一般）・'tanki'（短期。役員等でなく勤続 5 年以下）・'tokutei'（特定役員。役員等で勤続 5 年以下）
  // 勤続が 5 年を越える時は、役員等かを問わず一般
  function kubun(n, yakuin) {
    if (n > V.short.years) return 'ippan';
    return yakuin ? 'tokutei' : 'tanki';
  }

  // 退職所得の金額（1,000円未満を切り捨てる前）
  function shotoku(amount, k, kb) {
    var sa = Math.max(0, amount - k);
    if (kb === 'tokutei') return sa;
    if (kb === 'tanki' && sa > V.short.limit) return V.short.half + (amount - (V.short.limit + k));
    return sa / 2;
  }

  // 課税退職所得金額: 1,000円未満を切り捨て
  function kazei(s) { return Math.floor(s / V.unit) * V.unit; }

  // 所得税及び復興特別所得税（申告書を出した時の源泉徴収の額）: 所得税 × 102.1%、1円未満切り捨て
  function withFukko(tax) { return Math.floor(tax * V.gensen / 1000); }

  // 申告書を出していない時の源泉徴収の額: 支払金額 × 20.42%、1円未満切り捨て
  function noShinkoku(amount) { return Math.floor(amount * V.noShinkoku / 10000); }

  // 住民税（特別徴収の額。総務省のページ）: 退職所得の金額（1/2。勤続 5 年以内の役員等は 1/2 にしない）を 1,000円未満で切り捨て、
  // 市町村民税 6%・道府県民税 4% をそれぞれ 100円未満で切り捨て。
  // 短期で 収入 − 控除 が 300万円を超える時は、ページに式が無いので null
  function jumin(amount, k, kb) {
    var J = V.jumin;
    var sa = Math.max(0, amount - k);
    if (kb === 'tanki' && sa > V.short.limit) return null;
    var base = kb === 'tokutei' ? sa : sa / 2;
    var kz = Math.floor(base / J.unit) * J.unit;
    var cut = function (rate) { return Math.floor(kz * rate / 100 / J.taxUnit) * J.taxUnit; };
    var shi = cut(J.shi), ken = cut(J.ken);
    return { kazei: kz, shi: shi, ken: ken, total: shi + ken };
  }

  // 勤続年数（切り上げた後）を決めて、1 つの並びを出す
  function line(amount, n, yakuin, shogai) {
    var k = kojo(n, shogai);
    var kb = kubun(n, yakuin);
    var s = shotoku(amount, k, kb);
    var kz = kazei(s);
    var tax = S.tax(kz);
    var gensen = withFukko(tax);
    var j = jumin(amount, k, kb);
    var taxes = gensen + (j ? j.total : 0);
    // 帯の内訳（足すと退職金の額）: 控除で消える分・1/2 で消える分・税（所得税及び復興特別所得税と住民税）・残り（手取り）。
    // 住民税が出ない時（j が null）は、税は所得税及び復興特別所得税だけで、残りは住民税を引く前
    var kojoPart = Math.min(amount, k);
    var halfPart = Math.floor(Math.max(0, amount - k) - s);   // 1 円未満は残りの側へ
    var band = { kojo: kojoPart, half: halfPart, tax: taxes, rest: amount - kojoPart - halfPart - taxes, jumin: !!j };
    return {
      years: n, kubun: kb, kojo: k, shotoku: s, kazei: kz,
      shotokuzei: tax, gensen: gensen, jumin: j, tedori: j ? amount - taxes : null,
      noShinkoku: noShinkoku(amount),
      band: band,
    };
  }

  // 入力: { amount: 退職金の額（円）, years: 年, months: 月, yakuin: 役員等か（勤続 5 年以下の時だけ効く）, shogai: 障害が元の退職か }
  // 出力: ready、今の並び（now）と、勤続年数が 1 年短い時（shorter。1 年未満になる時は null）・長い時（longer）の同じ並び
  function calc(input) {
    input = input || {};
    var amount = Number(input.amount);
    var n = years(input.years, input.months);
    if (!isInt(amount) || amount < 0 || n === null || n < 1) return { ready: false };
    var yakuin = !!input.yakuin, shogai = !!input.shogai;
    return {
      ready: true,
      amount: amount,
      now: line(amount, n, yakuin, shogai),
      shorter: n > 1 ? line(amount, n - 1, yakuin, shogai) : null,
      longer: line(amount, n + 1, yakuin, shogai),
    };
  }

  var T = {
    years: years, kojo: kojo, kubun: kubun, shotoku: shotoku, kazei: kazei,
    withFukko: withFukko, noShinkoku: noShinkoku, jumin: jumin, line: line, calc: calc,
  };

  if (isNode) module.exports = T;
  else root.Taishoku = T;
})(this);
