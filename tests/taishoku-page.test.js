// 退職金の税金の画面（/seido-keisan/taishoku/。Q-958、yorozu-plans 企画書 114 の 6 章）の決まり
// (1) 入れた額を保存しない・送らない: app.js は localStorage・sessionStorage・indexedDB・URL（history・location）に書かない。外へ送る処理が 0
//     （ブラウザで値を入れた後に localStorage の鍵が 0 のままなことは、Q-958 の Playwright の測りでも確かめた）
// (2) 開いた時に例の値（勤続 30 年・2,500万円）の結果が出る: 欄の既定の値と、その値の計算
// (3) title・description は企画書 114 の 6 章の字。「得」「損」の字を画面に置かない（「所得」は除く）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../lib/taishoku.js');

const dir = path.join(__dirname, '..', 'taishoku');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8').replace(/\/\/.*$/gm, '');

test('app.js は入れた額を保存しない・URL に載せない・送らない', () => {
  assert.doesNotMatch(app, /localStorage|sessionStorage|indexedDB|document\.cookie|history\.(push|replace)State|location\.(hash|search|href)\s*=|fetch\(|XMLHttpRequest|sendBeacon/);
  assert.match(html, /<form id="form" autocomplete="off" onsubmit="return false">/);
  assert.doesNotMatch(html, /reset-storage\.js/);
});

test('開いた時の値は 2,500万円・勤続 30 年 0 か月で、手取りは 23,915,478円', () => {
  assert.match(html, /id="amount"[^>]*value="25000000"/);
  assert.match(html, /id="years"[^>]*value="30"/);
  assert.match(html, /id="months"[^>]*value="0"/);
  const r = T.calc({ amount: 25000000, years: 30, months: 0 });
  assert.equal(r.now.tedori, 23915478);
  assert.deepEqual([r.shorter.years, r.now.years, r.longer.years], [29, 30, 31]);
});

test('title・description は企画書 114 の 6 章の字', () => {
  assert.match(html, /<title>退職金の税金と手取りの計算（退職所得控除・住民税）｜yorozu-craft<\/title>/);
  assert.match(html, /<meta name="description" content="退職金の額と勤続年数から、退職所得控除、所得税と復興特別所得税、住民税、手取りの目安を計算します。勤続 5 年以下の決まりと、退職所得の受給に関する申告書を出していない時の源泉徴収も並べて出します。">/);
});

test('画面に「得」「損」の字を置かない', () => {
  const body = html.split('<body>')[1].replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '');
  assert.doesNotMatch(body, /(?<!所)得|損/);   // 「所得」の得は数えない
});
