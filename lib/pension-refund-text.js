// ===========================
// 脱退一時金の計算 — 画面で組み立てる文言（英語 en・日本語 ja。キーは両方で同じにする: tests/pension-refund.test.js で確かめる）
// 固定の文言は各ページの HTML に書く。ここは結果に合わせて変わる文だけ。数字は計算（lib/pension-refund.js）から受け取る
// ブラウザでは window.PensionRefundText、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  function monthEn(ym) { var p = ym.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }); }
  function monthJa(ym) { var p = ym.split('-'); return +p[0] + '年' + (+p[1]) + '月'; }
  function dateEn(d) { var p = d.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }
  function dateJa(d) { var p = d.split('-'); return +p[0] + '年' + (+p[1]) + '月' + (+p[2]) + '日'; }
  function yenEn(n) { return '¥' + Math.round(n).toLocaleString('en-US'); }
  function yenJa(n) { return Math.round(n).toLocaleString('ja-JP') + '円'; }
  function the(c) { return /^(United|Netherlands|Czech|Philippines)/.test(c) ? 'the ' + c : c; }   // 英語の国名の冠詞
  function mo(n) { return String(Math.round(n * 100) / 100); }   // 一部免除で 0.25 月単位になる月数

  var en = {
    yen: yenEn, month: monthEn, date: dateEn,
    need: 'Enter the months and the last month for at least one scheme.',
    needMore: 'Fill in the highlighted boxes.',
    none: 'No refund with these entries.',
    detail: function (ep, np) {
      var a = [];
      if (ep !== null) a.push('Employees’ Pension ' + yenEn(ep) + ' after tax');
      if (np !== null) a.push('National Pension ' + yenEn(np));
      return a.join(' + ') + '.';
    },
    bar: function (t) { return 'You receive ' + yenEn(t); },
    refundOne: function (n) { return 'Tax refund estimate: ' + yenEn(n); },
    refundRange: function (a, b) { return 'Tax refund estimate: ' + yenEn(a) + '–' + yenEn(b); },
    refundNote: function (y) { return 'Assumes ' + y + ' years of service and no other retirement pay in the same year.'; },
    refundNoteRange: function (a, b) { return 'Service years could be read as ' + a + ' or ' + b + '; the tax office decides. Assumes no other retirement pay that year.'; },
    refundOff: 'Tax refund estimate: off',
    refundOther: 'Tax refund estimate: not shown (other retirement pay in the same year must be added together).',
    // 制度ごとの判定
    epShort: function (m) { return 'Employees’ Pension: ' + mo(m) + ' months is less than 6, so there is no refund. The two schemes are never added together.'; },
    npShort: function (m) { return 'National Pension: ' + mo(m) + ' months is less than 6, so there is no refund. The two schemes are never added together.'; },
    epScope: 'Employees’ Pension: a last month before September 2017 is not covered by this calculator.',
    npScope: 'National Pension: a last paid month before April 2013 is not covered by this calculator.',
    npNotPublished: function (fy) { return 'National Pension: the amounts for fiscal year ' + fy + ' (April ' + fy + ' to March ' + (fy + 1) + ') are not published yet. The Japan Pension Service adds them each April.'; },
    overCap: function (name, cap, m) { return name + ': only ' + cap + ' months are paid, and all ' + mo(m) + ' months stop counting as Japanese pension coverage.'; },
    epName: 'Employees’ Pension', npName: 'National Pension',
    blockJapanese: 'People with Japanese nationality cannot claim the refund.',
    blockDisability: 'People who have ever had the right to a disability pension (including a disability allowance) cannot claim.',
    blockQualify: function (m) { return 'Your periods add up to ' + m + ' months (120 or more), so you qualify for an old-age pension and cannot claim.'; },
    newGrades: 'From September 2027 the top grade rises to ¥680,000; this estimate still uses the current grade table.',
    deadline: function (from, to) { return 'Two years from ' + dateEn(from) + ' is ' + dateEn(to) + '.'; },
    kyoteiYes: function (c) { return 'Japan and ' + the(c) + ' can add pension periods together (totalization). After a refund, your Japanese periods before the claim can no longer be counted. The Japan Pension Service asks you to consider a possible future pension before claiming.'; },
    kyoteiNo: function (c) { return 'Japan’s agreement with ' + the(c) + ' does not add pension periods together.'; },
    // 内訳と途中の計算
    steps: {
      epMonths: function (m, last) { return 'Employees’ Pension months (last month ' + monthEn(last) + ')'; },
      grade: function (s) { return 'Standard monthly remuneration (salary ' + yenEn(s) + ')'; },
      bonus: function (b, c) { return 'Standard bonus ' + yenEn(b) + ' × ' + c + ' (rounded down to ¥1,000, max ¥1.5 million each)'; },
      avg: function (src) { return src === 'direct' ? 'Average standard remuneration (entered)' : 'Average standard remuneration (monthly + bonuses) ÷ all months'; },
      rate: function (n, cap, rate) { return 'Payment rate for ' + n + ' months (Japan Pension Service table, cap ' + cap + ' months): ' + rate; },
      epAmount: 'Employees’ Pension refund (average × rate)',
      withheld: 'Tax withheld (20.42%)',
      epNet: 'Employees’ Pension paid to you',
      npMonths: function (last) { return 'National Pension months (last paid ' + monthEn(last) + ')'; },
      npAmount: function (fy, n, cap) { return 'National Pension refund (FY' + fy + ' table, ' + n + ' months, cap ' + cap + ')'; },
      taxCase: function (y, kojo) { return 'Tax if service is ' + y + ' years (deduction ' + yenEn(kojo) + ')'; },
      refund: 'Refund estimate (withheld − tax)',
      unitMonths: ' months', unitRate: '',
    },
    // details の summary
    sumBonus: function (d) { return d.ep.avg !== null ? 'average entered' : d.ep.bonus && d.ep.bonusCount ? d.ep.bonusCount + ' bonuses' : 'none'; },
    sumExempt: function (d) { var n = (d.np.q1 || 0) + (d.np.half || 0) + (d.np.q3 || 0); return n ? n + ' months' : 'none'; },
    sumCheck: function (d) { return d.japanese || d.disability ? 'check the result' : 'no issues entered'; },
    sumCountry: function (d, name) { return name || 'not entered'; },
    sumTax: function (d) { return !d.refund ? 'off' : d.otherRetirement ? 'other retirement pay' : 'on'; },
    // ファイル
    exported: function (f) { return 'Saved ' + f + '. It contains your salary, so keep it private.'; },
    tooBig: 'The file is too large. Choose a file saved by this tool.',
    notJson: 'Could not read the file (not JSON).',
    notThisTool: 'This file was not saved by this calculator.',
    newerVersion: 'This file is from a newer version of the calculator.',
    noData: 'The file has no data.',
    confirmReplace: 'Replace your current entries with the file?',
    cancelled: 'Cancelled.',
    loaded: function (f) { return 'Loaded ' + f + '.'; },
    readError: 'Could not read the file.',
    confirmClear: 'Clear all entries? (Saved files are not deleted.)',
    cleared: 'Entries cleared.',
    asof: function (d) { return dateEn(d); },
    stale: '. This was checked a while ago; see the Japan Pension Service for the latest rules',
  };

  var ja = {
    yen: yenJa, month: monthJa, date: dateJa,
    need: 'どちらかの制度の月数と最後の月を入れると出ます。',
    needMore: '色の付いた欄を入れてください。',
    none: 'この入力では脱退一時金はありません。',
    detail: function (ep, np) {
      var a = [];
      if (ep !== null) a.push('厚生年金 ' + yenJa(ep) + '（源泉徴収の後）');
      if (np !== null) a.push('国民年金 ' + yenJa(np));
      return a.join(' ＋ ') + '。';
    },
    bar: function (t) { return '受け取る額 ' + yenJa(t); },
    refundOne: function (n) { return '税金の還付の目安 ' + yenJa(n); },
    refundRange: function (a, b) { return '税金の還付の目安 ' + yenJa(a) + '〜' + yenJa(b); },
    refundNote: function (y) { return '勤続年数 ' + y + ' 年、同じ年にほかの退職金がない前提。'; },
    refundNoteRange: function (a, b) { return '勤続年数を ' + a + ' 年と ' + b + ' 年のどちらで数えるかで分かれます（決めるのは税務署）。同じ年にほかの退職金がない前提。'; },
    refundOff: '税金の還付の目安: 出さない',
    refundOther: '税金の還付の目安: 出していません（同じ年のほかの退職金と合わせて計算が要るため）。',
    epShort: function (m) { return '厚生年金: ' + mo(m) + ' 月で 6 月未満のため、脱退一時金はありません。国民年金と合算はしません。'; },
    npShort: function (m) { return '国民年金: ' + mo(m) + ' 月で 6 月未満のため、脱退一時金はありません。厚生年金と合算はしません。'; },
    epScope: '厚生年金: 最終月が 2017年8月以前の場合は、この計算機の対象外です。',
    npScope: '国民年金: 最後に納めた月が 2013年3月以前の場合は、この計算機の対象外です。',
    npNotPublished: function (fy) { return '国民年金: ' + fy + '年度（' + fy + '年4月〜' + (fy + 1) + '年3月）の額はまだ公表されていません。日本年金機構が毎年4月に載せます。'; },
    overCap: function (name, cap, m) { return name + ': 支給は ' + cap + ' 月分までで、' + mo(m) + ' 月すべてが年金の加入期間でなくなります。'; },
    epName: '厚生年金', npName: '国民年金',
    blockJapanese: '日本国籍がある人は請求できません。',
    blockDisability: '障害年金など（障害手当金を含む）を受ける権利を有したことがある人は請求できません。',
    blockQualify: function (m) { return '加入期間などが合わせて ' + m + ' 月（120 月以上）あり、老齢年金の受給資格期間を満たすので請求できません。'; },
    newGrades: '2027年9月から標準報酬月額の上限が 68万円になります。この目安は今の等級表で計算しています。',
    deadline: function (from, to) { return dateJa(from) + 'から 2 年は ' + dateJa(to) + 'です。'; },
    kyoteiYes: function (c) { return '日本と' + c + 'は年金の加入期間を通算できます。脱退一時金を受け取ると、請求より前の日本の期間は通算に使えなくなります。日本年金機構は、将来年金を受け取る可能性を考えて請求するよう案内しています。'; },
    kyoteiNo: function (c) { return '日本と' + c + 'の協定は、加入期間を通算しません。'; },
    steps: {
      epMonths: function (m, last) { return '厚生年金の月数（最終月 ' + monthJa(last) + '）'; },
      grade: function (s) { return '標準報酬月額（月給 ' + yenJa(s) + '）'; },
      bonus: function (b, c) { return '標準賞与額 ' + yenJa(b) + ' × ' + c + ' 回（1,000円未満切り捨て、1 回 150万円まで）'; },
      avg: function (src) { return src === 'direct' ? '平均標準報酬額（入力）' : '平均標準報酬額（月額と賞与の総額 ÷ 全月数）'; },
      rate: function (n, cap, rate) { return '支給率（日本年金機構の表・' + n + ' 月・上限 ' + cap + ' 月）: ' + rate; },
      epAmount: '厚生年金の脱退一時金（平均標準報酬額 × 支給率）',
      withheld: '源泉徴収（20.42%）',
      epNet: '厚生年金で振り込まれる額',
      npMonths: function (last) { return '国民年金の月数（最後に納めた月 ' + monthJa(last) + '）'; },
      npAmount: function (fy, n, cap) { return '国民年金の脱退一時金（' + fy + '年度の表・' + n + ' 月・上限 ' + cap + ' 月）'; },
      taxCase: function (y, kojo) { return '勤続 ' + y + ' 年とした税額（退職所得控除 ' + yenJa(kojo) + '）'; },
      refund: '還付の目安（源泉徴収 − 税額）',
      unitMonths: ' 月', unitRate: '',
    },
    sumBonus: function (d) { return d.ep.avg !== null ? '平均標準報酬額を入力' : d.ep.bonus && d.ep.bonusCount ? '賞与 ' + d.ep.bonusCount + ' 回' : 'なし'; },
    sumExempt: function (d) { var n = (d.np.q1 || 0) + (d.np.half || 0) + (d.np.q3 || 0); return n ? n + ' 月' : 'なし'; },
    sumCheck: function (d) { return d.japanese || d.disability ? '結果を確認' : '該当なし'; },
    sumCountry: function (d, name) { return name || '入力なし'; },
    sumTax: function (d) { return !d.refund ? '出さない' : d.otherRetirement ? 'ほかの退職金あり' : '出す'; },
    exported: function (f) { return '書き出しました（' + f + '）。給与が入っているので、取り扱いにご注意ください。'; },
    tooBig: 'ファイルが大きすぎます（このツールで書き出したファイルを選んでください）。',
    notJson: 'ファイルを読み込めませんでした（JSON の形式ではありません）。',
    notThisTool: 'この計算機で書き出したファイルではありません。',
    newerVersion: '新しい版の計算機で書き出したファイルです。',
    noData: 'ファイルに入力の内容がありません。',
    confirmReplace: '今の入力内容を、ファイルの内容で置き換えます。よろしいですか？',
    cancelled: '読み込みをやめました。',
    loaded: function (f) { return '読み込みました（' + f + '）。'; },
    readError: 'ファイルを読み込めませんでした。',
    confirmClear: '入力内容をすべて消します。よろしいですか？（書き出したファイルは消えません）',
    cleared: '入力を消しました。',
    asof: function (d) { return dateJa(d); },
    stale: '。確認日から時間がたっています。最新の制度は日本年金機構の案内をご確認ください',
  };

  var T = { en: en, ja: ja };
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
  else root.PensionRefundText = T;
})(this);
