'use strict';
// 制度の計算機のトップは「声で入れる」（声をサーバーで文字にする。lib/voice-input.js）の道具を並べるので、
// 「入力は外部に送信しない」と言い切る字を置かない（オーナーが本館の /all/ で見つけた誤りと同じ型）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('トップに、入力を外に送らないと言い切る字が無い', () => {
  const html = read('index.html');
  assert.match(html, /href="\.\/iryohi\/"/);
  assert.doesNotMatch(html, /ブラウザの外に送信しません|入力は外部に送信しない|端末の外に出ません/);
  assert.match(html, /<meta name="description" content="[^"]*出典と確認日つき。登録不要・無料。">/);
});
