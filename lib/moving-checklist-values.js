// ===========================
// 引越し・在留の手続きリスト（Japan moving / visa renewal / My Number checklist、英語ページ。K69）— 手続きの項目・期限・出典
// どの項目も下の SOURCES の原文（e-Gov 法令検索の API で 2026-10-03 施行版を取得、出入国在留管理庁のページ）を読んで書いた。
// 期限の日数（14 日・30 日・90 日・3 か月・2 か月・1 年）はここにだけ置く（画面と使い方ページはここから読む）。
// 法的助言ではない: 画面の文は「何を・いつまでに・どこで」と根拠の条文だけにし、個別の判断は書かない（企画書 70 の D249）。
// ブラウザでは window.MovingChecklistValues、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var CHECKED = '2026-10-03';   // 下の出典を最後に原文で確かめた日
  var EGOV = 'https://laws.e-gov.go.jp/law/';

  var SOURCES = {
    nyukan: { label: 'Immigration Control and Refugee Recognition Act (e-Gov)', url: EGOV + '326CO0000000319' },
    jumin: { label: 'Basic Resident Registration Act (e-Gov)', url: EGOV + '342AC0000000081' },
    bango: { label: 'My Number Act (e-Gov)', url: EGOV + '425AC0000000027' },
    bangoRei: { label: 'Order for Enforcement of the My Number Act (e-Gov)', url: EGOV + '426CO0000000155' },
    bangoMei: { label: 'Ministerial Order on My Number cards (e-Gov)', url: EGOV + '426M60000008085' },
    chihou: { label: 'Local Tax Act (e-Gov)', url: EGOV + '325AC0000000226' },
    minpo: { label: 'Civil Code (e-Gov): Art. 140, the first day is not counted', url: EGOV + '129AC0000000089' },
    isaRenew: { label: 'Immigration Services Agency: extension of period of stay', url: 'https://www.moj.go.jp/isa/applications/procedures/16-3.html' },
  };

  var DAYS = {
    notice: 14,          // 転入届・転居届・住居地の届出（住民基本台帳法 22 条・23 条・30 条の 46、入管法 19 条の 7・19 条の 9）
    cardMoveOut: 30,     // 転出の予定日から 30 日（番号法施行令 14 条 2 号）
    cardPresent: 90,     // 転入届から 90 日までにカードを出さないと失効（同 3 号）
    renewMonths: 3,      // 在留期間の満了の 3 か月前から申請（6 か月以上の在留期間。出入国在留管理庁の案内）
    renewMinStay: 6,     // 上の「3 か月前から」が当てはまる在留期間（月）
    graceMonths: 2,      // 満了までに処分が無いとき、満了から 2 か月まで在留できる（入管法 20 条 6 項・21 条 4 項）
    reentryYears: 1,     // みなし再入国の有効期間 1 年（在留期間の満了が先ならそこまで。入管法 26 条の 2 第 2 項）
  };

  // 場面。order は印刷の並び
  var SITUATIONS = [
    { id: 'arrive', label: 'I just arrived in Japan and need to register an address' },
    { id: 'other', label: 'I am moving to another city or ward in Japan' },
    { id: 'same', label: 'I am moving within the same city or ward' },
    { id: 'renew', label: 'My period of stay is ending and I will extend it' },
    { id: 'trip', label: 'I am traveling abroad and coming back' },
    { id: 'leave', label: 'I am leaving Japan for good' },
  ];

  // 項目。when: 'before'（引越し・出国の前）・'after'（引越しの後）・'renew'（満了日から）・'depart'（出国のとき）
  // due: 期限の計算（画面が日付を入れたときだけ）。text と where は英語（{notice} などは DAYS の日数に置き換える）、basis は条文（出典のキーと条）
  var ITEMS = [
    { id: 'arriveNotice', sit: 'arrive', when: 'after', due: { from: 'move', days: 'notice' },
      text: 'Register your address (residence notification) with your residence card.',
      where: 'City or ward office of your new address',
      basis: [['nyukan', 'Art. 19-7'], ['jumin', 'Art. 30-46']] },
    { id: 'moveOut', sit: 'other', when: 'before',
      text: 'Give a moving-out notice (tenshutsu todoke) before you move.',
      where: 'City or ward office of your current address',
      basis: [['jumin', 'Art. 24']] },
    { id: 'moveIn', sit: 'other', when: 'after', due: { from: 'move', days: 'notice' },
      text: 'Give a moving-in notice (tennyu todoke) with your residence card. This also updates the address on your residence card.',
      where: 'City or ward office of your new address',
      basis: [['jumin', 'Art. 22'], ['nyukan', 'Art. 19-9']] },
    { id: 'moveInCard', sit: 'other', when: 'after', needCard: true, due: { from: 'move', days: 'notice' },
      text: 'Hand in your My Number card with the moving-in notice. It stops working if you give no moving-in notice within {notice} days of moving, or do not show the card within {cardPresent} days of the notice.',
      where: 'City or ward office of your new address',
      basis: [['bango', 'Art. 17(6)'], ['bangoRei', 'Art. 14(2)(3)']] },
    { id: 'sameNotice', sit: 'same', when: 'after', due: { from: 'move', days: 'notice' },
      text: 'Give a change-of-address notice (tenkyo todoke) with your residence card. This also updates the address on your residence card.',
      where: 'Your city or ward office',
      basis: [['jumin', 'Art. 23'], ['nyukan', 'Art. 19-9']] },
    { id: 'sameCard', sit: 'same', when: 'after', needCard: true, due: { from: 'move', days: 'notice' },
      text: 'Bring your My Number card too, so the new address is recorded on it.',
      where: 'Your city or ward office',
      basis: [['bango', 'Art. 17(8)']] },
    { id: 'renewApply', sit: 'renew', when: 'renew', due: { from: 'expiry', months: 'renewMonths' },
      text: 'Apply for an extension of your period of stay before it ends. With a stay of {renewMinStay} months or more, you can apply from {renewMonths} months before it ends.',
      where: 'Regional immigration services bureau, or online',
      basis: [['nyukan', 'Art. 21'], ['isaRenew', '']] },
    { id: 'renewGrace', sit: 'renew', when: 'renew',
      text: 'If you applied in time and get no decision by the end date, you may stay until the decision or {graceMonths} months after the end date, whichever comes first.',
      where: '',
      basis: [['nyukan', 'Art. 20(6), 21(4)']] },
    { id: 'renewCard', sit: 'renew', when: 'renew', needCard: true,
      text: 'After the extension, ask to extend your My Number card. Unless you are a permanent resident or Highly Skilled Professional (ii), the card is valid only until the end of your period of stay.',
      where: 'Your city or ward office',
      basis: [['bangoMei', 'Art. 27']] },
    { id: 'tripReentry', sit: 'trip', when: 'depart',
      text: 'To come back within {reentryYears} year (or before your period of stay ends), show your residence card and tell the officer you will return (special re-entry permit). For longer trips, get a re-entry permit first.',
      where: 'Immigration at the airport or port',
      basis: [['nyukan', 'Art. 26, 26-2']] },
    { id: 'leaveOut', sit: 'leave', when: 'before',
      text: 'Give a moving-out notice before you leave Japan.',
      where: 'Your city or ward office',
      basis: [['jumin', 'Art. 24']] },
    { id: 'leaveMyNumber', sit: 'leave', when: 'before', needCard: true,
      text: 'Your My Number card stops being valid when you move abroad. Ask the office what to do with it.',
      where: 'Your city or ward office',
      basis: [['bangoRei', 'Art. 14(1)']] },
    { id: 'leaveTax', sit: 'leave', when: 'before',
      text: 'If you lived in Japan on January 1 and residence tax is still due, pay it or name a tax agent (nozei kanrinin).',
      where: 'City or ward office that sent the tax notice',
      basis: [['chihou', 'Art. 300']], link: { href: '../residence-tax/guide.html#leave', text: 'Residence tax when leaving Japan' } },
    { id: 'leaveCard', sit: 'leave', when: 'depart',
      text: 'Without a re-entry permit, your residence card stops being valid when you leave. Hand it to the officer at departure.',
      where: 'Immigration at the airport or port',
      basis: [['nyukan', 'Art. 19-14(3), 19-15(2)']] },
    { id: 'leavePension', sit: 'leave', when: 'depart',
      text: 'If you paid into the Japanese pension, check whether you can claim the lump-sum withdrawal payment after you leave.',
      where: 'Japan Pension Service',
      basis: [], link: { href: '../pension-refund/', text: 'Japan Pension Refund Calculator' } },
  ];

  var V = { CHECKED: CHECKED, STALE_MONTHS: 12, SOURCES: SOURCES, DAYS: DAYS, SITUATIONS: SITUATIONS, ITEMS: ITEMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = V;
  else root.MovingChecklistValues = V;
})(this);
