// ===========================
// この場所の 1 枚（K246）の浸水深の色の表 — lib/basho.js の classify に渡す（yorozu-plans QUEUE Q-831・Q-847、D628・D646・D663）
//   資料: 国土交通省「水害ハザードマップ作成の手引き」第 3 章（印字 p.36 図 3-3 が標準の 6 段、p.37 図 3-5 が詳細版）
//   版: 第 1 章の表紙は令和 8 年 5 月版。第 3 章の PDF に版の字は無く、掲載ページの字でも同じ版の組とは確かめられていない（Q-846・Q-904）
//   タイル: 重ねるハザードマップの洪水浸水想定区域（想定最大規模）のタイル（Q-807 の 13/7277/3225〈Last-Modified 2026-09-10〉と Q-832）
// 入れたのは、実のタイルと RGB が差 0 で合い、かつ詳細版で同じ色に当たる段が標準の段の内に収まる色だけ（D646）。
//   〜 0.5m・0.5m 〜 3m: タイルとの一致も詳細版の段も Q-807 の測り（2026-11-21）
//   3m 〜 5m・5m 〜 10m: タイルとの一致は Q-807、10m 〜 20m は Q-832。詳細版の段が標準の段と同じことは Q-846 の測り（2026-11-22）
// range は標準の段、detailRange は詳細版で同じ色に当たる段（m。上の端の null は上限なし）。収まるかはテストが見張る。
// label はポータルの凡例の字のまま（D663。全角の「〜」の前後に半角の空白。Q-832 が読んだ凡例の画像の字）。
// 入れていない色:
//   20m 〜（220,122,220）: 色の在るタイルを見ていない（D646: 色の在るタイルで合うまで字にしない）
//   248,225,166・255,255,179: 詳細版だけの色。classify は unreadable を返す
// 段の名前は標準の段の名前だけで、良し悪しの字は持たない（D117）
// ブラウザでは window.BashoValues、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var CHECKED = '2026-11-21';          // Q-807 で資料とタイルを突き合わせた日
  var CHECKED_DETAIL = '2026-11-22';   // Q-846 で詳細版の段を資料と突き合わせた日
  var SOURCE = { name: '国土交通省「水害ハザードマップ作成の手引き」第 3 章 図 3-3（第 1 章の表紙は令和 8 年 5 月版。第 3 章は 2026-11-22 に取得）', page: 36 };

  var SHINSUI = [
    { rgb: [247, 245, 169], label: '〜 0.5m', range: [0, 0.5], detailRange: [0.3, 0.5], source: SOURCE, checked: CHECKED },
    { rgb: [255, 216, 192], label: '0.5m 〜 3m', range: [0.5, 3], detailRange: [1, 3], source: SOURCE, checked: CHECKED },
    { rgb: [255, 183, 183], label: '3m 〜 5m', range: [3, 5], detailRange: [3, 5], source: SOURCE, checked: CHECKED_DETAIL },
    { rgb: [255, 145, 145], label: '5m 〜 10m', range: [5, 10], detailRange: [5, 10], source: SOURCE, checked: CHECKED_DETAIL },
    { rgb: [242, 133, 201], label: '10m 〜 20m', range: [10, 20], detailRange: [10, 20], source: SOURCE, checked: CHECKED_DETAIL },
  ];

  var api = { CHECKED: CHECKED, SHINSUI: SHINSUI };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BashoValues = api;
})(this);
