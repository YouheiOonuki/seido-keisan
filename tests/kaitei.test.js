// 制度の改定カレンダーのテスト: node --test tests/*.test.js
// データの形（日付・分類・ツール・出典のつながり）、ページの一覧が lib/kaitei-values.js と同じか、.ics の形（RFC 5545）を確かめる。
// 日付そのものは原文（SOURCES）で確かめたもの。ここでは、ほかのツールが持っている同じ日付・値と食い違っていないかも見る
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../lib/kaitei-values.js');
const K = require('../lib/kaitei.js');

const root = path.join(__dirname, '..');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

test('確認日と行の形', () => {
  assert.match(V.CHECKED, DATE);
  const ids = new Set();
  const srcKeys = new Set(V.SOURCES.map(s => s.key));
  const cats = new Set(V.CATS.map(c => c.key));
  for (const it of V.ITEMS) {
    assert.match(it.date, DATE, it.id);
    assert.ok(!Number.isNaN(Date.parse(it.date + 'T00:00:00Z')), it.id);
    assert.ok(!ids.has(it.id), '重複 ' + it.id); ids.add(it.id);
    assert.ok(it.id.startsWith(it.date.slice(0, 7)), 'id は年月で始める ' + it.id);
    assert.ok(cats.has(it.cat), it.id);
    for (const k of ['title', 'what', 'who']) assert.ok(it[k] && it[k].length > 0, it.id + ' ' + k);
    assert.ok(it.src.length > 0, it.id);
    for (const k of it.src) assert.ok(srcKeys.has(k), it.id + ' の出典 ' + k);
    for (const t of it.tools) assert.ok(V.TOOLS[t.key], it.id + ' のツール ' + t.key);
    // 表の中の完全文は書かない（WRITING 3 章）
    assert.ok(!/。$/.test(it.what), it.id + ' の what は「。」で終えない');
  }
  for (const s of V.SOURCES) assert.match(s.url, /^https:\/\//, s.key);
  for (const p of [...V.YEARLY, ...V.PENDING]) {
    for (const k of p.src) assert.ok(srcKeys.has(k), p.title);
    for (const t of p.tools) assert.ok(V.TOOLS[t.key], p.title);
  }
});

test('ツールのリンク先がこのリポジトリにある（shaho-check は別リポジトリ）', () => {
  for (const [key, t] of Object.entries(V.TOOLS)) {
    if (key === 'shaho') { assert.equal(t.href, '../../shaho-check/'); continue; }
    const dir = path.join(root, 'kaitei', t.href);
    assert.ok(fs.existsSync(path.join(dir, 'index.html')), key + ' → ' + t.href);
  }
});

test('ほかのツールの値と日付が食い違っていない', () => {
  const find = id => V.ITEMS.find(i => i.id === id);
  // 脱退一時金: 今の等級表は 2027-08 まで → 上限の引上げは 2027-09-01
  const D = require('../lib/dattai-values.js');
  assert.equal(D.gradeTableTo, '2027-08');
  assert.equal(find('2027-09-jogen68').date, '2027-09-01');
  // 育休: 上限額の期間 2026-08-01〜 と 8月1日の行
  const I = require('../lib/ikukyu-values.js');
  assert.equal(I.koyo.validFrom, find('2026-08-ikukyu').date);
  assert.equal(I.hoken.shienRate, 0.23);
  assert.match(find('2026-04-shien').what, /0\.23%/);
  // インボイス: 経過措置の割合が変わる日
  const INV = require('../lib/invoice-values.js');
  assert.ok(INV.keika.some(k => k.from === find('2026-10-keika70').date && k.pct === 70));
  assert.ok(INV.keika.some(k => k.from === find('2028-10-keika50').date && k.pct === 50));
  assert.equal(INV.years[2027].sanwari, true);
  assert.equal(INV.years[2028].sanwari, true);
  assert.equal(INV.years[2029].sanwari, false);
});

test('一覧は範囲の中だけ、日付の順に年と月でまとまる', () => {
  const g = K.group(V.ITEMS, V.RANGE);
  const flat = g.flatMap(y => y.months.flatMap(m => m.items));
  assert.equal(flat.length, K.inRange(V.ITEMS, V.RANGE).length);
  for (let i = 1; i < flat.length; i++) assert.ok(flat[i - 1].date <= flat[i].date);
  for (const y of g) for (const m of y.months) {
    assert.equal(m.ym.slice(0, 4), String(y.year));
    for (const it of m.items) assert.equal(it.date.slice(0, 7), m.ym);
  }
  // 範囲の外は出さない
  const extra = [{ id: '2035-10-x', date: '2035-10-01', cat: 'shaho', title: 't', what: 'w', who: 'x', tools: [], src: ['kounenSize'] }];
  assert.equal(K.inRange(extra, V.RANGE).length, 0);
});

test('ページの一覧が lib/kaitei-values.js から書き出したものと同じ（node tools/build-kaitei.mjs）', () => {
  const html = fs.readFileSync(path.join(root, 'kaitei/index.html'), 'utf8');
  const parts = K.renderAll();
  for (const [name, body] of Object.entries(parts)) {
    const m = html.match(new RegExp(`<!-- kaitei:${name} -->([\\s\\S]*?)<!-- /kaitei:${name} -->`));
    assert.ok(m, name);
    assert.equal(m[1].trim(), body.trim(), name + ' が古い。node tools/build-kaitei.mjs を実行する');
  }
  // 行ごとの id とボタン、年の h2 が入っている
  for (const it of K.inRange(V.ITEMS, V.RANGE)) {
    assert.ok(html.includes(`id="i-${it.id}"`), it.id);
    assert.ok(html.includes(`data-id="${it.id}"`), it.id);
  }
  assert.match(html, /<h2 id="y2027">2027年（令和9年）に変わること<\/h2>/);
  assert.match(html, /<h3 id="m2026-10" class="kt-month">2026年10月に変わること<\/h3>/);
  // 画面の確認日と更新履歴の件数
  assert.ok(html.includes(`datetime="${V.CHECKED}" id="checked"`));
  assert.ok(html.includes(`の ${K.inRange(V.ITEMS, V.RANGE).length} 件）`));
});

test('.ics は RFC 5545 の形（CRLF・75 オクテットの折り返し・終日の予定・エスケープ）', () => {
  const ics = K.buildIcs(V.ITEMS);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), '改行はすべて CRLF');
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, '75 オクテット超: ' + line);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, V.ITEMS.length);
  // 折り返しを戻して中身を見る
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('UID:kaitei-2026-10-chingin@yorozu-craft.com'));
  assert.ok(unfolded.includes('DTSTART;VALUE=DATE:20261001\r\nDTEND;VALUE=DATE:20261002'));
  assert.ok(unfolded.includes('DTSTAMP:20260925T000000Z'));
  assert.ok(unfolded.includes('SUMMARY:【社保・年金】社会保険の賃金要件（月8.8万円）がなくなる'));
  assert.ok(unfolded.includes('URL:https://yorozu-craft.com/seido-keisan/kaitei/#i-2026-10-chingin'));
  // 年末・月末・うるう年の翌日
  assert.equal(K.nextDay('2027-03-31'), '20270401');
  assert.equal(K.nextDay('2028-12-31'), '20290101');
  assert.equal(K.nextDay('2028-02-28'), '20280229');
  // エスケープ
  assert.equal(K.icsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  // 1 件だけ
  const one = K.buildIcs([K.byId('2027-03-souzoku')]);
  assert.equal((one.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(one.replace(/\r\n /g, '').includes('DTSTART;VALUE=DATE:20270331'));
});

test('折り返しは UTF-8 の文字の途中で切らない', () => {
  const long = 'DESCRIPTION:' + 'あ'.repeat(100) + 'x'.repeat(10);
  const folded = K.fold(long);
  const lines = folded.split('\r\n');
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(Buffer.byteLength(l, 'utf8') <= 75);
  assert.equal(folded.replace(/\r\n /g, ''), long);
});

test('次の施行日・日数・確認日からの月数・絞り込み', () => {
  assert.equal(K.nextItem('2026-09-25').date, '2026-10-01');
  assert.equal(K.nextItem('2026-10-01').date, '2026-10-01');
  assert.equal(K.nextItem('2030-01-01'), null);
  assert.equal(K.daysBetween('2026-09-25', '2026-10-01'), 6);
  assert.equal(K.monthsSince('2026-09-25', '2027-03-01'), 6);
  const zei = K.filterCats(V.ITEMS, ['zei']);
  assert.ok(zei.length > 0 && zei.every(i => i.cat === 'zei'));
});
