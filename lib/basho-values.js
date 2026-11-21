// ===========================
// この場所の 1 枚（K246）の浸水深の色の表 — lib/basho.js の classify に渡す（yorozu-plans QUEUE Q-831、D628・D646）
// 値は Q-807 の測り（2026-11-21）の表から取った。資料もタイルも読み直していない。
//   資料: 国土交通省「水害ハザードマップ作成の手引き」第 3 章（印字 p.36 図 3-3 が標準の 6 段、p.37 図 3-5 が詳細版）
//   タイル: 重ねるハザードマップの洪水浸水想定区域（想定最大規模）のタイル 1 枚、13/7277/3225（Last-Modified 2026-09-10）
// 入れたのは、実のタイルと RGB が差 0 で合い、かつ詳細版で同じ色に当たる段が標準の段の内に収まる色だけ（D646）。
// range は標準の段、detailRange は詳細版で同じ色に当たる段（m。上の端の null は上限なし）。収まるかはテストが見張る。
// 入れていない色:
//   3〜5m（255,183,183）・5〜10m（255,145,145）: タイルとは差 0 で合ったが、Q-807 の表に詳細版の段の値が無い
//   10〜20m・20m 以上: Q-807 のタイルに色が無い（D646: 色の在るタイルで合うまで字にしない）
//   248,225,166: 詳細版だけの色。classify は unreadable を返す
// 段の名前は標準の段の名前だけで、良し悪しの字は持たない（D117）
// ブラウザでは window.BashoValues、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var CHECKED = '2026-11-21';   // Q-807 で資料とタイルを突き合わせた日
  var SOURCE = { name: '国土交通省「水害ハザードマップ作成の手引き」第 3 章 図 3-3', page: 36 };

  var SHINSUI = [
    { rgb: [247, 245, 169], label: '0.5m未満', range: [0, 0.5], detailRange: [0.3, 0.5], source: SOURCE, checked: CHECKED },
    { rgb: [255, 216, 192], label: '0.5〜3m', range: [0.5, 3], detailRange: [1, 3], source: SOURCE, checked: CHECKED },
  ];

  var api = { CHECKED: CHECKED, SHINSUI: SHINSUI };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BashoValues = api;
})(this);
