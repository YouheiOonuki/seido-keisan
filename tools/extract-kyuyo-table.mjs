// 国税庁「年末調整のしかた」の PDF（114.pdf）から「給与所得控除後の給与等の金額の表」を取り出して、
// lib/kyuyo-table-<年>.js を作る開発用の道具（公開ページでは使わない）
//
//   npm install --no-save pdfjs-dist@4        # 最初に 1 回（node_modules は .gitignore 済み）
//   node tools/extract-kyuyo-table.mjs <114.pdf> <年> <PDF の URL> > lib/kyuyo-table-<年>.js
//
//   例: node tools/extract-kyuyo-table.mjs 114.pdf 2026 https://www.nta.go.jp/publication/pamph/gensen/nencho2026/pdf/114.pdf > lib/kyuyo-table-2026.js
//
// PDF は国税庁のサイトから取得する（ブラウザの User-Agent を付けないと断られることがある）。
// 取り出した行は「前の行の未満 = 次の行の以上」でつながっているかを確かめ、途切れていたら止まる。
// 表の値が計算の規則と合っているかは tests/nenmatsu.test.js で全行を確かめる。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDFJS_DIR = process.env.PDFJS_DIR || path.join(ROOT, 'node_modules', 'pdfjs-dist');

const [file, year, url] = process.argv.slice(2);
if (!file || !/^\d{4}$/.test(year || '') || !url) {
  console.error('使い方: node tools/extract-kyuyo-table.mjs <114.pdf> <年> <PDF の URL>');
  process.exit(1);
}

let pdfjs;
try {
  pdfjs = await import(pathToFileURL(path.join(PDFJS_DIR, 'legacy', 'build', 'pdf.mjs')).href);
} catch (e) {
  console.error('pdfjs-dist が見つかりません。先に npm install --no-save pdfjs-dist@4 を実行してください（または PDFJS_DIR で場所を指定）');
  process.exit(1);
}

// PDF の文字を、書かれている順のまま y 座標で行にまとめる（日本語は cMaps が必要）
const doc = await pdfjs.getDocument({
  data: new Uint8Array(fs.readFileSync(file)),
  verbosity: 0,
  cMapUrl: path.join(PDFJS_DIR, 'cmaps') + '/',
  cMapPacked: true,
  standardFontDataUrl: path.join(PDFJS_DIR, 'standard_fonts') + '/',
}).promise;

const lines = [];
for (let i = 1; i <= doc.numPages; i++) {
  const content = await (await doc.getPage(i)).getTextContent();
  let line = [], lastY = null;
  for (const it of content.items) {
    const y = Math.round(it.transform[5]);
    if (lastY !== null && Math.abs(y - lastY) > 3) { lines.push(line.join(' ')); line = []; }
    if (it.str.trim()) line.push(it.str.trim());
    lastY = y;
  }
  lines.push(line.join(' '));
}
const text = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');

const num = (s) => Number(s.replace(/,/g, ''));
// 字と字のあいだに空白や改行が入っていても当たるようにする
const loose = (s) => s.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
const N = '(\\d{1,3}(?:,\\d{3})+)';

// 1) 表の行（以上・未満・金額）
const rows = [];
const triple = new RegExp(`${N} ${N} ${N}`, 'g');
for (const l of text.split('\n')) {
  for (const m of l.matchAll(triple)) rows.push([num(m[1]), num(m[2]), num(m[3])]);
}
rows.sort((a, b) => a[0] - b[0]);

// 2) 表の上と下の、金額の代わりに式が書かれた範囲
const one = (re, label) => {
  const m = text.match(re);
  if (!m) { console.error(`見つかりません: ${label}`); process.exit(1); }
  return m;
};
const zero = one(new RegExp(`${N}\\s*${loose('円未満')}\\s*0\\b`), '「○円未満 0」');
const rate = one(new RegExp(`${N}\\s+${N}\\s*${loose('給与等の金額に')}\\s*(\\d+)\\s*[％%]\\s*${loose('を乗じて算出した金額から')}\\s*${N}\\s*${loose('円を控除した金額')}`), '「給与等の金額に○％を乗じて…」');
const minusTop = [...text.matchAll(new RegExp(`${N}\\s+${N}\\s*${loose('給与等の金額から')}\\s*${N}\\s*${loose('円を控除した金額')}`, 'g'))];
const exact = one(new RegExp(`${N}\\s*円\\s+${N}\\s*円`), '「○円 ○円」（表の最後）');

const formulas = [];
for (const m of minusTop) formulas.push({ from: num(m[1]), to: num(m[2]), rate: 1, minus: num(m[3]) });
formulas.push({ from: num(rate[1]), to: num(rate[2]), rate: Number(rate[3]) / 100, minus: num(rate[4]) });
formulas.sort((a, b) => a.from - b.from);
const below = formulas.filter((f) => f.to <= rows[0][0]);
const above = formulas.filter((f) => f.from >= rows[rows.length - 1][1]);

// 3) つながりの確認（途切れ・重なりがあれば止める）
const chain = [[0, num(zero[1]), 'zero'], ...below.map((f) => [f.from, f.to, 'f']), ...rows, ...above.map((f) => [f.from, f.to, 'f'])];
for (let i = 1; i < chain.length; i++) {
  if (chain[i][0] !== chain[i - 1][1]) {
    console.error(`表がつながっていません: ${chain[i - 1][0]}〜${chain[i - 1][1]} の次が ${chain[i][0]}〜`);
    process.exit(1);
  }
}
if (num(exact[1]) !== chain[chain.length - 1][1]) {
  console.error(`表の最後（${num(exact[1])} 円）が式の範囲の終わり（${chain[chain.length - 1][1]} 円）と合いません`);
  process.exit(1);
}
if (below.length !== 1) {
  console.error('表の上の式の範囲が 1 つではありません');
  process.exit(1);
}

const out = {
  year: Number(year),
  source: url,
  pages: `${doc.numPages} ページ分（冊子の 47〜54 ページ）`,
  zeroBelow: num(zero[1]),
  formulasBelow: below,
  rows,
  formulasAbove: above,
  exact: [num(exact[1]), num(exact[2])],
  max: num(exact[1]),
};

const body = JSON.stringify(out, null, 0)
  .replace(/\],\[/g, '],\n    [')
  .replace('"rows":[[', '"rows":[\n    [');

process.stdout.write(`// 自動生成（手で直さない）: node tools/extract-kyuyo-table.mjs 114.pdf ${year} ${url}
// 国税庁「${Number(year) - 2018 === 0 ? '令和元' : '令和' + (Number(year) - 2018)}年分 年末調整のしかた」の「年末調整等のための給与所得控除後の給与等の金額の表」
// rows: [以上, 未満, 給与所得控除後の給与等の金額]（${rows.length} 行）。formulasBelow / formulasAbove は表の上と下の式の範囲
//   （以上 from・未満 to。金額 × rate − minus、1 円未満切り捨て）。zeroBelow 未満は 0、exact は [給与等の金額, その金額]
(function (root) {
  'use strict';
  var TABLE = ${body};
  if (typeof module !== 'undefined' && module.exports) module.exports = TABLE;
  else (root.KyuyoTables = root.KyuyoTables || {})[${Number(year)}] = TABLE;
})(this);
`);
console.error(`取り出しました: ${rows.length} 行、式の範囲 ${below.length + above.length} 個（${out.zeroBelow} 円未満は 0、${out.max} 円まで）`);
