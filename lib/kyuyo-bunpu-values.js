// ===========================
// 給与階級別の給与所得者数（国税庁 民間給与実態統計調査、1 年を通じて勤務した給与所得者、男女の計）の値の表
// 手取りの計算（en/take-home-pay）の結果の下の図に使う（yorozu-plans の QUEUE Q-316、K215 の 2 本目）。
// 区切りは原文の表のまま（100 万円以下 〜 2,500 万円超の 14 階級）。upTo はその階級の上の端（円、「以下」を含む）。最後の階級は null（上の端なし）。
// 人数（千人）を写し、構成比は人数 ÷ 合計で出す（原文の構成比は小数 1 桁に丸めてあり、14 階級を足すと 100.2 になるため。
// 人数から出した構成比を小数 1 桁に丸めると、原文の構成比と全階級で一致する: tests/kyuyo-bunpu.test.js）。
// ブラウザでは window.KyuyoBunpuValues、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var CHECKED = '2026-11-17';   // 下の原文を開いて表を読んだ日

  var V = {
    CHECKED: CHECKED,
    year: 2025,   // 令和7年分
    source: {
      ja: '国税庁「令和7年分 民間給与実態統計調査」第16表 給与階級別給与所得者数・構成割合（1年を通じて勤務した給与所得者、計）。報告書 PDF の 22 ページ',
      en: 'National Tax Agency: Statistical Survey of Actual Status for Salary in the Private Sector, 2025, Table 16',
      url: 'https://www.nta.go.jp/publication/statistics/kokuzeicho/minkan2025/pdf/2025_001.pdf',
      page: 'https://www.nta.go.jp/publication/statistics/kokuzeicho/minkan2025/minkan.htm',
      checked: CHECKED,
    },
    // upTo: 上の端（円。以下を含む）、count: 人数（千人）、pct: 原文の構成比（%。突き合わせ用。図には count から出した値を使う）
    classes: [
      { upTo: 1000000, count: 3703, pct: 7.2 },
      { upTo: 2000000, count: 5825, pct: 11.3 },
      { upTo: 3000000, count: 6746, pct: 13.1 },
      { upTo: 4000000, count: 7987, pct: 15.5 },
      { upTo: 5000000, count: 7918, pct: 15.3 },
      { upTo: 6000000, count: 6145, pct: 11.9 },
      { upTo: 7000000, count: 4035, pct: 7.8 },
      { upTo: 8000000, count: 2777, pct: 5.4 },
      { upTo: 9000000, count: 1834, pct: 3.6 },
      { upTo: 10000000, count: 1266, pct: 2.5 },
      { upTo: 15000000, count: 2422, pct: 4.7 },
      { upTo: 20000000, count: 610, pct: 1.2 },
      { upTo: 25000000, count: 167, pct: 0.3 },
      { upTo: null, count: 196, pct: 0.4 },
    ],
    total: 51631,   // 原文の合計（千人）
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = V;
  else root.KyuyoBunpuValues = V;
})(this);
