// 制度の改定カレンダー: lib/kaitei-values.js から kaitei/index.html の一覧を書き出す（検索エンジン向けに HTML に入れておく）
//   node tools/build-kaitei.mjs          書き出す
//   node tools/build-kaitei.mjs --check  書き出した結果とファイルが違えば終了コード 1（テストと同じ確認）
// ページの <!-- kaitei:NAME --> と <!-- /kaitei:NAME --> の間だけを置き換える（NAME は list・yearly・pending・count）
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const K = require(join(root, 'lib/kaitei.js'));
const file = join(root, 'kaitei/index.html');

export function fill(html, parts) {
  for (const [name, body] of Object.entries(parts)) {
    const re = new RegExp(`(<!-- kaitei:${name} -->)[\\s\\S]*?(<!-- /kaitei:${name} -->)`);
    if (!re.test(html)) throw new Error(`マーカー kaitei:${name} が kaitei/index.html に無い`);
    const inline = name === 'count';
    html = html.replace(re, (_, a, b) => inline ? `${a}${body}${b}` : `${a}\n${body}\n${b}`);
  }
  return html;
}

const html = readFileSync(file, 'utf8');
const out = fill(html, K.renderAll());
if (process.argv.includes('--check')) {
  if (out !== html) { console.error('kaitei/index.html が lib/kaitei-values.js と合っていない。node tools/build-kaitei.mjs を実行する'); process.exit(1); }
  console.log('OK');
} else if (out !== html) {
  writeFileSync(file, out);
  console.log('kaitei/index.html を書き出した');
} else {
  console.log('変更なし');
}
