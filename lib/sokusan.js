// ===========================
// 制度の計算機 — 所得税の速算表の正本（値・出典・確認日をセットで。yorozu-plans 企画書 114 の 7 章、D732）
// 国税庁 タックスアンサー No.2260「所得税の税率」の「所得税の速算表（平成27年分以後）」7 段を、原文の書き方のまま写した。
// 速算表が要る計算は、このファイルを読む（表を書き写さない）。今在る写し（dattai-values.js・iryohi-values.js・tax2026.js）の扱いは Q-960。
// ブラウザでは window.Sokusan、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var CHECKED = '2026-11-22';   // 下の出典を最後に原文で確かめた日

  var SOURCE = {
    key: 'ta2260',
    label: '国税庁 タックスアンサー No.2260 所得税の税率［令和8年4月1日現在法令等］',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm',
    law: '所得税法 89条',
    where: '「課税される所得金額（1,000円未満の端数金額を切り捨てた後の金額です。）」／「1,000円 から 1,949,000円まで 5％ 0円」…「40,000,000円 以上 45％ 4,796,000円」。例: 7,000,000円 × 0.23 − 636,000円 = 974,000円',
  };

  // [課税される所得金額がこの額以下, 税率 %, 控除額]。原文の「〜円まで」の額のまま
  var TABLE = [
    [1949000, 5, 0],
    [3299000, 10, 97500],
    [6949000, 20, 427500],
    [8999000, 23, 636000],
    [17999000, 33, 1536000],
    [39999000, 40, 2796000],
    [Infinity, 45, 4796000],
  ];
  var UNIT = 1000;   // 課税される所得金額は 1,000円未満を切り捨てる

  // 課税される所得金額 → 所得税の額（復興特別所得税を含まない）。1,000円未満は先に切り捨てる
  function tax(amount) {
    var t = Math.floor(Math.max(0, Number(amount) || 0) / UNIT) * UNIT;
    for (var i = 0; i < TABLE.length; i++) {
      if (t <= TABLE[i][0]) return Math.max(0, t * TABLE[i][1] / 100 - TABLE[i][2]);
    }
    return 0;
  }

  // その額に掛かる段（[上限, 税率 %, 控除額]）
  function row(amount) {
    var t = Math.floor(Math.max(0, Number(amount) || 0) / UNIT) * UNIT;
    for (var i = 0; i < TABLE.length; i++) if (t <= TABLE[i][0]) return TABLE[i];
    return TABLE[TABLE.length - 1];
  }

  var S = { CHECKED: CHECKED, SOURCE: SOURCE, TABLE: TABLE, UNIT: UNIT, tax: tax, row: row };

  if (typeof module !== 'undefined' && module.exports) module.exports = S;
  else root.Sokusan = S;
})(this);
