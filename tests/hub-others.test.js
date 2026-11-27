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

// 名前と説明は、先のページの h1 と meta description の字そのまま（QUEUE Q-1303、D1162）。
// 先の repo が隣（SIBLINGS_DIR、既定は ../..）に無い所では飛ばす。gakko-keisan は description に断りの字があるため写していない（Q-1303 の止める条件）。
const siblings = process.env.SIBLINGS_DIR || path.join(__dirname, '..', '..');
const targets = [
  ['../shaho-check/', 'shaho-check/index.html'],
  ['../loan-sim/', 'loan-sim/index.html'],
  ['../loan-sim/kinri/', 'loan-sim/kinri/index.html'],
  ['../denki-dai/', 'denki-dai/index.html'],
];
const hubBlock = html.slice(html.indexOf('<h2 id="h-others">'), html.indexOf('</section>', html.indexOf('<h2 id="h-others">')));

for (const [href, file] of targets) {
  const full = path.join(siblings, file);
  test(`一覧: ${href} の名前と説明は先のページの h1・description と同じ`, { skip: !fs.existsSync(full) && '先の repo が隣に無い' }, () => {
    const page = fs.readFileSync(full, 'utf8');
    const h1 = page.match(/<h1[^>]*>([^<]*)<\/h1>/)[1];
    const desc = page.match(/<meta name="description" content="([^"]*)"/)[1];
    const row = hubBlock.match(new RegExp(String.raw`<a href="${href}">\s*<span class="name">([^<]*)</span>\s*<span class="desc">([^<]*)</span>`));
    assert.ok(row, 'リンクの行');
    assert.equal(row[1], h1);
    assert.equal(row[2], desc);
  });
}
