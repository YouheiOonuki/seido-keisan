// 公開データ（data/。CC0）と使い方ページの「リンク・引用・埋め込みのしかた」のテスト: node --test tests/*.test.js
// どちらも値ファイル・画面から機械で書き出すもの。ファイルが書き出しの結果と同じか（手で直していないか・書き出し忘れがないか）、
// 出典の URL と確認日が残っているか、広告のあるページに iframe の例を出していないかを確かめる
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../lib/kaitei-values.js');
const K = require('../lib/kaitei.js');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const load = name => import(path.join(root, 'tools', name));

test('data/ のファイルが lib/kaitei-values.js から書き出した結果と同じ（node tools/build-data.mjs）', async () => {
  const B = await load('build-data.mjs');
  assert.equal(read('data/kaitei.json'), B.buildJson());
  assert.equal(read('data/kaitei.ics'), B.buildIcs());
});

test('kaitei.json: CC0・確認日・各行の出典の URL', () => {
  const d = JSON.parse(read('data/kaitei.json'));
  assert.equal(d.license, 'CC0-1.0');
  assert.equal(d.checked, V.CHECKED);
  const items = K.inRange(V.ITEMS, V.RANGE);
  assert.equal(d.items.length, items.length);
  assert.ok(d.items.length > 0);
  for (const it of d.items) {
    assert.match(it.date, /^\d{4}-\d{2}-\d{2}$/, it.id);
    assert.ok(it.sources.length > 0, it.id);
    for (const s of it.sources) {
      assert.match(s.url, /^https:\/\//, it.id);
      assert.equal(s.checked, V.CHECKED, it.id);
      assert.ok(s.label, it.id);
    }
    for (const t of it.tools) assert.match(t.url, /^https:\/\/yorozu-craft\.com\//, it.id);
    assert.equal(it.url, V.SITE + '#i-' + it.id);
  }
  // 日付順
  const dates = d.items.map(it => it.date);
  assert.deepEqual(dates, [...dates].sort());
  // 施行日の決まっていないものは items に入れない
  assert.equal(d.pending.length, V.PENDING.length);
  for (const p of d.pending) assert.ok(!d.items.some(it => it.title === p.title), p.title);
  for (const s of d.sources) { assert.match(s.url, /^https:\/\//, s.key); assert.equal(s.checked, V.CHECKED); }
});

test('kaitei.ics: CRLF・行数・UID が JSON の行と同じ', () => {
  const ics = read('data/kaitei.ics');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), '改行は CRLF だけ');
  const d = JSON.parse(read('data/kaitei.json'));
  const uids = [...ics.matchAll(/^UID:kaitei-(.+)@yorozu-craft\.com\r$/gm)].map(m => m[1]);
  assert.deepEqual(uids, d.items.map(it => it.id));
  // Windows で取り出しても CRLF が変わらないように
  assert.match(read('.gitattributes'), /^data\/\*\.ics -text$/m);
});

test('ライセンスと説明: data/LICENSE は CC0 1.0 の全文、README に CC0 とコードの MIT の区別', () => {
  const lic = read('data/LICENSE');
  assert.match(lic, /CC0 1\.0 Universal/);
  assert.match(lic, /Statement of Purpose/);
  const readme = read('data/README.md');
  assert.match(readme, /CC0 1\.0/);
  assert.match(readme, /MIT License/);
  assert.match(readme, /node tools\/build-data\.mjs/);
  // 公開の入口: カレンダーのページからデータへリンク
  const page = read('kaitei/index.html');
  assert.match(page, /href="\.\.\/data\/kaitei\.json"/);
  assert.match(page, /href="\.\.\/data\/kaitei\.ics"/);
});

test('使い方ページの「リンク・引用・埋め込みのしかた」が画面から書き出した結果と同じ（node tools/build-cite.mjs）', async () => {
  const C = await load('build-cite.mjs');
  assert.deepEqual(C.TARGETS, ['nenmatsu', 'juminzei', 'kogaku-ryoyohi', 'nenkin-kuriage']);
  for (const dir of C.TARGETS) {
    const guide = read(dir + '/guide.html');
    const p = C.pageInfo(dir);
    assert.equal(C.fill(guide, C.block(p)), guide, dir + '/guide.html');
    assert.match(guide, /<summary>リンク・引用・埋め込みのしかた<\/summary>/, dir);
    assert.ok(guide.includes(p.url), dir);
    assert.equal(p.url, 'https://yorozu-craft.com/seido-keisan/' + dir + '/');
    const frame = guide.includes('&lt;iframe src=&quot;' + p.url + '&quot;');
    if (p.ads) {
      // AdSense のポリシー: 広告をほかのページの枠の中に出さない
      assert.ok(!frame, dir + ' は広告があるので iframe の例を出さない');
      assert.match(guide, /埋め込みには対応していません/, dir);
    } else {
      assert.ok(frame, dir + ' は広告なしなので iframe の例を出す');
    }
  }
  // 広告の有無は設計どおり（D118: 年金・高額療養費は広告なし）
  assert.equal(C.pageInfo('nenmatsu').ads, true);
  assert.equal(C.pageInfo('juminzei').ads, true);
  assert.equal(C.pageInfo('kogaku-ryoyohi').ads, false);
  assert.equal(C.pageInfo('nenkin-kuriage').ads, false);
});
