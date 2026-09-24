// ===========================
// 制度の計算機 — 個人住民税の値の表（値・出典・確認日をセットで）
// 令和9年度分（令和8年＝2026 年の所得）と、比べるための令和8年度分（令和7年＝2025 年の所得）。
// 値はすべて地方税法・同施行令・同施行規則（e-Gov 法令検索の原文）と総務省の資料を読んで写した。
//   ・令和8年度分: 2026-09-24 時点で施行中の地方税法（法令 ID 325AC0000000226）
//   ・令和9年度分: 同じ法の 2027-01-01 施行版（325AC0000000226_20270101_508AC0000000002。令和8年法律第2号による改正後）
// 給与所得（給与所得控除後の金額）は「所得税の計算の例による」（地方税法 32 条・313 条）ので、
// 所得税（年末調整）の表 lib/kyuyo-table-<年>.js をそのまま使う（令和9年度分 → 2026 年の表、令和8年度分 → 2025 年の表）。
// ブラウザでは window.JuminzeiValues、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var CHECKED = '2026-09-24';   // 下の出典を最後に原文で確かめた日
  var EGOV = 'https://laws.e-gov.go.jp/law/325AC0000000226';
  var SOUMU = 'https://www.soumu.go.jp/';

  var SOURCES = [
    { key: 'law', label: '地方税法（e-Gov 法令検索）', url: EGOV, where: '23条・292条（定義）、295条（非課税）、310条・38条（均等割）、313条・314条の2（所得控除）、314条の3・35条（税率）、314条の6・37条（調整控除）、314条の7（寄附金税額控除）、320条・321条の5（納期・特別徴収）、20条の4の2（端数計算）、附則3条の3（所得割の非課税）、附則5条の4（住宅借入金等特別税額控除）、附則5条の6（特例控除の割合）' },
    { key: 'law2027', label: '地方税法（令和9年1月1日施行版。令和8年法律第2号による改正後）', url: 'https://laws.e-gov.go.jp/law/325AC0000000226/20270101_508AC0000000002', where: '292条1項7号・9号（同一生計配偶者・扶養親族の合計所得金額 62万円以下）' },
    { key: 'rei', label: '地方税法施行令（e-Gov 法令検索）', url: 'https://laws.e-gov.go.jp/law/325CO0000000245', where: '47条の3（均等割の非課税の基準）、48条の7の2（調整控除のひとり親の区分）' },
    { key: 'kisoku', label: '地方税法施行規則（e-Gov 法令検索）', url: 'https://laws.e-gov.go.jp/law/329M50000002023', where: '9条の21第2項（級地の率 1級地 1.0・2級地 0.9・3級地 0.8）' },
    { key: 'shinrin', label: '森林環境税及び森林環境譲与税に関する法律・同施行令（e-Gov 法令検索）', url: 'https://laws.e-gov.go.jp/law/431AC0000000003', where: '法4条（非課税）・5条（税率 1,000円）、施行令1条（非課税の金額）' },
    { key: 'kaisei8', label: '総務省「地方税法等の一部を改正する法律の概要」（令和8年度）', url: SOUMU + 'main_content/001063704.pdf', where: '1ページ「2．個人住民税」: 給与所得控除の最低保障額 74万円は令和9年度分から、非課税ライン（単身）110万円→119万円、ひとり親控除 33万円は令和10年度分から' },
    { key: 'yoko8', label: '総務省「地方税法等の一部を改正する法律要綱」（令和8年）', url: SOUMU + 'main_content/001060865.pdf', where: '1ページ 第1の1（1）同一生計配偶者・扶養親族の合計所得金額要件 62万円（令和9年度分から）' },
    { key: 'yasashii', label: '総務省「やさしい地方税 個人住民税」', url: SOUMU + 'main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_06.html', where: '所得割 10%（道府県民税 4%・市町村民税 6%、指定都市は 2%・8%）、均等割 4,000円（1,000円・3,000円）、森林環境税 1,000円' },
    { key: 'kinto', label: '総務省「個人住民税」（個人住民税均等割の概要・非課税限度額の図）', url: SOUMU + 'main_sosiki/jichi_zeisei/czaisei/czaisei_seido/149767_03.html', where: '非課税限度額 35万円×世帯人員＋10万円＋21万円、級地の率、単身の例（1級地 110万円・2級地 106.5万円・3級地 103万円。令和8年度）' },
    { key: 'furusato', label: '総務省 ふるさと納税ポータル「税金の控除について」', url: SOUMU + 'main_sosiki/jichi_zeisei/czaisei/czaisei_seido/furusato/mechanism/deduction.html', where: '控除額の計算（1）〜（3）′。特例分は住民税所得割額の2割まで' },
    { key: 'yokohama', label: '横浜市「令和８年度市民税・県民税・森林環境税の計算（例）」', url: 'https://www.city.yokohama.lg.jp/kurashi/koseki-zei-hoken/zeikin/y-shizei/kojin-shiminzei-kenminzei/kojin-shiminzei-shosai/kojinkeisan.html', where: '市区町村の公式の計算例（テストで数字を再現）' },
    { key: 'nagoya', label: '名古屋市「市民税・県民税の計算例」（令和8年度）', url: 'https://www.city.nagoya.jp/kurashi/zeikin/1037356/1011880/1011883/1011891.html', where: '市区町村の公式の計算例（テストで数字を再現）' },
  ];

  // 生命保険料の計算式（地方税法 314条の2 第1項5号）: 支払った金額が upTo 以下なら 金額 × rate ＋ add。最後の行を超えたら cap
  var SEIMEI_NEW = { bands: [[12000, 1, 0], [32000, 0.5, 6000], [56000, 0.25, 14000]], cap: 28000 };   // 新契約・介護医療・新個人年金
  var SEIMEI_OLD = { bands: [[15000, 1, 0], [40000, 0.5, 7500], [70000, 0.25, 17500]], cap: 35000 };   // 旧契約・旧個人年金

  // 年度に関係なく同じ値
  var COMMON = {
    // 基礎控除（314条の2 第2項）: [本人の合計所得金額がこの額以下, 控除額]。最後を超えたら 0
    kiso: [[24000000, 430000], [24500000, 290000], [25000000, 150000]],
    shogai: { ippan: 260000, tokubetsu: 300000, dokyoTokubetsu: 530000 },      // 314条の2 第1項6号・第3項
    kafu: 260000,                                                              // 同 8号
    kafuIncomeLimit: 5000000,                                                  // 292条1項11号・12号
    kinro: 260000,                                                             // 同 9号
    // 配偶者控除（同 10号）: 本人の合計所得金額 900万以下／950万以下／1,000万以下の 3 列
    haigushaHonnin: [9000000, 9500000, 10000000],
    haigusha: [330000, 220000, 110000],
    haigushaRojin: [380000, 260000, 130000],
    // 配偶者特別控除（同 10号の2）: 配偶者の合計所得金額 133万円以下まで。金額は式（juminzei.js の haigushaTokubetsuAmount）
    haigushaTokubetsuMax: 1330000,
    fuyo: { ippan: 330000, tokutei: 450000, rojin: 380000, dokyoRoshin: 450000 }, // 同 11号・第4項
    // 特定親族特別控除（同 12号）: 合計所得金額 123万円以下まで。金額は式（juminzei.js の tokuteiShinzokuAmount）
    tokuteiShinzokuMax: 1230000,
    seimei: { shinki: SEIMEI_NEW, kyuki: SEIMEI_OLD, bothCap: 28000, total: 70000 },
    // 地震保険料（同 5号の3）: 支払った金額の 1/2、25,000円まで。旧長期損害保険料は横浜市「所得控除（令和８年度課税以降）」の表
    jishin: { rate: 0.5, cap: 25000, oldLong: { bands: [[5000, 1, 0], [15000, 0.5, 2500]], cap: 10000 }, total: 25000 },

    // 所得割の標準税率（35条・314条の3）。% の値
    rate: { normal: { pref: 4, city: 6 }, shitei: { pref: 2, city: 8 } },
    // 均等割の標準税率（38条・310条）と森林環境税（森林環境税法 5条）
    kinto: { pref: 1000, city: 3000 },
    shinrin: 1000,

    // 調整控除（37条・314条の6）
    chosei: {
      honninLimit: 25000000,       // 本人の合計所得金額 2,500万円以下が対象
      line: 2000000,               // 合計課税所得金額 200万円
      base: 50000,                 // 5万円（基礎控除の差）
      pct: { normal: { pref: 2, city: 3 }, shitei: { pref: 1, city: 4 } },
      // 人的控除の差（37条1号イの表）
      diff: {
        shogai: 10000, tokubetsuShogai: 100000, dokyoTokubetsu: 220000,
        kafu: 10000, hitorioyaFather: 10000, hitorioyaMother: 50000,   // 施行令 48条の7の2（父は表の（3）、母は（4））
        kinro: 10000,
        haigusha: [50000, 40000, 20000], haigushaRojin: [100000, 60000, 30000],
        fuyo: { ippan: 50000, tokutei: 180000, rojin: 100000, dokyoRoshin: 130000 },
      },
    },

    // 非課税
    hikazei: {
      // 障害者・未成年者・寡婦・ひとり親で、前年の合計所得金額が 135万円以下（295条1項2号）
      tokubetsu: 1350000,
      // 所得割（附則3条の3）: 35万円 ×（同一生計配偶者＋扶養親族＋1）＋10万円（配偶者・扶養親族がいれば＋32万円）。級地による違いはない
      shotokuwari: { base: 350000, add: 100000, fuyoAdd: 320000 },
      // 均等割（295条3項・施行令47条の3・施行規則9条の21）: 35万円×率 ×（人数＋1）＋10万円（配偶者・扶養親族がいれば＋21万円×率）
      kintowari: { base: 350000, add: 100000, fuyoAdd: 210000 },
      kyuchi: { 1: 1.0, 2: 0.9, 3: 0.8 },
    },

    // 住宅借入金等特別税額控除（附則5条の4）。所得税から引ききれなかった額のうち上限まで
    jutaku: {
      share: { normal: { pref: 2, city: 3 }, shitei: { pref: 1, city: 4 } },   // 5 分のいくつ
      // 上限: 所得税の課税総所得金額等 × pct%（円の上限 yen）。特定取得（平成26年〜令和3年入居）は 7%
      normal: { normal: { pref: [2, 39000], city: [3, 58500] }, shitei: { pref: [1, 19500], city: [4, 78000] } },
      tokutei: { normal: { pref: [2.8, 54600], city: [4.2, 81900] }, shitei: { pref: [1.4, 27300], city: [5.6, 109200] } },
      kisoMinus: 480000,          // 居住年 平成28年〜令和7年は、所得税の基礎控除 − 48万円 を上限の計算に足す
    },

    // ふるさと納税の特例控除の割合（314条の7 第11項と附則5条の6。復興特別所得税を含めた率）
    // [課税総所得金額 − 人的控除差調整額 がこの額以下, 割合（%）]。0 を下回るときは 90%
    furusato: {
      table: [[1950000, 84.895], [3300000, 79.79], [6950000, 69.58], [9000000, 66.517], [18000000, 56.307], [40000000, 49.16], [Infinity, 44.055]],
      below0: 90,
      capPct: 20,                 // 特例控除は所得割額の 20% まで
      kisoMinus: 480000,          // 人的控除差調整額に（所得税の基礎控除 − 48万円）を足す（314条の7 第11項1号）
      jiko: 2000,                 // 自己負担 2,000円
    },
  };

  // 年度ごとに違う値
  var NENDO = {
    2027: {
      nendo: 2027, label: '令和9年度', short: 'R9',
      incomeYear: 2026, incomeLabel: '令和8年',     // 前年（この年の 1〜12 月の所得で計算）
      taxYear: 2026,                                // 給与所得の表・所得税（住宅ローン・ふるさと納税）の計算に使う年
      fuyoLimit: 620000,                            // 同一生計配偶者・扶養親族の合計所得金額（2027 年施行版 292条1項7号・9号）
      kinroLimit: 890000,                           // 勤労学生（314条の2 第9項が準用する所得税法 2条1項32号。2026-12-01 施行版で 89万円）
      hitorioya: 300000,                            // ひとり親控除（33万円は令和10年度分から）
      payFrom: '令和9年6月', payTo: '令和10年5月',
      furusatoYear: '令和8年',                      // この年度の住民税から引かれるふるさと納税の寄附の年
    },
    2026: {
      nendo: 2026, label: '令和8年度', short: 'R8',
      incomeYear: 2025, incomeLabel: '令和7年',
      taxYear: 2025,
      fuyoLimit: 580000,
      kinroLimit: 850000,
      hitorioya: 300000,
      payFrom: '令和8年6月', payTo: '令和9年5月',
      furusatoYear: '令和7年',
    },
  };
  Object.keys(NENDO).forEach(function (k) {
    var n = NENDO[k];
    Object.keys(COMMON).forEach(function (c) { if (!(c in n)) n[c] = COMMON[c]; });
  });

  var V = {
    CHECKED: CHECKED,
    STALE_MONTHS: 12,
    CURRENT: 2027,        // 画面で計算する年度（令和9年度）
    PREVIOUS: 2026,       // 比べる年度（令和8年度）
    SOURCES: SOURCES,
    nendo: NENDO,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = V;
  else root.JuminzeiValues = V;
})(this);
