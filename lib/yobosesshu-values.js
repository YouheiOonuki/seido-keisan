// ===========================
// 制度の計算機 — 子どもの定期の予防接種のスケジュールの値（値・出典・確認日をセットで）
// どの値も下の SOURCES の原文（e-Gov の予防接種法施行令・施行規則、厚生労働省「定期接種実施要領」令和8年10月1日改正の全文、
// 同「定期の予防接種における対象者の解釈について」（事務連絡 平成26年3月11日）、国立健康危機管理研究機構「日本の予防接種スケジュール」）を
// 2026-10-03 に読んで写した。定期接種の種類・対象年齢・標準的な接種期間は政令・省令・実施要領の改正で変わる（MAINTENANCE: 年 1 回と改正のたび）。
// 日付の決め方（lib/yobosesshu.js）:
//   m: 生後 n 月に達した日（n か月後の同じ日の前日。同じ日が無い月はその月の末日。事務連絡）
//   y: n 歳に達した日（n 歳の誕生日の前日。事務連絡）
//   d: 生まれた日から n 日後（出生 6 週 0 日後 ＝ 42 日後）
//   fyStart / fyEnd: n 歳に達した日の属する年度の初日（4 月 1 日）・末日（3 月 31 日）
//   school: 小学校就学の始期（6 歳の誕生日以後の最初の 4 月 1 日。学校教育法 17 条）から n 年（−1 ＝ 1 年前の日）。end は前日
// 範囲はどちらの端の日も含む（「至るまで」「達するまで」「未満」は事務連絡で端の日を含む）
// ブラウザでは window.YobosesshuValues、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var CHECKED = '2026-10-03';   // 下の出典を最後に原文で確かめた日
  var EGOV = 'https://laws.e-gov.go.jp/law/';

  var SOURCES = [
    { key: 'seirei', label: '予防接種法施行令 3 条（e-Gov 法令検索）', url: EGOV + '323CO0000000197', where: '定期接種の疾病と対象者。ジフテリア・百日せき・急性灰白髄炎・破傷風: 生後二月から生後九十月に至るまで（ジフテリア・破傷風は十一歳以上十三歳未満も）。麻しん・風しん: 生後十二月から生後二十四月に至るまで、五歳以上七歳未満で小学校就学の始期に達する日の一年前の日から前日まで。日本脳炎: 生後六月から生後九十月、九歳以上十三歳未満。結核・B型肝炎: 一歳に至るまで。肺炎球菌（小児）: 生後二月から生後六十月。HPV: 十二歳となる日の属する年度の初日から十六歳となる日の属する年度の末日までの女子。水痘: 生後十二月から生後三十六月' },
    { key: 'kisoku', label: '予防接種法施行規則 2 条の 2・2 条の 3（e-Gov 法令検索）', url: EGOV + '323M40000100036', where: 'Hib: 乾燥ヘモフィルスb型ワクチンは生後六十月、5種混合ワクチンは生後九十月まで。ロタ: 経口弱毒生ヒトロタウイルスワクチンは生後二十四週に至る日の翌日、五価経口弱毒生ロタウイルスワクチンは生後三十二週に至る日の翌日まで' },
    { key: 'youryou', label: '厚生労働省「定期接種実施要領」（改正後全文・令和8年10月1日改正）第2 各論', url: 'https://www.mhlw.go.jp/content/001744583.pdf', where: '各ワクチンの標準的な接種期間・回数・間隔（下の VACCINES の note に節の番号）' },
    { key: 'jimu', label: '厚生労働省 結核感染症課「定期の予防接種における対象者の解釈について」（事務連絡 平成26年3月11日）', url: 'https://www.mhlw.go.jp/bunya/kenkou/kekkaku-kansenshou21/dl/140624-01.pdf', where: '「生後1月」は翌月の同日の前日（同日が無ければ翌月の末日）。「1歳に達した」は誕生日の前日。「至るまで」「達するまで」「未満」はその日を含む。例: 平成25年4月1日生まれの「生後3月から生後6月に至るまでの間」は6月30日から9月30日まで' },
    { key: 'jihs', label: '国立健康危機管理研究機構「日本の予防接種スケジュール 最新版」（2026年8月1日〜、更新日 2026年9月24日）', url: 'https://id-info.jihs.go.jp/immunization/schedule/currently/index.html', where: '定期／任意予防接種スケジュールの図（突き合わせに使う。画面の値は政令・実施要領から）' },
    { key: 'gakko', label: '学校教育法 17 条（e-Gov 法令検索）', url: EGOV + '322AC0000000026', where: '子が満六歳に達した日の翌日以後における最初の学年の初めから小学校に就学させる' },
  ];

  // 回ごとの行。std: 標準的な接種期間、target: 定期接種として受けられる期間（政令・省令）
  // std が null の回は、前の回の日から数える（日付は出さず、間隔の文だけ）
  var VACCINES = [
    { id: 'hepb', name: 'B型肝炎', short: 'B型肝炎', target: [{ birth: true }, { m: 12 }], targetText: '1歳に至るまで（平成28年4月1日以後に生まれた人）',
      doses: [
        { label: '1回目', std: [{ m: 2 }, { m: 9 }] },
        { label: '2回目', std: null, gap: '1回目から27日以上' },
        { label: '3回目', std: null, gap: '1回目から139日以上' },
      ], note: '実施要領 第2の8。組換え沈降B型肝炎ワクチン', src: ['seirei', 'youryou'] },
    { id: 'rota', name: 'ロタウイルス', short: 'ロタ', target: [{ d: 42 }, { d: 224 }],
      targetText: '出生6週0日後から、1価ワクチンは24週0日後・5価ワクチンは32週0日後まで',
      doses: [
        { label: '1回目', std: [{ m: 2 }, { d: 104 }], stdText: '生後2か月から出生14週6日後まで' },
        { label: '2回目（5価は3回目まで）', std: null, gap: '27日以上（1価は2回、5価は3回）' },
      ], note: '実施要領 第2の9。出生15週0日後以降の1回目は安全性が確立されていないとされ、14週6日後までが望ましいとされている', src: ['seirei', 'kisoku', 'youryou'] },
    { id: 'go', name: '5種混合（ジフテリア・百日せき・破傷風・ポリオ・Hib）第1期', short: '5種混合', target: [{ m: 2 }, { m: 90 }], targetText: '生後2か月から生後90か月に至るまで',
      doses: [
        { label: '初回 1回目', std: [{ m: 2 }, { m: 7 }] },
        { label: '初回 2・3回目', std: null, gap: '20日以上（標準は20〜56日）の間隔で' },
        { label: '追加', std: null, gap: '初回の3回目から6か月以上（標準は6〜18か月）' },
      ], note: '実施要領 第2の1（1）', src: ['seirei', 'kisoku', 'youryou'] },
    { id: 'pcv', name: '小児の肺炎球菌', short: '小児肺炎球菌', target: [{ m: 2 }, { m: 60 }], targetText: '生後2か月から生後60か月に至るまで',
      doses: [
        { label: '初回 1回目', std: [{ m: 2 }, { m: 7 }], stdText: '生後2か月から7か月に至るまでに始める' },
        { label: '初回 2・3回目', std: null, gap: '27日以上の間隔で、標準は生後12か月まで' },
        { label: '追加', std: [{ m: 12 }, { m: 15 }], gap: '初回の終わりから60日以上あけて、生後12か月以後' },
      ], note: '実施要領 第2の5（1）。20価（当面は15価も）', src: ['seirei', 'youryou'] },
    { id: 'bcg', name: 'BCG（結核）', short: 'BCG', target: [{ birth: true }, { m: 12 }], targetText: '1歳に至るまで',
      doses: [{ label: '1回', std: [{ m: 5 }, { m: 8 }] }],
      note: '実施要領 第2の4。市区町村によって標準の時期と違う時期に行うことがある', src: ['seirei', 'youryou'] },
    { id: 'mr1', name: '麻しん風しん（MR）第1期', short: 'MR 1期', target: [{ m: 12 }, { m: 24 }], targetText: '生後12か月から生後24か月に至るまで',
      doses: [{ label: '1回', std: [{ m: 12 }, { m: 24 }], stdText: '対象の期間の早いうちに（実施要領）' }],
      note: '実施要領 第2の2（1）ア', src: ['seirei', 'youryou'] },
    { id: 'vari', name: '水痘（みずぼうそう）', short: '水痘', target: [{ m: 12 }, { m: 36 }], targetText: '生後12か月から生後36か月に至るまで',
      doses: [
        { label: '1回目', std: [{ m: 12 }, { m: 15 }] },
        { label: '2回目', std: null, gap: '1回目から3か月以上（標準は6〜12か月）' },
      ], note: '実施要領 第2の7', src: ['seirei', 'youryou'] },
    { id: 'je1', name: '日本脳炎 第1期', short: '日本脳炎 1期', target: [{ m: 6 }, { m: 90 }], targetText: '生後6か月から生後90か月に至るまで',
      doses: [
        { label: '初回 1・2回目', std: [{ y: 3 }, { y: 4 }], gap: '6日以上（標準は6〜28日）の間隔で2回' },
        { label: '追加', std: [{ y: 4 }, { y: 5 }], gap: '初回から6か月以上（標準はおおむね1年）' },
      ], note: '実施要領 第2の3（1）', src: ['seirei', 'youryou'] },
    { id: 'mr2', name: '麻しん風しん（MR）第2期', short: 'MR 2期', target: [{ school: -1 }, { school: 0, end: true }], targetText: '小学校に入る前の1年間（年長の4月1日から3月31日まで）',
      doses: [{ label: '1回', std: [{ school: -1 }, { school: 0, end: true }] }],
      note: '実施要領 第2の2（1）イ', src: ['seirei', 'gakko', 'youryou'] },
    { id: 'je2', name: '日本脳炎 第2期', short: '日本脳炎 2期', target: [{ y: 9 }, { y: 13 }], targetText: '9歳以上13歳未満',
      doses: [{ label: '1回', std: [{ y: 9 }, { y: 10 }] }], note: '実施要領 第2の3（2）', src: ['seirei', 'youryou'] },
    { id: 'dt2', name: '2種混合（ジフテリア・破傷風）第2期', short: '2種混合 2期', target: [{ y: 11 }, { y: 13 }], targetText: '11歳以上13歳未満',
      doses: [{ label: '1回', std: [{ y: 11 }, { y: 12 }] }], note: '実施要領 第2の1（16）', src: ['seirei', 'youryou'] },
    { id: 'hpv', name: 'HPV（ヒトパピローマウイルス）', short: 'HPV', girls: true,
      target: [{ fyStart: 12 }, { fyEnd: 16 }], targetText: '12歳となる日の属する年度の初日から16歳となる日の属する年度の末日まで（女子）',
      doses: [
        { label: '1回目', std: [{ fyStart: 13 }, { fyEnd: 13 }], stdText: '13歳となる日の属する年度' },
        { label: '2・3回目', std: null, gap: '1回目が15歳に至るまでなら6か月の間隔で計2回。または1回目の2か月後と6か月後の計3回' },
      ], note: '実施要領 第2の6（3）。9価ワクチン', src: ['seirei', 'youryou'] },
  ];

  // 画面の対象外の一覧（使い方ページと同じ）
  var OUT_OF_SCOPE = [
    '任意接種（おたふくかぜ・インフルエンザなど）',
    '5種混合以外の組み合わせ（4種混合と Hib・3種混合・不活化ポリオ）で始めた人の回数と間隔',
    'Hib・小児の肺炎球菌を遅れて始めた人の回数（始めた月齢で回数が減る）',
    '長期の療養で受けられなかった人の特例、日本脳炎の特例（平成7〜21年生まれの一部）',
    '妊婦の RS ウイルス、65歳以上のインフルエンザ・肺炎球菌・新型コロナ・帯状疱疹',
  ];

  var V = {
    CHECKED: CHECKED,
    STALE_MONTHS: 12,             // 確認日からこの月数がたったら画面に注意を出す
    SOURCES: SOURCES,
    VACCINES: VACCINES,
    OUT_OF_SCOPE: OUT_OF_SCOPE,
    YOURYOU_REVISION: '令和8年10月1日改正',
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = V;
  else root.YobosesshuValues = V;
})(this);
