// ===========================
// 引越しの手続きの一覧（/seido-keisan/hikkoshi/。yorozu-plans K233、QUEUE Q-108、D488）— 手続きの項目・期限・出典
// どの項目も下の SOURCES の原文（e-Gov 法令 API v2 で 2026-11-05 に取得した現行版、日本年金機構・日本郵便のページ）を読んで書いた。
// 14 日・90 日は英語版の lib/moving-checklist-values.js と同じ条文なので、そちらの DAYS を読む（値を写さない）。
// 公的な期限を確かめていない手続き（電気・ガス・水道・銀行など）は期限を書かない（deadline: 'none'）。
// 法的助言ではない: 文は「何を・いつまでに・どこで」と根拠の条文だけにし、個別の判断は書かない。
// ブラウザでは window.HikkoshiValues、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var MV = isNode ? require('./moving-checklist-values.js') : root.MovingChecklistValues;

  var CHECKED = '2026-11-05';   // 下の出典を最後に原文で確かめた日
  var EGOV = 'https://laws.e-gov.go.jp/law/';

  // rev: 確かめた版（e-Gov の法令の版 ID）。保守で変わったら条文を読み直す
  var SOURCES = {
    jumin: { label: '住民基本台帳法', url: EGOV + '342AC0000000081', rev: '342AC0000000081_20261024_508AC0000000066' },
    bango: { label: '番号法（行政手続における特定の個人を識別するための番号の利用等に関する法律）', short: '番号法', url: EGOV + '425AC0000000027', rev: '425AC0000000027_20261001_507AC0000000087' },
    bangoRei: { label: '番号法施行令', url: EGOV + '426CO0000000155', rev: '426CO0000000155_20260710_508CO0000000220' },
    kokuhoKisoku: { label: '国民健康保険法施行規則', url: EGOV + '333M50000100053', rev: '333M50000100053_20261001_508M60000100144' },
    nenkinKisoku: { label: '国民年金法施行規則', url: EGOV + '335M50000100012', rev: '335M50000100012_20261001_508M60000100121' },
    nenkinKikou: { label: '日本年金機構「年金に加入している方が引越したときの手続き」（更新日 2019年6月3日）', short: '日本年金機構の案内', url: 'https://www.nenkin.go.jp/service/kokunen/kanyu/20120406.html' },
    jidou: { label: '児童手当法', url: EGOV + '346AC0000000073', rev: '346AC0000000073_20250601_504AC0000000068' },
    doukou: { label: '道路交通法', url: EGOV + '335AC0000000105', rev: '335AC0000000105_20260721_508AC0000000052' },
    sharyo: { label: '道路運送車両法', url: EGOV + '326AC0000000185', rev: '326AC0000000185_20260401_508AC0000000002' },
    hokan: { label: '自動車の保管場所の確保等に関する法律', short: '車庫法', url: EGOV + '337AC0000000145', rev: '337AC0000000145_20250601_504AC0000000068' },
    yubin: { label: '日本郵便「転居・転送サービス」', short: '日本郵便の案内', url: 'https://www.post.japanpost.jp/service/tenkyo/' },
  };

  var DAYS = {
    notice: MV.DAYS.notice,          // 14: 転入届・転居届（住基法 22 条・23 条）。国保・国民年金・カードの記録の変更も同じ 14 日（下の各条）
    cardPresent: MV.DAYS.cardPresent, // 90: 転入届から 90 日までにカードを出さないと失効（番号法施行令 14 条 3 号）
    jidou: 15,                       // 住所を変更した後 15 日以内に請求すれば、変更した日の属する月の翌月から（児童手当法 8 条 3 項）
    car: 15,                         // 変更登録・車検証の変更記録（道路運送車両法 12 条・67 条）、保管場所の届出（車庫法 7 条）
    postYears: 1,                    // 郵便の転送は届出日から 1 年間（日本郵便の案内）
  };

  // 引越しの種類
  var KINDS = [
    { id: 'other', label: 'ほかの市区町村へ' },
    { id: 'same', label: '同じ市区町村の中で' },
  ];
  // 当てはまるもの（チェック）。既定は全部入り（外すと行が消える）
  var HAS = [
    { id: 'card', label: 'マイナンバーカードがある' },
    { id: 'kokuho', label: '国民健康保険に入っている' },
    { id: 'nenkin', label: '国民年金の第1号・第3号被保険者' },
    { id: 'jidou', label: '児童手当を受けている' },
    { id: 'menkyo', label: '運転免許がある' },
    { id: 'car', label: '自動車を持っている' },
  ];

  // 手続き（並びがそのまま手続きの順）
  //   when: 'before'（引越しの前）・'after'（引越しの後）
  //   kind: 当てはまる引越しの種類（無ければ両方）。need: HAS の id（無ければ全員）
  //   deadline: { type: 'days', days: DAYS のキー }（引越しの日から。初日を数えない）・'before'（あらかじめ）・'soon'（速やかに）・'with'（転入届と同時に）・'none'（期限を書かない）
  //   text: 何をするか（{notice} などは DAYS の値に置き換える）。where: 窓口。basis: [出典のキー, 条]
  var ITEMS = [
    { id: 'tenshutsu', when: 'before', kind: 'other', deadline: 'before',
      name: '転出届',
      text: '引越しの前に、転出先と転出の予定日を届け出ます。',
      where: '今の住所の市区町村',
      basis: [['jumin', '24条']] },
    { id: 'yubin', when: 'before', deadline: 'none',
      name: '郵便の転送（転居届）',
      text: '転送は届出日から{postYears}年間です（転送を始めたい日からではありません）。',
      where: '郵便局の窓口・ポスト・e転居',
      basis: [['yubin', '']] },
    { id: 'lifeline', when: 'before', deadline: 'none',
      name: '電気・ガス・水道',
      text: '止める日と始める日を、契約している会社に伝えます。',
      where: '契約している会社',
      basis: [] },
    { id: 'tennyu', when: 'after', kind: 'other', deadline: { type: 'days', days: 'notice' },
      name: '転入届',
      text: '転入をした日から{notice}日以内に届け出ます。',
      where: '新しい住所の市区町村',
      basis: [['jumin', '22条']] },
    { id: 'tenkyo', when: 'after', kind: 'same', deadline: { type: 'days', days: 'notice' },
      name: '転居届',
      text: '転居をした日から{notice}日以内に届け出ます。',
      where: '住所の市区町村',
      basis: [['jumin', '23条']] },
    { id: 'cardIn', when: 'after', kind: 'other', need: 'card', deadline: 'with',
      name: 'マイナンバーカードの住所の書き換え',
      text: '転入届と同時にカードを出します。出さないまま転入届から{cardPresent}日たつと、カードは使えなくなります。',
      where: '新しい住所の市区町村',
      basis: [['bango', '17条6項'], ['bangoRei', '14条3号']] },
    { id: 'cardSame', when: 'after', kind: 'same', need: 'card', deadline: { type: 'days', days: 'notice' },
      name: 'マイナンバーカードの住所の書き換え',
      text: '住所が変わった日から{notice}日以内に届け出て、カードを出します。',
      where: '住所の市区町村',
      basis: [['bango', '17条8項']] },
    { id: 'kokuho', when: 'after', kind: 'other', need: 'kokuho', deadline: { type: 'days', days: 'notice' },
      name: '国民健康保険',
      text: '世帯主が、前の市区町村と新しい市区町村の両方に{notice}日以内に届け出ます。',
      where: '前の住所と新しい住所の市区町村',
      basis: [['kokuhoKisoku', '2条・4条・11条・12条']] },
    { id: 'kokuhoSame', when: 'after', kind: 'same', need: 'kokuho', deadline: { type: 'days', days: 'notice' },
      name: '国民健康保険',
      text: '世帯主の住所が変わったときは、世帯主が{notice}日以内に届け出ます。',
      where: '住所の市区町村',
      basis: [['kokuhoKisoku', '10条']] },
    { id: 'nenkin', when: 'after', need: 'nenkin', deadline: { type: 'days', days: 'notice' }, onlyIf: true,
      name: '国民年金の住所の変更',
      text: 'マイナンバーと基礎年金番号が結びついている人は、原則として届け出は要りません。結びついていない人は{notice}日以内に届け出ます（第1号は市区町村、第3号は配偶者の勤務先）。',
      where: '市区町村（第1号）・配偶者の勤務先（第3号）',
      basis: [['nenkinKisoku', '8条'], ['nenkinKikou', '']] },
    { id: 'jidou', when: 'after', kind: 'other', need: 'jidou', deadline: { type: 'days', days: 'jidou' },
      name: '児童手当',
      text: '新しい市区町村で認定の請求をし直します。引越しから{jidou}日以内なら、引越した月の翌月の分から受け取れます。過ぎると、請求した月の翌月からです。',
      where: '新しい住所の市区町村',
      basis: [['jidou', '7条3項・8条2項・3項']] },
    { id: 'car', when: 'after', need: 'car', deadline: { type: 'days', days: 'car' },
      name: '自動車（車検証の住所）',
      text: '車検証の変更記録を{car}日以内に受けます。登録された自動車は、変更登録も同時に申請します。',
      where: '新しい住所の運輸支局など',
      basis: [['sharyo', '12条・67条']] },
    { id: 'shako', when: 'after', need: 'car', deadline: { type: 'days', days: 'car' },
      name: '車庫（保管場所）',
      text: '車庫の場所が変わったら{car}日以内に届け出ます。変更登録に合わせて車庫の証明を取るときは、別の届け出は要りません。',
      where: '新しい車庫の場所の警察署',
      basis: [['hokan', '7条']] },
    { id: 'menkyo', when: 'after', need: 'menkyo', deadline: 'soon',
      name: '運転免許証の住所',
      text: '住所が変わったら、速やかに届け出て免許証に記載を受けます。',
      where: '新しい住所の警察署・運転免許センター',
      basis: [['doukou', '94条1項']] },
    { id: 'bank', when: 'after', deadline: 'none',
      name: '銀行・カード・携帯電話など',
      text: '住所の変更を、契約しているそれぞれの会社に届け出ます。',
      where: '契約している会社',
      basis: [] },
  ];

  // 期限の欄の言葉（deadline が日数でないもの）
  var DEADLINE_LABEL = { before: '引越しの前に（あらかじめ）', soon: '速やかに', with: '転入届と同時に', none: '期限は各社・郵便局の案内で' };

  var V = { CHECKED: CHECKED, STALE_MONTHS: 12, SOURCES: SOURCES, DAYS: DAYS, KINDS: KINDS, HAS: HAS, ITEMS: ITEMS, DEADLINE_LABEL: DEADLINE_LABEL };
  if (isNode) module.exports = V;
  else root.HikkoshiValues = V;
})(this);
