// 共通の皮のページは、h1 の大きさ・寄せ・色を皮（style.css の yorozu-common の間、--fs-xl）に任せる（yorozu-plans D637、Q-818）
// この repo の css（style.css の yorozu-common:end より後と、各ページの *.css）に、h1 の font-size・text-align・color を決める規則が 0 であること。
// 紙（@media print の中）は皮の外なので数えない
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

function cssFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'tests', 'tools'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...cssFiles(p));
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

// @media print { … } の塊を、括弧を数えて落とす
function dropPrint(src) {
  let out = '';
  let i = 0;
  const re = /@media\s+print\b[^{]*\{/g;
  let m;
  while ((m = re.exec(src))) {
    out += src.slice(i, m.index);
    let depth = 1, j = re.lastIndex;
    while (j < src.length && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
    i = j; re.lastIndex = j;
  }
  return out + src.slice(i);
}

test('この repo の css は h1 の font-size・text-align・color を上書きしない', () => {
  const hits = [];
  for (const f of cssFiles(root)) {
    let src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    if (path.relative(root, f) === 'style.css') src = fs.readFileSync(f, 'utf8').split('/* yorozu-common:end */')[1].replace(/\/\*[\s\S]*?\*\//g, '');
    src = dropPrint(src);
    for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim();
      if (!/(^|[\s,>+~(])h1\b/.test(sel)) continue;
      if (/(^|;|\s)(font-size|text-align|color)\s*:/.test(m[2])) hits.push(`${path.relative(root, f)}: ${sel}`);
    }
  }
  assert.deepEqual(hits, []);
});
