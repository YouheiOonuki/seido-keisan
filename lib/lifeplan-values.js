// ===========================
// 人生の数字を 1 枚に（/seido-keisan/lifeplan/、yorozu-plans 企画書 102 の 5.2.8）— この画面だけが使う出典と確認日
// 年金の額・率は lib/kuriage-values.js（root の生成物）にあり、ここには置かない。ここに置くのは、
// ねんきん定期便の見込額が年齢によって何を表すか（画面の「年金の額の前提」の 1 文）の出典だけ。値は持たない。
// ブラウザでは window.LifeplanValues、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var CHECKED = '2026-11-12';   // 下の出典を最後に原文で確かめた日（Q-181 で 3 つとも開いた）
  var TEIKI = 'https://www.nenkin.go.jp/service/nenkinkiroku/torikumi/teikibin/';

  var SOURCES = [
    { key: 'teikibinPage', label: '日本年金機構「「ねんきん定期便」の様式（サンプル）と見方ガイド（令和8年度送付分）」（更新 2026年10月1日）', url: TEIKI + 'teikibin.html',
      where: '50歳未満の方・50歳以上の方・年金受給者の方ごとに、様式と見方ガイド（PDF）を掲載' },
    { key: 'teikibin50ijyou', label: '日本年金機構「令和８年度「ねんきん定期便」（ハガキ）の見方（50歳以上の方）」（PDF、令和8年10月以降送付分）', url: TEIKI + 'teikibin.files/hagakigaido50ijyou10.pdf',
      where: '「60歳未満の方は現在の年金加入制度に60歳まで継続して加入したと仮定して、65歳から受け取れる年金見込額を表示します。」／「60歳以上65歳未満の方は「ねんきん定期便」の作成時点の年金加入実績に応じて、65歳から受け取れる年金見込額を表示します。」' },
    { key: 'teikibin50miman', label: '日本年金機構「令和８年度「ねんきん定期便」（ハガキ）の見方（50歳未満の方）」（PDF、令和8年10月以降送付分）', url: TEIKI + 'teikibin.files/hagakigaido50miman10.pdf',
      where: '「３．これまでの加入実績に応じた年金額（年額）」。「50歳未満の方については、50歳以上の方とは異なり、これまでの加入実績を基に算出した老齢年金の額を表示しています。」' },
  ];

  var api = { CHECKED: CHECKED, SOURCES: SOURCES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LifeplanValues = api;
})(this);
