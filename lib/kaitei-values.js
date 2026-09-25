// ===========================
// 制度の計算機 — 制度の改定カレンダー（公開版）のデータ（施行日・何が変わるか・影響するツール・出典）
// 内部の保守カレンダー（yorozu-plans の docs/MAINTENANCE.md）から「施行日と影響の行」だけを公開する（K78・企画書 24）。
// どの日付も下の出典の原文（e-Gov 法令検索の施行日ごとの版・国税庁・厚生労働省・日本年金機構・こども家庭庁・
// 文部科学省・総務省・法務省）を 2026-09-25 に読んで確かめた。確かめられないものは載せない。
// 法律になっていないもの（大綱・法案）と施行日が政令待ちのものは ITEMS に入れず PENDING に置く（.ics にも入れない）。
// ページ（kaitei/index.html）の一覧はこのファイルから tools/build-kaitei.mjs で書き出す（手で直さない）。
// ブラウザでは window.KaiteiValues、Node（テスト・書き出し）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var CHECKED = '2026-09-25';   // 下の出典を最後に原文で確かめた日
  var EGOV = 'https://laws.e-gov.go.jp/law/';
  var NTA = 'https://www.nta.go.jp/';
  var MHLW = 'https://www.mhlw.go.jp/';
  var JPS = 'https://www.nenkin.go.jp/';

  // 出典（行から key で引く）。url は原文、where は確かめた箇所
  var SOURCES = [
    { key: 'ntaKiso7', label: '国税庁「令和７年度税制改正による所得税の基礎控除の見直し等に関するＱ＆Ａ」', url: NTA + 'publication/pamph/gensen/0025005-051.pdf', where: '令和7年12月1日に施行、令和7年分以後の所得税に適用。特定親族は19歳以上23歳未満、合計所得金額58万円超123万円以下' },
    { key: 'ntaKiso8', label: '国税庁「令和８年度税制改正（所得税の基礎控除の引上げ等関係）Ｑ＆Ａ」', url: NTA + 'users/gensen/2026kiso/pdf/0026005-024.pdf', where: 'Q1-1: 基礎控除の引上げ・給与所得控除の最低保障額・扶養親族等の所得要件は令和8年12月1日施行、令和8年分以後に適用。源泉徴収税額表の改正は令和9年1月1日施行' },
    { key: 'ntaAramashi8', label: '国税庁「源泉所得税の改正のあらまし」（令和8年4月）', url: NTA + 'publication/pamph/gensen/2026kaisei.pdf', where: '基礎控除 令和8・9年分 104万円（合計所得489万円以下）、令和10年分以後は132万円以下で99万円。給与所得控除の最低保障額 令和8・9年分 74万円・令和10年分以後 69万円。扶養親族等の所得要件 62万円以下、勤労学生 89万円以下' },
    { key: 'ntaBouei', label: '国税庁「防衛特別所得税及び復興特別所得税の源泉徴収のあらまし（令和９年１月以後の源泉徴収）」', url: NTA + 'publication/pamph/pdf/0026005-024_02.pdf', where: '防衛特別所得税（所得税額の1%）を創設、復興特別所得税は2.1%→1.1%。令和9年1月1日以後に生ずる所得に適用。合計2.1%は同じ' },
    { key: 'shotoku2027', label: '所得税法（令和9年1月1日施行版。令和8年法律第12号による改正後）', url: EGOV + '340AC0000000033/20270101_508AC0000000012', where: '81条 ひとり親控除 35万円→38万円' },
    { key: 'sochi2027', label: '租税特別措置法（令和9年1月1日施行版。令和8年法律第12号による改正後）', url: EGOV + '332AC0000000026/20270101_508AC0000000012', where: '41条の17 セルフメディケーション税制: スイッチOTC医薬品は平成29年1月1日以後（期限なし）、それ以外は令和13年12月31日まで' },
    { key: 'chiho2027', label: '地方税法（令和9年1月1日施行版。令和8年法律第2号による改正後）', url: EGOV + '325AC0000000226/20270101_508AC0000000002', where: '292条 同一生計配偶者・扶養親族の合計所得金額 58万円→62万円以下' },
    { key: 'chiho2028', label: '地方税法（令和10年1月1日施行版。令和8年法律第2号による改正後）', url: EGOV + '325AC0000000226/20280101_508AC0000000002', where: '314条の2 ひとり親控除 30万円→33万円' },
    { key: 'soumu8', label: '総務省「地方税法等の一部を改正する法律の概要」（令和8年度）', url: 'https://www.soumu.go.jp/main_content/001063704.pdf', where: '給与所得控除の最低保障額74万円は令和9年度分の個人住民税から、ひとり親控除33万円は令和10年度分から' },
    { key: 'invoiceLeaflet', label: '国税庁 リーフレット「インボイス制度に関する令和８年度税制改正について」（令和8年4月、5月改訂）', url: NTA + 'taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice-review/pdf/0026004-099-01-1.pdf', where: '2割特例は令和8年9月30日の属する課税期間で終了。個人事業者の令和9年分・令和10年分は3割特例。インボイスのない仕入れの控除 80%→70%（令和8年10月）→50%（令和10年10月）→30%（令和12年10月）→0%（令和13年10月）' },
    { key: 'hikisage', label: '国税庁 消費税率引下げ特設サイト・リーフレット（令和8年9月15日開設）', url: NTA + 'taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/zeiritsuhikisage.htm', where: '飲食料品の税率を令和9年4月1日から令和11年3月31日まで1%にする案。「法案が国会に提出され、審議を経た上で可決・成立した場合のもの」' },
    { key: 'cfaShien', label: 'こども家庭庁「子ども・子育て支援金制度について」被用者保険加入者向けリーフレット（令和8年4月1日更新）', url: 'https://www.cfa.go.jp/policies/kodomokosodateshienkinseido', where: '令和8年4月保険料（5月に給与天引き）から拠出。支援金率0.23%、半分は事業主。賞与からも拠出。国民年金の育児期間中の保険料免除は令和8年10月分から' },
    { key: 'kokunen2026', label: '国民年金法（令和8年10月1日施行版。令和6年法律第47号による改正後）', url: EGOV + '334AC0000000141/20261001_506AC0000000047', where: '88条の3 第1号被保険者が子を養育する期間の保険料の免除を新設' },
    { key: 'mextKoko', label: '文部科学省「高等学校等就学支援金の支給に関する法律の一部を改正する法律の施行等について（通知）」（令和8年3月31日）', url: 'https://www.mext.go.jp/a_menu/shotou/career/05010502/1408866_00004.htm', where: '所得制限を撤廃、令和8年4月1日施行。支給限度額 私立の高校全日制 月38,100円（年457,200円）、公立 月9,900円' },
    { key: 'nenkinZairo', label: '日本年金機構「在職老齢年金制度が改正されました」（更新 2026-04-01）', url: JPS + 'tokusetsu/zairoukaisei.html', where: '令和8年4月から、年金が減額になる基準額（賃金と老齢厚生年金の合計）が月51万円から65万円に' },
    { key: 'mhlwGendo', label: '厚生労働省「令和８年８月１日から支給限度額が変更になります」', url: MHLW + 'content/001728499.pdf', where: '育児休業給付金 支給上限額（67%）323,811円→332,454円、休業開始時賃金月額の上限 483,300円→496,200円' },
    { key: 'koyo18', label: '雇用保険法 18条（賃金日額の自動変更）', url: EGOV + '349AC0000000116', where: '毎月勤労統計の平均給与額が上下したら、その比率に応じて翌年度の8月1日以後の額を変更' },
    { key: 'koyo2028', label: '雇用保険法（令和10年10月1日施行版。令和6年法律第26号による改正後）', url: EGOV + '349AC0000000116/20281001_506AC0000000026', where: '6条 適用除外が「1週間の所定労働時間が20時間未満」→「10時間未満」' },
    { key: 'kounen2026', label: '厚生年金保険法（令和8年10月1日施行版。令和7年法律第74号による改正後）', url: EGOV + '329AC0000000115/20261001_507AC0000000074', where: '12条 短時間労働者の適用除外から報酬 8万8千円未満の要件がなくなる（最低賃金の減額特例の人は附則4条の6）' },
    { key: 'kounen2027', label: '厚生年金保険法（令和9年9月1日・令和10年9月1日・令和11年9月1日施行版）', url: EGOV + '329AC0000000115/20270901_507AC0000000074', where: '20条の等級表: 第33級 68万円（2027-09）、第34級 71万円（2028-09）、第35級 75万円（2029-09）。今は第32級 65万円が上限' },
    { key: 'kounenSize', label: '厚生年金保険法（令和9年10月1日施行版）に載る令和7年法律第74号の附則', url: EGOV + '329AC0000000115/20271001_507AC0000000074', where: '特定適用事業所の規模: 令和9年10月1日から36人以上、令和11年10月1日から21人以上、令和14年10月1日から11人以上、令和17年10月1日から規模要件なし' },
    { key: 'mhlwNenkin', label: '厚生労働省「年金制度改正法が成立しました」・社会保険の加入対象の拡大について', url: MHLW + 'stf/seisakunitsuite/bunya/0000147284_00017.html', where: '令和7年6月13日成立。賃金要件の撤廃は公布から3年以内の政令で定める日（e-Gov の施行日は2026-10-01）。上限 68万（2027年9月）・71万（2028年9月）・75万（2029年9月）' },
    { key: 'mhlwKenpo8', label: '厚生労働省「健康保険法等の一部を改正する法律（令和８年法律第31号）の概要」', url: MHLW + 'content/12400000/001713111.pdf', where: '出産の標準的な費用の給付体系の見直し（現物給付化・全妊婦への現金給付）は「公布後２年以内に政令で定める日」。公布は令和8年6月5日' },
    { key: 'mhlwDattai', label: '厚生労働省「年金制度改正法の主な改正内容」', url: MHLW + 'content/12500000/001537487.pdf', where: '脱退一時金の支給上限 5年→8年。施行は公布から4年以内の政令で定める日' },
    { key: 'mojSouzoku', label: '法務省「相続登記の申請義務化」', url: 'https://www.moj.go.jp/MINJI/souzokutouki-gimuka/index.html', where: '令和6年4月1日から義務化。それより前に相続したことを知った不動産は令和9年3月31日までに登記' },
    { key: 'mojJusho', label: '法務省「住所等変更登記の義務化について」', url: 'https://www.moj.go.jp/MINJI/minji05_00693.html', where: '令和8年4月1日施行。変更日から2年以内。施行日より前の変更は令和10年3月31日まで（令和3年法律第24号 附則5条7項）' },
    { key: 'kokunenHokenryo', label: '日本年金機構「国民年金保険料」', url: JPS + 'service/kokunen/hokenryo/hokenryo.html', where: '令和8年度 月17,920円' },
    { key: 'kyokaiRate', label: '協会けんぽ「令和8年度都道府県単位保険料率」', url: 'https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/r08/index.html', where: '都道府県ごとの健康保険料率は3月分（4月納付分）から改定' },
  ];

  // このサイトのツール（kaitei/ から見た相対パス）
  var TOOLS = {
    nenmatsu: { name: '年末調整の計算', href: '../nenmatsu/' },
    juminzei: { name: '住民税の計算', href: '../juminzei/' },
    ikukyu: { name: '育休・産休の計算', href: '../ikukyu/' },
    iryohi: { name: '医療費控除の計算', href: '../iryohi/' },
    dattai: { name: '脱退一時金の計算', href: '../dattai-ichiji/' },
    invoice: { name: '2割特例の終了後の消費税', href: '../invoice/' },
    koko: { name: '高校無償化の計算', href: '../koko-mushoka/' },
    shienkin: { name: '子ども・子育て支援金の計算', href: '../shienkin/' },
    shaho: { name: '社会保険の加入チェッカー', href: '../../shaho-check/' },
  };

  // 分類（絞り込みのボタン）
  var CATS = [
    { key: 'zei', label: '税' },
    { key: 'shaho', label: '社保・年金' },
    { key: 'kosodate', label: '子育て・教育' },
    { key: 'other', label: 'その他' },
  ];

  // 施行日の決まったもの。date は施行日（期限の行は期限の日）。what は自分の言葉で 1 行、who は対象、
  // tools は { key, note }（note はそのツールでの扱い。コードで確かめたことだけ）、src は SOURCES の key
  var ITEMS = [
    { id: '2025-12-kiso', date: '2025-12-01', cat: 'zei', title: '所得税の基礎控除の見直し・特定親族特別控除', what: '令和7年分から基礎控除が引き上げられ、19〜22歳の子などの所得が58万円を超えても段階的に控除が残る「特定親族特別控除」ができた。年末調整で反映', who: '所得税を納める人、大学生年代の子の親',
      tools: [{ key: 'nenmatsu', note: '令和8年分との比較として令和7年分の制度で計算する' }], src: ['ntaKiso7'] },
    { id: '2026-04-shien', date: '2026-04-01', cat: 'kosodate', title: '子ども・子育て支援金の徴収が始まる', what: '健康保険などの保険料に上乗せして徴収。会社員は標準報酬月額 × 0.23% の半分（4月分の保険料＝5月の給与から）', who: '医療保険に入っている人（会社員・国保・後期高齢者）',
      tools: [{ key: 'shienkin', note: '給与から引かれる月額・年額を0.23%で計算する' }, { key: 'ikukyu', note: '社会保険料の免除額に0.23%を含めている' }, { key: 'shaho', note: '保険料の目安に含めている' }], src: ['cfaShien'] },
    { id: '2026-04-koko', date: '2026-04-01', cat: 'kosodate', title: '高校の就学支援金の所得制限がなくなる', what: '世帯の収入を問わず支給。私立の高校（全日制）は年45万7,200円まで、公立は年11万8,800円', who: '高校生の保護者',
      tools: [{ key: 'koko', note: '2026年度の新制度で計算する' }], src: ['mextKoko'] },
    { id: '2026-04-zairo', date: '2026-04-01', cat: 'shaho', title: '在職老齢年金の基準額が月65万円に', what: '働きながら老齢厚生年金を受ける人の年金が減り始める基準（賃金と年金の合計）が月51万円から65万円に', who: '老齢厚生年金を受けながら会社で働く人',
      tools: [], src: ['nenkinZairo'] },
    { id: '2026-04-jusho', date: '2026-04-01', cat: 'other', title: '不動産の住所・氏名の変更登記が義務に', what: '登記名義人の住所や氏名が変わったら2年以内に変更登記。施行前の変更も対象（期限は2028年3月31日）', who: '不動産を持っている人',
      tools: [], src: ['mojJusho'] },
    { id: '2026-08-ikukyu', date: '2026-08-01', cat: 'kosodate', title: '育児休業給付の上限額が上がる', what: '育児休業給付金の上限（67%の期間）が月323,811円から332,454円に。毎年8月1日に見直される', who: '育休を取る会社員',
      tools: [{ key: 'ikukyu', note: '2026-08-01〜2027-07-31 の額で計算する' }], src: ['mhlwGendo', 'koyo18'] },
    { id: '2026-10-chingin', date: '2026-10-01', cat: 'shaho', title: '社会保険の賃金要件（月8.8万円）がなくなる', what: 'パート・アルバイトの厚生年金・健康保険の加入に「月額賃金8.8万円以上」の条件がなくなる（週20時間以上などの条件は残る）', who: '従業員51人以上の会社などで働く短時間労働者',
      tools: [{ key: 'shaho', note: 'この日から判定を自動で切り替える' }], src: ['kounen2026', 'mhlwNenkin'] },
    { id: '2026-10-keika70', date: '2026-10-01', cat: 'zei', title: 'インボイスのない仕入れの控除が80%から70%に', what: '免税事業者などからの仕入れについて、仕入税額控除できる割合が下がる（本則課税の人）', who: '消費税の課税事業者',
      tools: [{ key: 'invoice', note: '仕入れの日で割合を選んで計算する' }], src: ['invoiceLeaflet'] },
    { id: '2026-10-kokunen', date: '2026-10-01', cat: 'kosodate', title: '国民年金の育児期間の保険料免除が始まる', what: '自営業などの国民年金の第1号被保険者が子を育てる一定の期間の保険料が免除される（2026年10月分から）', who: '国民年金を自分で納めている親',
      tools: [], src: ['kokunen2026', 'cfaShien'] },
    { id: '2026-12-kiso', date: '2026-12-01', cat: 'zei', title: '基礎控除104万円・給与所得控除の最低74万円（令和8年分）', what: '令和8年分から基礎控除が上がり（合計所得489万円以下は104万円）、扶養親族の所得要件が58万円から62万円に。12月の年末調整で反映', who: '給与をもらう人と、その扶養親族',
      tools: [{ key: 'nenmatsu', note: '令和8年分の改正後の値で計算する' }, { key: 'iryohi', note: '所得控除の合計を見積もるときの基礎控除に使う' }], src: ['ntaKiso8', 'ntaAramashi8'] },
    { id: '2027-01-sanwari', date: '2027-01-01', cat: 'zei', title: '2割特例が終わり、3割特例が始まる', what: 'インボイス登録した個人事業者は、令和9年分と令和10年分に限り、売上の消費税の3割を納める特例が使える（2割特例は令和8年分まで）', who: '免税事業者からインボイス登録した個人事業者',
      tools: [{ key: 'invoice', note: '3割特例・簡易課税・本則課税を比べる' }], src: ['invoiceLeaflet'] },
    { id: '2027-01-bouei', date: '2027-01-01', cat: 'zei', title: '防衛特別所得税が始まる（合計2.1%は同じ）', what: '所得税額の1%の防衛特別所得税ができ、復興特別所得税が2.1%から1.1%に。源泉徴収の合計の税率は変わらない', who: '所得税を納める人',
      tools: [{ key: 'nenmatsu', note: '令和9年分を足すときに確かめる' }, { key: 'iryohi', note: '令和9年分を足すときに確かめる' }, { key: 'dattai', note: '20.42%の源泉徴収は変わらない' }], src: ['ntaBouei'] },
    { id: '2027-01-gensen', date: '2027-01-01', cat: 'zei', title: '給与の源泉徴収税額表が変わる', what: '令和8年分からの基礎控除の引上げなどを反映した表で、毎月の給与から引く所得税を計算する', who: '給与をもらう人',
      tools: [], src: ['ntaKiso8'] },
    { id: '2027-01-hitorioya', date: '2027-01-01', cat: 'zei', title: 'ひとり親控除が38万円に（所得税）', what: '所得税のひとり親控除が35万円から38万円に（令和9年分から）', who: 'ひとり親',
      tools: [{ key: 'nenmatsu', note: '令和9年分を足すときに入れる（令和8年分は35万円）' }], src: ['shotoku2027'] },
    { id: '2027-01-self', date: '2027-01-01', cat: 'zei', title: 'セルフメディケーション税制の延長', what: 'スイッチOTC医薬品は期限なし、それ以外の対象医薬品は2031年12月31日まで対象に（令和9年分から）', who: '対象の市販薬を買う人',
      tools: [{ key: 'iryohi', note: '令和9年分を足すときに入れる' }], src: ['sochi2027'] },
    { id: '2027-01-jumin', date: '2027-01-01', cat: 'zei', title: '住民税の扶養の所得要件62万円・給与所得控除74万円（令和9年度分）', what: '2027年6月から納める住民税（令和9年度分）で、扶養親族などの所得要件が62万円以下に、給与所得控除の最低額が74万円に', who: '住民税を納める人',
      tools: [{ key: 'juminzei', note: '令和9年度分をこの値で計算する' }], src: ['chiho2027', 'soumu8'] },
    { id: '2027-03-souzoku', date: '2027-03-31', cat: 'other', title: '相続登記の期限（2024年4月より前の相続）', what: '2024年4月1日より前に相続したと知った不動産の相続登記は、この日までに申請する', who: '不動産を相続した人',
      tools: [], src: ['mojSouzoku'] },
    { id: '2027-09-jogen68', date: '2027-09-01', cat: 'shaho', title: '厚生年金の標準報酬月額の上限が68万円に', what: '上限が65万円から68万円に（報酬月額66.5万円以上の人の保険料と将来の年金が増える）', who: '月給が高い会社員',
      tools: [{ key: 'dattai', note: '今の等級表は2027年8月の最終月まで。この日から新しい表を入れる' }, { key: 'ikukyu', note: '社会保険料の免除額の目安の上限（今は65万円）を直す' }], src: ['kounen2027', 'mhlwNenkin'] },
    { id: '2027-10-kibo36', date: '2027-10-01', cat: 'shaho', title: '社会保険の企業規模要件が36人以上に', what: 'パート・アルバイトが厚生年金・健康保険に入る会社の規模が51人以上から36人以上に', who: '従業員36〜50人の会社で週20時間以上働く人',
      tools: [{ key: 'shaho', note: 'この日から判定を自動で切り替える' }], src: ['kounenSize', 'mhlwNenkin'] },
    { id: '2028-01-kiso', date: '2028-01-01', cat: 'zei', title: '基礎控除・給与所得控除の2年間の上乗せが終わる', what: '令和10年分から、合計所得132万円以下の基礎控除は99万円に、給与所得控除の最低額は69万円になる（令和8・9年分だけ104万円・74万円）', who: '所得税を納める人',
      tools: [{ key: 'nenmatsu', note: '令和10年分を足すときに入れる' }], src: ['ntaAramashi8'] },
    { id: '2028-01-hitorioya', date: '2028-01-01', cat: 'zei', title: 'ひとり親控除が33万円に（住民税）', what: '住民税のひとり親控除が30万円から33万円に（令和10年度分＝2028年6月から納める分から）', who: 'ひとり親',
      tools: [{ key: 'juminzei', note: '令和10年度分を足すときに入れる' }], src: ['chiho2028', 'soumu8'] },
    { id: '2028-03-jusho', date: '2028-03-31', cat: 'other', title: '住所等変更登記の期限（2026年4月より前の変更）', what: '2026年4月1日より前に住所・氏名が変わって変更登記をしていない不動産は、この日までに登記する', who: '不動産を持っている人',
      tools: [], src: ['mojJusho'] },
    { id: '2028-09-jogen71', date: '2028-09-01', cat: 'shaho', title: '厚生年金の標準報酬月額の上限が71万円に', what: '上限が68万円から71万円に', who: '月給が高い会社員',
      tools: [{ key: 'dattai', note: '等級表を入れ替える' }, { key: 'ikukyu', note: '免除額の目安の上限を直す' }], src: ['kounen2027'] },
    { id: '2028-10-keika50', date: '2028-10-01', cat: 'zei', title: 'インボイスのない仕入れの控除が70%から50%に', what: '免税事業者などからの仕入れについて、仕入税額控除できる割合がさらに下がる', who: '消費税の課税事業者',
      tools: [{ key: 'invoice', note: '仕入れの日で割合を選んで計算する' }], src: ['invoiceLeaflet'] },
    { id: '2028-10-koyo', date: '2028-10-01', cat: 'kosodate', title: '雇用保険の加入が週10時間以上に', what: '雇用保険に入る条件が週20時間以上から週10時間以上に。育児休業給付を受けられる人が広がる', who: '週10〜20時間働く人',
      tools: [{ key: 'ikukyu', note: '雇用保険に入っている人が対象' }], src: ['koyo2028'] },
    { id: '2029-01-sanwari-end', date: '2029-01-01', cat: 'zei', title: '3割特例が終わる', what: '令和11年分からは簡易課税か本則課税で申告する（令和11年分の確定申告期限までに届出すれば、その年から簡易課税）', who: '3割特例を使っていた個人事業者',
      tools: [{ key: 'invoice', note: '令和11年分は簡易課税と本則課税を比べる' }], src: ['invoiceLeaflet'] },
    { id: '2029-09-jogen75', date: '2029-09-01', cat: 'shaho', title: '厚生年金の標準報酬月額の上限が75万円に', what: '上限が71万円から75万円に（3段階の引上げの最後）', who: '月給が高い会社員',
      tools: [{ key: 'dattai', note: '等級表を入れ替える' }, { key: 'ikukyu', note: '免除額の目安の上限を直す' }], src: ['kounen2027'] },
    { id: '2029-10-kibo21', date: '2029-10-01', cat: 'shaho', title: '社会保険の企業規模要件が21人以上に', what: 'パート・アルバイトが厚生年金・健康保険に入る会社の規模が36人以上から21人以上に', who: '従業員21〜35人の会社で週20時間以上働く人',
      tools: [{ key: 'shaho', note: 'この日から判定を自動で切り替える' }], src: ['kounenSize'] },
  ];

  // 毎年決まった時期に変わるもの（一覧の日付には入れない）
  var YEARLY = [
    { when: '3月分（4月納付分）から', cat: 'shaho', title: '協会けんぽの都道府県ごとの健康保険料率', tools: [{ key: 'ikukyu' }], src: ['kyokaiRate'] },
    { when: '4月から', cat: 'shaho', title: '国民年金保険料の額（令和8年度は月17,920円）と、国民年金の脱退一時金の額の表', tools: [{ key: 'dattai' }], src: ['kokunenHokenryo'] },
    { when: '8月1日から', cat: 'kosodate', title: '育児休業給付などの上限額・下限額（平均給与額の増減に合わせて見直し）', tools: [{ key: 'ikukyu' }], src: ['koyo18', 'mhlwGendo'] },
  ];

  // 施行日が決まっていないもの・法律になっていないもの（.ics に入れない）
  var PENDING = [
    { status: '法案（未成立）', cat: 'zei', title: '飲食料品の消費税率を1%に（2027年4月1日〜2029年3月31日の案）', what: '2026年9月15日に大綱が閣議決定された段階で、法律は成立していない', tools: [{ key: 'invoice', note: '飲食料品（軽減税率）は扱っていない' }], src: ['hikisage'] },
    { status: '施行日は政令で決まる', cat: 'kosodate', title: '出産費用の給付の見直し（標準的な費用の現物給付化・全妊婦への現金給付）', what: '令和8年法律第31号。公布（2026年6月5日）から2年以内の政令で定める日', tools: [{ key: 'ikukyu', note: '今は出産育児一時金（50万円）で計算する' }], src: ['mhlwKenpo8'] },
    { status: '施行日は政令で決まる', cat: 'shaho', title: '脱退一時金の支給上限を5年から8年に', what: '令和7年法律第74号。公布から4年以内の政令で定める日', tools: [{ key: 'dattai', note: '今の上限（5年）で計算する' }], src: ['mhlwDattai'] },
  ];

  var V = {
    CHECKED: CHECKED,
    STALE_MONTHS: 6,              // 確認日からこの月数がたったら画面に注意を出す（予定の入れ替わりが多いので短め）
    SOURCES: SOURCES,
    TOOLS: TOOLS,
    CATS: CATS,
    ITEMS: ITEMS,
    YEARLY: YEARLY,
    PENDING: PENDING,
    // 一覧に出す範囲（公開時点の過去 12 か月〜2029 年末）
    RANGE: { from: '2025-10', to: '2029-12' },
    SITE: 'https://yorozu-craft.com/seido-keisan/kaitei/',
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = V;
  else root.KaiteiValues = V;
})(this);
