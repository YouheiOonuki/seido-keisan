// ===========================
// 人生の数字を 1 枚に（/seido-keisan/lifeplan/、yorozu-plans 企画書 102 の 5.2.8）— この画面だけが使う出典と確認日
// 年金の額・率は lib/kuriage-values.js（root の生成物）にあり、ここには置かない。ここに置くのは、
// ねんきん定期便の見込額が年齢によって何を表すか（画面の「年金の額の前提」の 1 文）の出典と、
// 見込額を入れたときに実際の額とずれる場合（画面の「注意」と「この画面で計算しないこと」。Q-213）の条文と日本年金機構のページだけ。where には原文に書いてあることだけを書く。値は持たない。
// ブラウザでは window.LifeplanValues、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var CHECKED = '2026-11-12';   // 下の出典を最後に原文で確かめた日（Q-181 で定期便の 3 つ、Q-213 で条文の 3 つを e-Gov 法令 API v2〈2026-10-01 施行の版〉と、日本年金機構「年金の繰下げ受給」を開いた）
  var TEIKI = 'https://www.nenkin.go.jp/service/nenkinkiroku/torikumi/teikibin/';
  var EGOV = 'https://laws.e-gov.go.jp/law/';
  var KURISAGE = 'https://www.nenkin.go.jp/service/jukyu/seido/roureinenkin/kuriage-kurisage/20140421-02.html';   // lib/kuriage-values.js の kurisage と同じ URL（guide の出典一覧では 1 行にまとまる）

  var SOURCES = [
    { key: 'teikibinPage', label: '日本年金機構「「ねんきん定期便」の様式（サンプル）と見方ガイド（令和8年度送付分）」（更新 2026年10月1日）', url: TEIKI + 'teikibin.html',
      where: '50歳未満の方・50歳以上の方・年金受給者の方ごとに、様式と見方ガイド（PDF）を掲載' },
    { key: 'teikibin50ijyou', label: '日本年金機構「令和８年度「ねんきん定期便」（ハガキ）の見方（50歳以上の方）」（PDF、令和8年10月以降送付分）', url: TEIKI + 'teikibin.files/hagakigaido50ijyou10.pdf',
      where: '「60歳未満の方は現在の年金加入制度に60歳まで継続して加入したと仮定して、65歳から受け取れる年金見込額を表示します。」／「60歳以上65歳未満の方は「ねんきん定期便」の作成時点の年金加入実績に応じて、65歳から受け取れる年金見込額を表示します。」' },
    { key: 'teikibin50miman', label: '日本年金機構「令和８年度「ねんきん定期便」（ハガキ）の見方（50歳未満の方）」（PDF、令和8年10月以降送付分）', url: TEIKI + 'teikibin.files/hagakigaido50miman10.pdf',
      where: '「３．これまでの加入実績に応じた年金額（年額）」。「50歳未満の方については、50歳以上の方とは異なり、これまでの加入実績を基に算出した老齢年金の額を表示しています。」' },
    { key: 'kouneiRei', label: '厚生年金保険法施行令（令和8年10月1日施行版）', url: EGOV + '329CO0000000110',
      where: '3条の5の2（繰下げの加算額 ＝ 受給権取得月の前月までの被保険者期間で法43条1項により計算した額 × 平均支給率 × 増額率〈千分の七 × 月数、百二十まで〉。平均支給率は、法46条1項で支給を停止するとされた額を除いた月ごとの支給率の平均）、6条の3（法附則7条の3の繰上げの減額率 ＝ 千分の四 × 請求日の属する月から65歳に達する日の属する月の前月までの月数）、8条の2の3（法附則13条の4の繰上げの減額率 ＝ 千分の四 × 請求日の属する月から特例支給開始年齢に達する日の属する月の前月までの月数）' },
    { key: 'kouneihoMikomi', label: '厚生年金保険法（令和8年10月1日施行版。見込額を入れたときの注意）', url: EGOV + '329AC0000000115',
      where: '44条の3第4項（繰下げの加算額は、43条1項の例で計算した額と46条1項の例で計算した支給停止額を勘案して政令で定める）、附則7条の3第2項（繰上げの請求は老齢基礎年金の繰上げと同時に行わなければならない）、附則13条の4（特別支給の老齢厚生年金を受けられる人の繰上げ）' },
    { key: 'kokunenhoMikomi', label: '国民年金法（令和8年10月1日施行版。見込額を入れたときの注意）', url: EGOV + '334AC0000000141',
      where: '附則9条の2第2項（繰上げの請求は厚生年金保険法附則7条の3第1項・13条の4第1項の繰上げと同時に行わなければならない）' },
    { key: 'kurisageMikomi', label: '日本年金機構「年金の繰下げ受給」（更新 2026年8月12日）', url: KURISAGE,
      where: '「老齢基礎年金と老齢厚生年金は別々に繰り下げすることができます。」／「加給年金額や振替加算額は増額の対象になりません。」' },
  ];

  var api = { CHECKED: CHECKED, SOURCES: SOURCES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LifeplanValues = api;
})(this);
