// ===========================
// 制度の計算機 — 脱退一時金（Japan pension refund / Lump-sum Withdrawal Payment）の値の表（値・出典・確認日をセットで）
// どの値も下の SOURCES の原文（日本年金機構・国税庁・厚生労働省・e-Gov）を 2026-09-24 に読んで写した（yorozu-plans の企画書 16 の 4 章）。
// 日本語ページ（/seido-keisan/dattai-ichiji/）がこの値の持ち主で、英語ページ（/seido-keisan/en/pension-refund/）も同じファイルを読む（GLOBAL 3.2・D76）。
// ブラウザでは window.DattaiValues、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var CHECKED = '2026-09-24';   // 下の出典を最後に原文で確かめた日
  var JPS = 'https://www.nenkin.go.jp/';
  var DATTAI = JPS + 'service/jukyu/seido/sonota-kyufu/dattai-ichiji/';

  // 出典。label は日本語、en は英語ページの表示用
  var SOURCES = [
    { key: 'seido', label: '日本年金機構「脱退一時金の制度」（更新 2026-04-01）', en: 'Japan Pension Service: Lump-sum Withdrawal Payment system (Japanese, updated 1 Apr 2026)', url: DATTAI + '20150406.html', where: '要件（国籍・6月以上・10年・障害給付・住所・2年）、厚生年金の式（平均標準報酬額 × 支給率）、支給率の 2 つの表（最終月 2021-04 以降は 0.5〜5.5、2017-09〜2021-03 は 3.3 まで）、国民年金の一部免除の数え方' },
    { key: 'kokunen', label: '日本年金機構「国民年金の脱退一時金額」（更新 2026-04-01）', en: 'Japan Pension Service: National Pension refund amounts by fiscal year (Japanese, updated 1 Apr 2026)', url: DATTAI + '20210401_01.html', where: '基準月（最後に保険料を納付した月）の年度ごとの支給額。令和8年度〜令和3年度（60月まで）、令和2年度〜平成21年度（36月まで）' },
    { key: 'faq', label: '年金Q&A「脱退一時金を請求するにあたって、どのような点に注意すればよいですか」', en: 'Japan Pension Service Q&A: points to note when claiming (Japanese)', url: JPS + 'faq/jukyu/seido/sonota-kyufu/dattai-ichiji/2020042808.html', where: '国民年金と厚生年金は合算しない（4月＋4月では請求できない）。上限を超えて加入していても上限月数で計算し、それまでの全期間が加入期間でなくなる。転出届の後に請求' },
    { key: 'form', label: '日本年金機構「脱退一時金請求書（英語）」', en: 'Japan Pension Service: Lump-sum Withdrawal Payment Claim Form (English/Japanese PDF)', url: JPS + 'international/english/japanese-system/benefit/payment.files/A.pdf', where: '「日本に住所を有しなくなった日から 2 年以内」、厚生年金の脱退一時金は 20.42% を源泉徴収、国民年金は源泉徴収しない、退職所得の選択課税の申告で還付を受けられる場合がある、通算できる協定国 20 か国（2026年3月現在）' },
    { key: 'payment', label: '日本年金機構 Lump-sum Withdrawal Payments（英語ページ）', en: 'Japan Pension Service: Lump-sum Withdrawal Payments (English page)', url: JPS + 'international/english/japanese-system/benefit/payment.html', where: 'within two years since you leave Japan' },
    { key: 'grade', label: '日本年金機構「令和2年9月分（10月納付分）からの厚生年金保険料額表（令和8年度版）」', en: 'Japan Pension Service: Employees’ Pension contribution table from Sep 2020 (FY2026 edition, PDF)', url: JPS + 'service/kounen/hokenryo/ryogaku/ryogakuhyo/20200825.files/R08ryougaku.pdf', where: '標準報酬月額 1〜32 等級（88,000円〜650,000円）と報酬月額の区切り、保険料率 18.300%（平成29年9月〜）' },
    { key: 'hoshu', label: '日本年金機構「厚生年金保険の保険料」', en: 'Japan Pension Service: Employees’ Pension contributions (Japanese)', url: JPS + 'service/kounen/hokenryo/hoshu/20150515-01.html', where: '保険料率は平成29年9月から 18.3% で固定。標準賞与額は 1,000円未満切り捨て、1 回 150万円が上限' },
    { key: 'nta', label: '国税庁「退職所得の選択課税の記載例」', en: 'National Tax Agency: worked examples of the retirement-income tax return (Japanese PDF)', url: 'https://www.nta.go.jp/taxes/shiraberu/shinkoku/kisairei/pdf/taisyokusentaku.pdf', where: '（収入 − 退職所得控除額）÷ 2、控除は 40万円 × 勤続年数（80万円未満なら 80万円）、税額の速算表。記載例①: 1,000万円・10年 → 税 206,752円、源泉 1,429,400円 → 還付 1,222,648円。記載例②（厚生年金の脱退一時金）: 291,478円 → 源泉 59,519円・税 0円' },
    { key: 'jouyaku', label: '国税庁 質疑応答事例「みなし退職所得に対する租税条約の適用関係」（令和7年8月1日現在の法令等）', en: 'National Tax Agency Q&A: tax treaties and the pension refund (Japanese)', url: 'https://www.nta.go.jp/law/shitsugi/gensen/06/35.htm', where: '厚生年金の脱退一時金には給与所得条項が適用され、原則として日本でも課税される。この計算機は租税条約を入力にしない' },
    { key: 'qa', label: '年金Q&A（出国前の請求 2020042805、受取までの期間 2020042807、請求期限 2021040101、上限 2021040102、記入の注意 2021040103、出国のたびの請求 2020042810）', en: 'Japan Pension Service Q&A on claiming (Japanese)', url: JPS + 'faq/jukyu/seido/sonota-kyufu/dattai-ichiji/2020042807.html', where: '転出（予定）日以降に届くように郵送。書類に不備がなければ受付からおよそ 4 か月で支払い。受取口座は SWIFT（BIC）コードが必要（国内の金融機関を除く）' },
    { key: 'law', label: '厚生年金保険法 附則29条、国民年金法 附則9条の3の2、所得税法 30条・89条・171条・173条（e-Gov 法令検索）', en: 'Employees’ Pension Insurance Act, Supplementary Provisions Art. 29; National Pension Act, Suppl. Art. 9-3-2; Income Tax Act Arts. 30, 89, 171, 173 (e-Gov)', url: 'https://laws.e-gov.go.jp/law/329AC0000000115', where: '支給要件・額・上限を超えた期間の扱い（附則29条5項・9条の3の2第4項）。退職所得（30条。勤続5年以下で控除後300万円を超える部分は 1/2 にしない）、選択課税（171条・173条）' },
    { key: 'kyotei', label: '日本年金機構「協定を結んでいる国との協定発効時期および対象となる社会保障制度」（更新 2025-10-27）', en: 'Japan Pension Service: countries with social security agreements (Japanese, updated 27 Oct 2025)', url: JPS + 'service/shaho-kyotei/kunibetsu/kyoteitimesystem.html', where: '発効 24 か国。加入期間を通算できる 20 か国と、通算できない 4 か国（英国・韓国・中国・イタリア）' },
    { key: 'kaisei', label: '厚生労働省「年金制度改正法の主な改正内容」13 ページ（令和7年法律第74号）', en: 'MHLW: main points of the 2025 pension reform act, p. 13 (Japanese PDF)', url: 'https://www.mhlw.go.jp/content/12500000/001537487.pdf', where: '支給上限を 5 年から 8 年に、再入国許可の有効期間内は支給しない。施行は公布から 4 年以内の政令で定める日（2026-09-24 時点で未定）。この計算には入れていない' },
    { key: 'jougen', label: '厚生労働省「厚生年金等の標準報酬月額の上限の段階的引上げについて」', en: 'MHLW: staged rise of the top standard monthly remuneration (Japanese)', url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000147284_00024.html', where: '上限 65万円 → 2027年9月 68万円、2028年9月 71万円、2029年9月 75万円' },
  ];

  // --- 国民年金: 基準月（最後に保険料を納付した月）の年度ごとの支給額（円）。行は 6・12・…（「支給額計算に用いる数」）の順 ---
  // 「国民年金の脱退一時金額」の表をそのまま写した。令和3年度（FY2021）以降は 60 月まで（10 行）、令和2年度以前は 36 月まで（6 行）
  var KOKUNEN = {
    2026: [53760, 107520, 161280, 215040, 268800, 322560, 376320, 430080, 483840, 537600],
    2025: [52530, 105060, 157590, 210120, 262650, 315180, 367710, 420240, 472770, 525300],
    2024: [50940, 101880, 152820, 203760, 254700, 305640, 356580, 407520, 458460, 509400],
    2023: [49560, 99120, 148680, 198240, 247800, 297360, 346920, 396480, 446040, 495600],
    2022: [49770, 99540, 149310, 199080, 248850, 298620, 348390, 398160, 447930, 497700],
    2021: [49830, 99660, 149490, 199320, 249150, 298980, 348810, 398640, 448470, 498300],
    2020: [49620, 99240, 148860, 198480, 248100, 297720],
    2019: [49230, 98460, 147690, 196920, 246150, 295380],
    2018: [49020, 98040, 147060, 196080, 245100, 294120],
    2017: [49470, 98940, 148410, 197880, 247350, 296820],
    2016: [48780, 97560, 146340, 195120, 243900, 292680],
    2015: [46770, 93540, 140310, 187080, 233850, 280620],
    2014: [45750, 91500, 137250, 183000, 228750, 274500],
    2013: [45120, 90240, 135360, 180480, 225600, 270720],
  };

  // --- 厚生年金: 支給率（「脱退一時金の制度」の 2 つの表）。行は 6・12・… の順 ---
  // 最終月が 2021-04 以降: 60 月まで。2017-09〜2021-03: 36 月まで。どちらも 保険料率 × 1/2 × 数 を小数点以下 1 位に四捨五入した値
  var SHIKYURITSU = {
    from202104: [0.5, 1.1, 1.6, 2.2, 2.7, 3.3, 3.8, 4.4, 4.9, 5.5],
    from201709: [0.5, 1.1, 1.6, 2.2, 2.7, 3.3],
  };

  // --- 標準報酬月額（厚生年金 1〜32 等級）: [報酬月額がこの額未満なら, 標準報酬月額]。最後の行は 635,000円以上 ---
  // 「令和2年9月分からの厚生年金保険料額表（令和8年度版）」の報酬月額の欄をそのまま写した
  var GRADES = [
    [93000, 88000], [101000, 98000], [107000, 104000], [114000, 110000], [122000, 118000], [130000, 126000],
    [138000, 134000], [146000, 142000], [155000, 150000], [165000, 160000], [175000, 170000], [185000, 180000],
    [195000, 190000], [210000, 200000], [230000, 220000], [250000, 240000], [270000, 260000], [290000, 280000],
    [310000, 300000], [330000, 320000], [350000, 340000], [370000, 360000], [395000, 380000], [425000, 410000],
    [455000, 440000], [485000, 470000], [515000, 500000], [545000, 530000], [575000, 560000], [605000, 590000],
    [635000, 620000], [Infinity, 650000],
  ];

  // --- 社会保障協定（「協定を結んでいる国との協定発効時期…」更新 2025-10-27。請求書は 2026年3月現在で同じ 20 か国） ---
  // [キー, 英語名, 日本語名, 発効年月, 加入期間の通算ができるか]
  var KYOTEI = [
    ['de', 'Germany', 'ドイツ', '2000-02', true],
    ['gb', 'United Kingdom', '英国', '2001-02', false],
    ['kr', 'South Korea', '韓国', '2005-04', false],
    ['us', 'United States', 'アメリカ', '2005-10', true],
    ['be', 'Belgium', 'ベルギー', '2007-01', true],
    ['fr', 'France', 'フランス', '2007-06', true],
    ['ca', 'Canada', 'カナダ', '2008-03', true],
    ['au', 'Australia', 'オーストラリア', '2009-01', true],
    ['nl', 'Netherlands', 'オランダ', '2009-03', true],
    ['cz', 'Czech Republic', 'チェコ', '2009-06', true],
    ['es', 'Spain', 'スペイン', '2010-12', true],
    ['ie', 'Ireland', 'アイルランド', '2010-12', true],
    ['br', 'Brazil', 'ブラジル', '2012-03', true],
    ['ch', 'Switzerland', 'スイス', '2012-03', true],
    ['hu', 'Hungary', 'ハンガリー', '2014-01', true],
    ['in', 'India', 'インド', '2016-10', true],
    ['lu', 'Luxembourg', 'ルクセンブルク', '2017-08', true],
    ['ph', 'Philippines', 'フィリピン', '2018-08', true],
    ['sk', 'Slovakia', 'スロバキア', '2019-07', true],
    ['cn', 'China', '中国', '2019-09', false],
    ['fi', 'Finland', 'フィンランド', '2022-02', true],
    ['se', 'Sweden', 'スウェーデン', '2022-06', true],
    ['it', 'Italy', 'イタリア', '2024-04', false],
    ['at', 'Austria', 'オーストリア', '2025-12', true],
  ];

  var V = {
    CHECKED: CHECKED,
    STALE_MONTHS: 12,             // 確認日からこの月数がたったら画面に注意を出す（新年度の 4 月を過ぎたときの注意は画面側）
    SOURCES: SOURCES,
    KYOTEI_ASOF: '2025-10-27',    // 協定の一覧のページの更新日

    minMonths: 6,                 // 各制度 6 月以上（合算しない）
    step: 6,                      // 「数」は 6 月ごと
    cap60From: '2021-04',         // この月以降が最終月（基準月）なら上限 60 月。前は 36 月
    kouseiFrom: '2017-09',        // 厚生年金: この計算機が扱う最終月の最初（支給率の表がある範囲）
    kokunenFromFY: 2013,          // 国民年金: この計算機が扱う基準月の年度の最初（平成25年度）
    kokunen: KOKUNEN,
    shikyuritsu: SHIKYURITSU,
    hokenryoRitsu: 18.3,          // 厚生年金の保険料率（%）。平成29年9月から固定
    grades: GRADES,
    gradeTableTo: '2027-08',      // この等級表（上限 65万円）が使われる最後の月。2027-09 から上限 68万円（厚労省）
    bonus: { unit: 1000, cap: 1500000 },   // 標準賞与額: 1,000円未満切り捨て、1 回 150万円まで
    exempt: { q1: 3, half: 2, q3: 1 },     // 一部免除の月の数え方（4 分の何か）: 4分の1免除 ×3/4、半額 ×2/4、4分の3免除 ×1/4
    qualifyMonths: 120,           // 老齢年金の受給資格期間（10 年）。これ以上あると請求できない
    deadlineYears: 2,             // 日本に住所を有しなくなった日から 2 年以内
    gensen: 2042,                 // 源泉徴収 20.42%（万分率。1円未満切り捨て: 国税庁の記載例②で 291,478円 → 59,519円）

    // 退職所得の選択課税（所得税法 30条・89条・171条、国税庁の記載例）
    taishoku: {
      perYear: 400000, min: 800000,      // 退職所得控除: 40万円 × 勤続年数（80万円未満なら 80万円）。20 年以下の式（この計算機では 20 年を超えない）
      shortYears: 5, shortLimit: 3000000, // 勤続 5 年以下: 控除後 300万円を超える部分は 1/2 にしない（30条）
    },
    // 所得税の速算表（国税庁の記載例の「退職所得金額に対する税額」）。[課税退職所得がこの額以下, 税率 %, 控除額]
    sokusan: [
      [1949000, 5, 0],
      [3299000, 10, 97500],
      [6949000, 20, 427500],
      [8999000, 23, 636000],
      [17999000, 33, 1536000],
      [39999000, 40, 2796000],
      [Infinity, 45, 4796000],
    ],
    fukkou: 21,                   // 復興特別所得税 = 所得税 × 21/1000（1円未満切り捨て。記載例① 202,500円 → 4,252円）

    kyotei: KYOTEI,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = V;
  else root.DattaiValues = V;
})(this);
