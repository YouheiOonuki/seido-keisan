// ===========================
// 制度の計算機 — 高校の授業料の支援（高校無償化）の値の表（値・出典・確認日をセットで）
// 令和8年度（2026年4月〜）の高等学校等就学支援金（新制度）と、東京都・大阪府・神奈川県の上乗せ。
// どの値も下の SOURCES の原文（e-Gov 法令検索・文部科学省・各都府県の公式ページ）を 2026-09-25 に読んで写した。
// ブラウザでは window.KokoValues、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var CHECKED = '2026-09-25';   // 下の出典を最後に原文で確かめた日
  var MEXT = 'https://www.mext.go.jp/';

  var SOURCES = [
    { key: 'law', label: '高等学校等就学支援金の支給に関する法律（令和8年法律第8号による改正後。2026-04-01 施行）', url: 'https://laws.e-gov.go.jp/law/422AC0000000018', where: '3条1項（日本国籍・特別永住者・永住者その他これに準ずる者で国内に住所がある者。所得の要件なし）、3条2項（在学 36 月まで）、5条1項（授業料の月額と支給限度額の少ないほう。減免があれば減免後の額）、6条2項（申請した月から支給）、7条（学校が代理受領して授業料に充てる）、附則2条2項（改正前から在学し、新制度の対象でない人は従前の例）' },
    { key: 'rei', label: '高等学校等就学支援金の支給に関する法律施行令（令和8年政令第88号による改正後）', url: 'https://laws.e-gov.go.jp/law/422CO0000000112', where: '2条（支給限度額の月額）。公立: 高校 9,900円・定時制 2,700円・通信制 520円・特別支援学校高等部 400円・高専 19,550円・専修学校 38,100円（通信制 28,100円）。私立: 38,100円（通信制 28,100円）。国立: 9,600円・特別支援 400円・高専 19,550円・専修 13,900円。単位制は総額 1,371,600円まで。1条（定時制・通信制の月は 3/4 月と数える → 48 月）' },
    { key: 'tsuchi', label: '文部科学省「高等学校等就学支援金の支給に関する法律の一部を改正する法律の施行等について（通知）」令和8年3月31日 7文科初第2880号', url: MEXT + 'a_menu/shotou/career/05010502/1408866_00004.htm', where: '所得制限の撤廃、国籍・在留資格の要件、国 3/4・都道府県 1/4 の負担、政令の月額表、単位制の 1 単位あたりの限度額（省令 7条4項。私立 18,528円・通信制 13,668円、公立 4,812円・定時制 1,740円・通信制 336円）、施行 2026-04-01、法律上の対象外の外国籍生徒は予算事業「高校生等・新修学支援」' },
    { key: 'gaiyo', label: '文部科学省「高等学校等就学支援金・新制度の概要」（2026-06-16 掲載 PDF）', url: MEXT + 'content/20260616-mxt_shuukyo03-100002595_7.pdf', where: '1ページ: 所得制限なし、支給上限額 11万8800円（公立）・45万7200円（私立）・私立通信制 33万7200円、対象者①〜⑦。3ページ: 学校種別の年額。4ページ: 支給期間 36 月（定時制・通信制 48 月）、単位制は年間 30 単位・通算 74 単位まで。5ページ: 令和2〜7年度の支給限度額（年収目安 590万円未満・590万円以上910万円未満）' },
    { key: 'leaflet', label: '文部科学省 リーフレット「高等学校等就学支援金・新制度【日本国籍の方用】」「新制度の対象外となる生徒への支援」（2026-06-16 掲載）', url: MEXT + 'content/20260616-mxt_shuukyo03-100002595_5.pdf', where: '私立高校（全日制等）45万7200円・所得上限なし。対象外の新入生（留学生を除く）: 年収約910万円未満の世帯に年額上限 39万6,000円（高校生等・新修学支援金）。対象外の在校生: 旧制度（経過措置）で 39万6,000円／11万8,800円、910万円以上は 11万8,800円' },
    { key: 'qa', label: '文部科学省「高等学校等就学支援金制度に関するQ＆A」', url: MEXT + 'a_menu/shotou/mushouka/1342600.htm', where: '対象の学校（高専は 1〜3 年）、サポート校は対象外、学校が受け取り授業料と相殺・差額は保護者が払う、原則として申請した月から支給、36 月（定時制・通信制 48 月）、授業料減免があれば残りに充てる' },
    { key: 'gaisan', label: '文部科学省「令和9年度概算要求」高等学校等就学支援金等（2026-09-03 掲載）', url: MEXT + 'content/20260901-mxt_shuukyo03-100002595_7.pdf', where: '令和9年度も支給上限額 11万8800円（公立）・45万7200円（私立）・私立通信制 33万7200円のまま要求（予算は未成立）' },
    { key: 'tokyo', label: '東京都私学財団「令和8年度私立高等学校等授業料軽減助成金（都の制度）」、東京都生活文化局の同名のページ（更新 2026-08-06）', url: 'https://www.shigaku-tokyo.or.jp/parents_index/pa_jugyoryo/', where: '生徒と保護者が都内在住（都外の学校も対象、通信制は都認可のみ）、所得制限なし。就学支援金 45万7,200円＋助成金上限 4万3,800円＝最大 50万1,000円。在学校の授業料が上限。施設費・積立費は含まない。申請は 7 月（特別申請 1 月）、振込は 10・12・3 月。都認可通信制は就学支援金の上限まで（助成なし）。対象: 全日制・定時制・中等教育学校後期課程・特別支援学校高等部・高専 1〜3 年・専修学校高等課程' },
    { key: 'tokyoGai', label: '東京都私学財団「外国籍等生徒の学費支援（授業料軽減助成金 都の制度）」', url: 'https://www.shigaku-tokyo.or.jp/parents_index/pa_jugyoryo/shinshugakugai/', where: '新制度の対象外の生徒: 算定基準額 304,200円以上 新入生 501,000円・在校生 382,200円、154,500円以上304,200円未満 382,200円、154,500円未満 105,000円。国の支援と合わせて 50万1,000円・授業料の範囲内。算定基準額＝課税標準額×6%−調整控除相当額（1人 1,500円）' },
    { key: 'osaka', label: '大阪府「令和8年度以降の授業料支援制度について」「よくある質問について」（どちらも更新 2026-09-11）', url: 'https://www.pref.osaka.lg.jp/o180160/shigaku/shigakumushouka/shigaku_mushoka_r6.html', where: '所得・子どもの人数の制限なし。生徒と保護者全員が府内在住、就学支援推進校（近畿2府4県）に在学。就学支援金と授業料支援補助金を合わせて標準授業料 年 63万円（通信制は 1 単位 12,030円）まで、超える分は学校が負担。対象は授業料と施設整備費等の経常的納付金。入学金・教科書代・修学旅行費は対象外。経過措置・新修学支援の所得判定は課税標準額×6%−調整控除（指定都市は 3/4）' },
    { key: 'kanagawa', label: '神奈川県「学費補助金について」（更新 2026-04-20）・令和8年度 私立高等学校等学費支援リーフレット', url: 'https://www.pref.kanagawa.jp/docs/v3e/jyosei/gakuhisien/gakuhihojyo.html', where: '生徒・保護者とも県内在住、県内の私立高校・中等教育学校後期課程・専修学校高等課程（通信制は本部校が県内）。授業料補助 年 22,800円（通信制 142,800円）、所得区分によらない。就学支援金と合わせて最大 480,000円。入学金補助は所得区分で 212,000円／100,000円（令和8年4月以降の入学）。上限が授業料を超える分は出ない' },
    { key: 'toiawase', label: '文部科学省「私立高等学校における就学支援金の問合せ先」「公立高等学校における就学支援金の問合せ先」', url: MEXT + 'a_menu/shotou/mushouka/1292214.htm', where: '都道府県ごとの窓口。上乗せの制度は都道府県ごとに要件が違う（Q&A 6）' },
  ];

  // --- 国の就学支援金（新制度）の支給限度額（施行令 2条。月額） ---
  // 学校の種類のキー: zen 高校全日制（中等教育学校後期課程を含む）、tei 定時制、tsu 通信制、toku 特別支援学校高等部、
  //                   kosen 高専（1〜3 年）、senshu 専修学校高等課程（通信制以外）、senshu_tsu 専修学校高等課程の通信制
  var MONTHLY = {
    kokuritsu: { zen: 9600, tei: 9600, tsu: 9600, toku: 400, kosen: 19550, senshu: 13900, senshu_tsu: 13900 },
    koritsu:   { zen: 9900, tei: 2700, tsu: 520,  toku: 400, kosen: 19550, senshu: 38100, senshu_tsu: 28100 },
    shiritsu:  { zen: 38100, tei: 38100, tsu: 28100, toku: 38100, kosen: 38100, senshu: 38100, senshu_tsu: 28100 },
  };
  // 単位制の 1 単位あたりの限度額（施行規則 7条4項。通知の表）。特別支援・高専は単位制の表が無い
  var PER_UNIT = {
    kokuritsu: { zen: 4668, tei: 4668, tsu: 4668, senshu: 6756, senshu_tsu: 6756 },
    koritsu:   { zen: 4812, tei: 1740, tsu: 336,  senshu: 18528, senshu_tsu: 13668 },
    shiritsu:  { zen: 18528, tei: 18528, tsu: 13668, senshu: 18528, senshu_tsu: 13668 },
  };
  // 支給期間（法 3条2項・施行令 1条。定時制・通信制は 1 月を 3/4 と数える → 48 月）
  var MONTHS = { zen: 36, tei: 48, tsu: 48, toku: 36, kosen: 36, senshu: 36, senshu_tsu: 48 };

  // --- 新制度の対象外の生徒（旧制度と同じ水準。概要 PDF 5 ページ「令和2〜7年度の支給限度額」、年額） ---
  // c: 年収目安 590万円未満（算定基準額 154,500円未満）、b: 590万円以上910万円未満
  var OLD = {
    kokuritsu: { c: { zen: 115200, tei: 115200, tsu: 115200, toku: 4800, kosen: 234600 }, b: { zen: 115200, tei: 115200, tsu: 115200, toku: 4800, kosen: 118800 } },
    koritsu:   { c: { zen: 118800, tei: 32400, tsu: 6240, toku: 4800, kosen: 234600, senshu: 396000, senshu_tsu: 297000 }, b: { zen: 118800, tei: 32400, tsu: 6240, toku: 4800, kosen: 118800, senshu: 118800, senshu_tsu: 118800 } },
    shiritsu:  { c: { zen: 396000, tei: 396000, tsu: 297000, toku: 396000, kosen: 396000, senshu: 396000, senshu_tsu: 297000 }, b: { zen: 118800, tei: 118800, tsu: 118800, toku: 118800, kosen: 118800, senshu: 118800, senshu_tsu: 118800 } },
  };
  var OLD_BASE = 118800;   // 910万円以上の在校生（経過措置・新修学支援金）の上限（国公私立共通）

  // --- 都道府県の上乗せ（確認したものだけ） ---
  var PREF = {
    tokyo: {
      name: '東京都', total: 501000, add: 43800,
      types: ['zen', 'tei', 'toku', 'kosen', 'senshu'],   // 通信制は都認可のみで、就学支援金の上限まで（助成なし）
      // 新制度の対象外の生徒（算定基準額の区分・新入生か在校生か）の助成額の上限
      gai: { aNew: 501000, aOld: 382200, b: 382200, c: 105000, ryugakuNew: 501000 },
      url: 'https://www.shigaku-tokyo.or.jp/parents_index/pa_jugyoryo/',
    },
    osaka: {
      name: '大阪府', standard: 630000, standardUnit: 12030,
      types: ['zen', 'senshu', 'tsu'],   // 通信制は 1 単位あたりの授業料の学校だけ
      url: 'https://www.pref.osaka.lg.jp/o180160/shigaku/shigakumushouka/shigaku_mushoka_r6.html',
      list: 'https://www.pref.osaka.lg.jp/o180160/shigaku/shigakumushouka/suishinkou_koukou_r8.html',
    },
    kanagawa: {
      name: '神奈川県', add: 22800, addTsu: 142800, total: 480000,
      types: ['zen', 'tei', 'tsu', 'senshu'],
      url: 'https://www.pref.kanagawa.jp/docs/v3e/jyosei/gakuhisien/gakuhihojyo.html',
      list: 'https://www.pref.kanagawa.jp/documents/8836/gakuhihojo_taishoukour80401.pdf',
    },
  };

  // 都道府県の一覧（上乗せを計算するのは PREF にある 3 都府県だけ）
  var PREFS = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
    '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];
  var PREF_KEY = { '東京都': 'tokyo', '大阪府': 'osaka', '神奈川県': 'kanagawa' };

  var V = {
    CHECKED: CHECKED,
    STALE_MONTHS: 12,
    nendo: '令和8年度',
    SOURCES: SOURCES,
    MONTHLY: MONTHLY, PER_UNIT: PER_UNIT, MONTHS: MONTHS,
    UNITS_YEAR: 30, UNITS_TOTAL: 74, UNIT_TOTAL_YEN: 1371600,
    OLD: OLD, OLD_BASE: OLD_BASE,
    PREF: PREF, PREFS: PREFS, PREF_KEY: PREF_KEY,
    TOIAWASE: { shiritsu: MEXT + 'a_menu/shotou/mushouka/1292214.htm', koritsu: MEXT + 'a_menu/shotou/mushouka/1292209.htm' },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = V;
  else root.KokoValues = V;
})(this);
