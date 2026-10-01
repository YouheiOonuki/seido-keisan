// ===========================
// 制度の計算機 — 手取りの計算（Japan take-home pay calculator、英語ページ）の値の表
// ここに置くのは「ほかの値ファイルに無い値」だけ（雇用保険料率・端数・居住者の区分・住民税の 1 月 1 日の出典）。
// 所得税は lib/tax2026.js、住民税は lib/juminzei-values.js、健康保険・厚生年金・介護は lib/ikukyu-values.js、
// 子ども・子育て支援金と標準賞与額の年度の上限は lib/shienkin-values.js、厚生年金の標準賞与額の上限は lib/dattai-values.js、
// 防衛特別所得税の予定は lib/kaitei-values.js（key: ntaBouei）を読む。値を写さない（GLOBAL 3.2・ACCEPTANCE 3 章 K61）。
// ブラウザでは window.TakeHomeValues、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var CHECKED = '2026-10-01';   // 下の出典を最後に原文で確かめた日

  var SOURCES = [
    { key: 'koyoRate', label: 'Ministry of Health, Labour and Welfare: Employment insurance rates for fiscal 2026 (Japanese leaflet)',
      ja: '厚生労働省「令和８（2026）年度雇用保険料率のご案内」', url: 'https://www.mhlw.go.jp/content/001692566.pdf',
      where: '令和8年4月1日〜令和9年3月31日。一般の事業 13.5/1,000（労働者負担 5/1,000・事業主負担 8.5/1,000）。令和7年度は労働者 5.5/1,000' },
    { key: 'koyoPage', label: 'Ministry of Health, Labour and Welfare: Employment insurance rates (Japanese)',
      ja: '厚生労働省「雇用保険料率について」', url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000108634.html',
      where: '上の PDF の掲載ページ' },
    { key: 'koyoHasu', label: 'Okinawa Labour Bureau: How premiums are calculated (Japanese)',
      ja: '沖縄労働局「保険料の計算方法」', url: 'https://jsite.mhlw.go.jp/okinawa-roudoukyoku/riyousha_mokuteki_menu/jigyounushi/kisotisiki/keisanhouho.html',
      where: '雇用保険の被保険者負担分は 賃金総額 × 労働者負担の率。賃金から源泉控除するときは 50銭以下切り捨て・50銭1厘以上切り上げ（特約があればそれによる）' },
    { key: 'kyoju', label: 'National Tax Agency: Tax Answer No.2875, residents and non-residents (Japanese)',
      ja: '国税庁 タックスアンサー No.2875「居住者と非居住者の区分」', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2875.htm',
      where: '居住者 ＝ 国内に住所を有し、または現在まで引き続き 1 年以上居所を有する個人。それ以外は非居住者' },
    { key: 'hikyoju', label: 'National Tax Agency: Tax Answer No.2884, withholding rates for non-residents (Japanese)',
      ja: '国税庁 タックスアンサー No.2884「非居住者等に対する源泉徴収・源泉徴収の税率」', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2884.htm',
      where: '（9）給与その他人的役務の提供に対する報酬：20.42パーセント' },
    { key: 'hikyojuEn', label: 'National Tax Agency: No.12006, tax on a non-resident’s income',
      ja: '国税庁 No.12006（英語）', url: 'https://www.nta.go.jp/english/taxes/individual/12006.htm',
      where: 'Non-resident unless you have a domicile or have had a residence continuously for one year or more in Japan' },
    { key: 'jan1', label: 'Tokyo Metropolitan Government Bureau of Taxation: Guide to Metropolitan Taxes 2024 (English), p.10',
      ja: '東京都主税局 英語の都税ガイドブック 2024 年版 10 ページ', url: 'https://www.tax.metro.tokyo.lg.jp/documents/d/tax/guidebook2024e',
      where: 'Per income levy is imposed in proportion to the income of the previous year. Residents living in Tokyo as of January 1 are subject to a per income levy and per capita levy' },
  ];

  var V = {
    CHECKED: CHECKED,
    STALE_MONTHS: 12,
    SOURCES: SOURCES,
    // 雇用保険の労働者負担（一般の事業。1,000 分のいくつ）。令和8年度（2026-04〜2027-03）
    koyo: { perMille: 5, validFrom: '2026-04', validTo: '2027-03' },
    // 社会保険料の率を読む月（子ども・子育て支援金が始まった 2026 年 4 月分。lib/ikukyu.js の monthlyPremium に渡す）
    premiumMonth: '2026-04',
    taxYear: 2026,        // 所得税は令和8年分（lib/tax2026.js）
    juminNendo: 2027,     // 住民税は令和9年度（令和8年の所得。2027 年 6 月〜2028 年 5 月に納める。lib/juminzei-values.js）
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = V;
  else root.TakeHomeValues = V;
})(this);
