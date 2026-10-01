// 使い方ページの「リンク・引用・埋め込みのしかた」を書き出す（yorozu-plans ROADMAP 7.10.3 d）
//   node tools/build-cite.mjs          書き出す
//   node tools/build-cite.mjs --check  書き出した結果とファイルが違えば終了コード 1（テストと同じ確認）
// 名前と URL は計算の画面（<dir>/index.html）の <h1> と canonical から取る（手で写さない）。
// 画面に AdSense のスクリプトがあるページは iframe の例を出さない（AdSense のポリシーで、広告を
// ほかのページの枠の中に出すことは禁止。広告なしのページ（D118）だけ埋め込みの 1 行を出す）。
// guide.html の <!-- cite --> と <!-- /cite --> の間だけを置き換える
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 対象の計算機（ROADMAP 7.10.3 d: 年末調整・住民税・高額療養費・年金）
export const TARGETS = ['nenmatsu', 'juminzei', 'kogaku-ryoyohi', 'nenkin-kuriage'];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function pageInfo(dir) {
  const html = readFileSync(join(root, dir, 'index.html'), 'utf8');
  const url = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  const h1 = ((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '').replace(/<[^>]+>/g, '').trim();
  if (!url || !h1) throw new Error(dir + '/index.html に canonical か h1 が無い');
  return { dir, url, name: h1, ads: /adsbygoogle\.js/.test(html) };
}

export function block(p) {
  const link = `<a href="${p.url}">${p.name}</a>`;
  const cite = `yorozu-craft「${p.name}」${p.url}（○年○月○日閲覧）`;
  const frame = `<iframe src="${p.url}" title="${p.name}" width="100%" height="900" loading="lazy" style="border:1px solid #ccc"></iframe>`;
  const lines = [
    '<details class="rels cite" id="cite">',
    '  <summary>リンク・引用・埋め込みのしかた</summary>',
    '  <p>リンクの HTML の例:</p>',
    `  <pre class="cite-code"><code>${esc(link)}</code></pre>`,
    '  <p>出典として書くときの例（閲覧日は見た日に）:</p>',
    `  <pre class="cite-code"><code>${esc(cite)}</code></pre>`,
    '  <p>制度の数字を引くときは、「根拠と確認日」の原文（法令・省庁の資料）も並べてください。</p>',
  ];
  if (p.ads) {
    lines.push('  <p>このページは広告を表示しているため、iframe での埋め込みには対応していません。リンクで紹介してください。</p>');
  } else {
    lines.push('  <p>ページに埋め込むときの 1 行（計算は見る人の端末の中で行い、入力は貼った側のサイトにも送られません）:</p>');
    lines.push(`  <pre class="cite-code"><code>${esc(frame)}</code></pre>`);
  }
  lines.push('</details>');
  return lines.join('\n');
}

export function fill(html, body) {
  const re = /([ \t]*)(<!-- cite -->)[\s\S]*?(<!-- \/cite -->)/;
  if (!re.test(html)) throw new Error('マーカー <!-- cite --> が無い');
  // マーカーの字下げにそろえる
  return html.replace(re, (_, ind, a, b) => `${ind}${a}\n${body.split('\n').map(l => ind + l).join('\n')}\n${ind}${b}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const dir of TARGETS) {
    const file = join(root, dir, 'guide.html');
    const html = readFileSync(file, 'utf8');
    const out = fill(html, block(pageInfo(dir)));
    if (out === html) { console.log(dir + '/guide.html: 変更なし'); continue; }
    if (check) { console.error(dir + '/guide.html の引用の例が古い。node tools/build-cite.mjs を実行する'); bad++; }
    else { writeFileSync(file, out); console.log(dir + '/guide.html を書き出した'); }
  }
  if (bad) process.exit(1);
}
