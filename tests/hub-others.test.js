// 一覧（index.html）の「家計のほかの計算」（QUEUE Q-1209 の (3)、ROADMAP 文案 D・D1054）: node --test tests/*.test.js
// リンクの先は別の repo（shaho-check・loan-sim・denki-dai・gakko-keisan）なので、ここでは href が決まった 5 つで、h2 の下に在る事を固める。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('一覧: 「計算機の一覧」の下に h2「家計のほかの計算」と、決まった 5 つのリンク', () => {
  const list = html.indexOf('<h2 id="h-list">計算機の一覧</h2>');
  const h2 = html.indexOf('<h2 id="h-others">家計のほかの計算</h2>');
  assert.ok(list > 0, '計算機の一覧の h2');
  assert.ok(h2 > list, '家計のほかの計算は計算機の一覧の後');
  const end = html.indexOf('</section>', h2);
  assert.ok(end > h2);
  const block = html.slice(h2, end);
  const paths = [...block.matchAll(/<a href="([^"]+)"/g)]
    .map(m => new URL(m[1], 'https://yorozu-craft.com/seido-keisan/').pathname);
  assert.deepEqual(paths, ['/shaho-check/', '/loan-sim/', '/loan-sim/kinri/', '/denki-dai/', '/gakko-keisan/']);
  assert.equal(html.split('<h2 id="h-others">').length, 2, '家計のほかの計算は 1 つだけ');
});
