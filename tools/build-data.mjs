// 公開データ（CC0）の書き出し: lib/kaitei-values.js から data/kaitei.json と data/kaitei.ics を作る（yorozu-plans ROADMAP 7.10.3 e）
//   node tools/build-data.mjs          書き出す
//   node tools/build-data.mjs --check  書き出した結果とファイルが違えば終了コード 1（テストと同じ確認）
// data/ のファイルは手で直さない。値は lib/kaitei-values.js にだけ書き、これを走らせる
// generated（生成日。ACCEPTANCE 7.10.3 e）: 中身（generated を除く）が今のファイルと同じなら、今のファイルの generated をそのまま使う。
//   中身が変わったときだけ、その日（日本時間。環境変数 GENERATED=YYYY-MM-DD で指定もできる）になる。
//   こうすると、同じデータなら何度書き出しても同じファイルになり（--check とテストが日付で落ちない）、生成日は「中身が変わった日」を指す
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = require(join(root, 'lib/kaitei-values.js'));
const K = require(join(root, 'lib/kaitei.js'));

const DATA_URL = 'https://yorozu-craft.com/seido-keisan/data/';
const REPO_URL = 'https://github.com/YouheiOonuki/seido-keisan';

// 日本時間の今日（YYYY-MM-DD）。GENERATED があればそれ
export function today() {
  const g = process.env.GENERATED;
  if (g && /^\d{4}-\d{2}-\d{2}$/.test(g)) return g;
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

// 使った出典の URL（重複なし、SOURCES の順）。ACCEPTANCE 7.10.3 e の source
export function sourceUrls() {
  return [...new Set(V.SOURCES.map(s => s.url))];
}

export function buildJson(generated = today()) {
  const srcByKey = Object.fromEntries(V.SOURCES.map(s => [s.key, s]));
  const cat = Object.fromEntries(V.CATS.map(c => [c.key, c.label]));
  const tool = t => ({ name: V.TOOLS[t.key].name, url: new URL(V.TOOLS[t.key].href, V.SITE).href, ...(t.note ? { note: t.note } : {}) });
  const items = K.sorted(K.inRange(V.ITEMS, V.RANGE));
  const data = {
    title: '制度の改定カレンダー（税・社会保険・給付の施行日）',
    license: 'CC0-1.0',
    license_url: 'https://creativecommons.org/publicdomain/zero/1.0/deed.ja',
    publisher: 'yorozu-craft（Youhei Oonuki）',
    homepage: V.SITE,
    data_url: DATA_URL + 'kaitei.json',
    ics_url: DATA_URL + 'kaitei.ics',
    repository: REPO_URL,
    generated_from: 'lib/kaitei-values.js（tools/build-data.mjs で書き出し）',
    checked: V.CHECKED,
    generated,
    source: sourceUrls(),
    note: '日付と内容は各行の sources の原文で checked の日に確かめたもの。施行日が決まっていないもの・法律になっていないものは items に入れず pending に置く。制度の解釈や個別の判断には使わず、原文を確かめること。',
    categories: V.CATS.map(c => ({ key: c.key, label: c.label })),
    sources: V.SOURCES.map(s => ({ key: s.key, label: s.label, url: s.url, where: s.where, checked: V.CHECKED })),
    items: items.map(it => ({
      id: it.id,
      date: it.date,
      category: it.cat,
      category_label: cat[it.cat],
      title: it.title,
      what: it.what,
      who: it.who,
      url: V.SITE + '#i-' + it.id,
      tools: it.tools.map(tool),
      sources: it.src.map(k => ({ label: srcByKey[k].label, url: srcByKey[k].url, checked: V.CHECKED })),
    })),
    yearly: V.YEARLY.map(y => ({
      when: y.when, category: y.cat, title: y.title,
      tools: y.tools.map(tool),
      sources: y.src.map(k => ({ label: srcByKey[k].label, url: srcByKey[k].url, checked: V.CHECKED })),
    })),
    pending: V.PENDING.map(p => ({
      status: p.status, category: p.cat, title: p.title, what: p.what,
      tools: p.tools.map(tool),
      sources: p.src.map(k => ({ label: srcByKey[k].label, url: srcByKey[k].url, checked: V.CHECKED })),
    })),
  };
  return JSON.stringify(data, null, 2) + '\n';
}

// 公開する .ics の頭: カレンダーの説明（CC0・確認日・出典の URL。ROADMAP 7.14 の 1、ACCEPTANCE 7.10.3 e）と
// 購読したカレンダーが取りに来る間隔（1 週間。ROADMAP 7.14 の 2、K129）
export function icsHead(items, generated = today()) {
  const desc = K.calDesc(items).replace('\nページ: ', '\n生成日: ' + generated + '（このファイルの中身が変わった日）\nページ: ');
  return ['X-WR-CALDESC:' + K.icsText(desc), 'REFRESH-INTERVAL;VALUE=DURATION:P1W', 'X-PUBLISHED-TTL:P1W'];
}

export function buildIcs(generated = today()) {
  const items = K.inRange(V.ITEMS, V.RANGE);
  return K.buildIcs(items, icsHead(items, generated));
}

// 今のファイルの generated（無ければ null）
export function generatedOf(text) {
  if (text == null) return null;
  const m = text.replace(/\r\n[ \t]/g, '').match(/"generated": "(\d{4}-\d{2}-\d{2})"|生成日: (\d{4}-\d{2}-\d{2})/);
  return m ? (m[1] || m[2]) : null;
}

// 中身が同じなら今の generated を残し、変わったときだけ今日にする
export function stamp(build, now) {
  const prev = generatedOf(now);
  if (prev && build(prev) === now) return now;
  return build(today());
}

const read = rel => { const f = join(root, rel); return existsSync(f) ? readFileSync(f, 'utf8') : null; };
export function outputs() {
  return {
    'data/kaitei.json': stamp(buildJson, read('data/kaitei.json')),
    'data/kaitei.ics': stamp(buildIcs, read('data/kaitei.ics')),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const [rel, body] of Object.entries(outputs())) {
    const file = join(root, rel);
    const now = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (now === body) { console.log(rel + ': 変更なし'); continue; }
    if (check) { console.error(rel + ' が lib/kaitei-values.js と合っていない。node tools/build-data.mjs を実行する'); bad++; }
    else { writeFileSync(file, body); console.log(rel + ' を書き出した'); }
  }
  if (bad) process.exit(1);
}
