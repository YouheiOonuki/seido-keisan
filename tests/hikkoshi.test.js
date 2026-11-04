// 引越しの手続きの一覧（/seido-keisan/hikkoshi/。K233、Q-108）のテスト: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../lib/hikkoshi.js');
const V = require('../lib/hikkoshi-values.js');
const MV = require('../lib/moving-checklist-values.js');
const B = require('../lib/box.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ids = (b) => b.groups.flatMap((g) => g.items.map((i) => i.id));
const item = (b, id) => b.groups.flatMap((g) => g.items).find((i) => i.id === id);
function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { _m: m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

// ---------- 期限の計算 ----------
test('期限: 14 日と 90 日は英語版と同じ値を読む（値を写さない）。15 日・1 年は条文どおり', () => {
  assert.equal(V.DAYS.notice, MV.DAYS.notice);
  assert.equal(V.DAYS.cardPresent, MV.DAYS.cardPresent);
  assert.equal(V.DAYS.notice, 14);
  assert.equal(V.DAYS.cardPresent, 90);
  assert.equal(V.DAYS.jidou, 15);
  assert.equal(V.DAYS.car, 15);
  assert.equal(V.DAYS.postYears, 1);
});

test('期限: 「〜した日から 14 日以内」は初日を数えない（民法 140 条）。月・年をまたぐ、うるう年', () => {
  const b = H.build({ moveDate: '2026-11-05' }, '2026-11-05');
  assert.equal(item(b, 'tennyu').due, '2026-11-19');
  assert.equal(item(b, 'tennyu').deadlineText, '11月19日（木）まで');
  assert.equal(item(b, 'kokuho').due, '2026-11-19');
  assert.equal(item(b, 'nenkin').due, '2026-11-19');
  assert.equal(item(b, 'jidou').due, '2026-11-20');
  assert.equal(item(b, 'car').due, '2026-11-20');
  assert.equal(item(b, 'shako').due, '2026-11-20');
  assert.equal(item(H.build({ moveDate: '2026-12-25' }), 'tennyu').due, '2027-01-08');
  assert.equal(item(H.build({ moveDate: '2028-02-20' }), 'tennyu').due, '2028-03-05');   // 2028 年は 2 月 29 日がある
  assert.equal(item(H.build({ moveDate: '2027-02-20' }), 'tennyu').due, '2027-03-06');
});

test('期限: 日数でないものは原文の言い方（あらかじめ・速やかに・同時に）。期限の無いものは日付を出さない', () => {
  const b = H.build({ moveDate: '2026-11-05' }, '2026-11-01');
  assert.equal(item(b, 'tenshutsu').due, '');
  assert.match(item(b, 'tenshutsu').deadlineText, /11月5日（木）より前に（あらかじめ）/);
  assert.equal(item(b, 'menkyo').deadlineText, '速やかに');
  assert.equal(item(b, 'cardIn').deadlineText, '転入届と同時に');
  for (const id of ['yubin', 'lifeline', 'bank']) {
    assert.equal(item(b, id).due, '', id);
    assert.doesNotMatch(item(b, id).deadlineText, /\d+日/, id);
  }
  // 引越しの日が無いときは日数だけ
  assert.equal(item(H.build({}), 'tennyu').deadlineText, '引越しから14日以内');
  assert.equal(item(H.build({}), 'tenshutsu').deadlineText, '引越しの前に（あらかじめ）');
});

test('期限: 今日が期限を過ぎていて印が無ければ「過ぎています」、印があれば出さない。次の期限は今日以後で一番早いもの', () => {
  const b = H.build({ moveDate: '2026-11-05' }, '2026-11-20');
  assert.equal(item(b, 'tennyu').overdue, true);
  assert.equal(item(b, 'car').overdue, false);           // 11-20 は当日
  assert.equal(b.next.id, 'jidou');                      // 11-20 の 3 つのうち一覧の先
  const b2 = H.build({ moveDate: '2026-11-05', done: ['tennyu'] }, '2026-11-20');
  assert.equal(item(b2, 'tennyu').overdue, false);
  const b3 = H.build({ moveDate: '2026-11-05' }, '2026-11-01');
  assert.equal(b3.next.due, '2026-11-19');
  assert.equal(H.build({ moveDate: '2026-11-05' }, '2026-12-31').next, null);
});

// ---------- 項目の出し分けと順 ----------
test('ほかの市区町村へ: 転出届 → 転入届 → カード → 国保 → 年金 → 児童手当 → 車 → 車庫 → 免許 → 銀行の順。同じ市区町村の中は転居届', () => {
  const b = H.build({ kind: 'other' });
  assert.deepEqual(b.groups.map((g) => g.when), ['before', 'after']);
  assert.deepEqual(ids(b), ['tenshutsu', 'yubin', 'lifeline', 'tennyu', 'cardIn', 'kokuho', 'nenkin', 'jidou', 'car', 'shako', 'menkyo', 'bank']);
  const s = H.build({ kind: 'same' });
  assert.deepEqual(ids(s), ['yubin', 'lifeline', 'tenkyo', 'cardSame', 'kokuhoSame', 'nenkin', 'car', 'shako', 'menkyo', 'bank']);
  assert.equal(item(s, 'tenkyo').due, '');
});

test('当てはまるものを外すと、その行だけが消える。既定は全部入り', () => {
  const all = H.build({});
  assert.equal(all.count, 12);
  const none = H.build({ has: { card: false, kokuho: false, nenkin: false, jidou: false, menkyo: false, car: false } });
  assert.deepEqual(ids(none), ['tenshutsu', 'yubin', 'lifeline', 'tennyu', 'bank']);
  assert.ok(!ids(H.build({ has: { car: false } })).includes('shako'));
  assert.ok(ids(H.build({ has: { car: false } })).includes('menkyo'));
});

test('残りの数は印の数だけ減る。知らない id・重複は落とす', () => {
  const b = H.build({ done: ['tennyu', 'tennyu', 'nai', 'yubin'] });
  assert.equal(b.left, b.count - 2);
  assert.deepEqual(b.input.done, ['yubin', 'tennyu']);
  // 種類を変えて行が消えた印は数えない
  assert.equal(H.build({ kind: 'same', done: ['tennyu'] }).left, H.build({ kind: 'same' }).count);
});

test('入力の形: 壊れた日付・知らない種類は既定に戻す', () => {
  assert.equal(H.normalize({ moveDate: '2026-02-30' }).moveDate, '');
  assert.equal(H.normalize({ moveDate: '20261105' }).moveDate, '');
  assert.equal(H.normalize({ kind: 'abroad' }).kind, 'other');
  assert.deepEqual(H.normalize(null).has, { card: true, kokuho: true, nenkin: true, jidou: true, menkyo: true, car: true });
  assert.deepEqual(H.normalize('x').done, []);
});

// ---------- 保存（箱の区画 hikkoshi） ----------
test('保存: 引越しの日の年の区画 hikkoshi に入り、開き直すと同じ入力と印が出る', () => {
  const st = fakeStorage();
  const s = { moveDate: '2027-03-28', kind: 'same', has: { car: false }, done: ['tenkyo'] };
  B.save(st, H.toBox(B.load(st).box, s, '2026', '2026-11-05').box);
  const raw = JSON.parse(st._m.get('seido-keisan_box'));
  assert.ok(raw.years['2027'].hikkoshi);
  assert.equal(raw.years['2026'], undefined);
  const l = H.fromBox(B.load(st).box, '2026-11-05');
  assert.equal(l.year, '2027');
  assert.deepEqual(l.state, H.normalize(s));
});

test('保存: 引越しの日の年を変えたら前の年の区画を外す。同じ箱のほかの区画（明細書）は消さない', () => {
  const st = fakeStorage({ 'seido-keisan_box': JSON.stringify({ version: 1, years: { 2026: { meisai: { rows: [{ amount: 1000 }] }, hikkoshi: { moveDate: '2026-12-01' } } } }) });
  const r = H.toBox(B.load(st).box, { moveDate: '2027-01-10' }, '2026', '2026-11-05');
  B.save(st, r.box);
  const raw = JSON.parse(st._m.get('seido-keisan_box'));
  assert.equal(raw.years['2026'].hikkoshi, undefined);
  assert.equal(raw.years['2026'].meisai.rows[0].amount, 1000);
  assert.equal(raw.years['2027'].hikkoshi.moveDate, '2027-01-10');
});

test('保存の壊れ: 読めない値・形の違う区画でも止まらず空の入力で始める。localStorage が使えなくても動く', () => {
  for (const v of ['{', 'null', '[]', '"x"', JSON.stringify({ version: 1, years: { 2026: { hikkoshi: 'x' } } }),
    JSON.stringify({ version: 1, years: { 2026: { hikkoshi: { moveDate: 5, kind: 9, has: [1], done: 'tennyu' } } } })]) {
    const l = H.fromBox(B.load(fakeStorage({ 'seido-keisan_box': v })).box, '2026-11-05');
    assert.equal(l.state.moveDate, '', v);
    assert.equal(l.state.kind, 'other', v);
    assert.deepEqual(l.state.done, [], v);
  }
  assert.equal(H.fromBox(B.load(null).box, '2026-11-05').year, '2026');
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } };
  assert.equal(B.save(full, H.toBox(B.empty(), {}, '', '2026-11-05').box), false);
});

test('保存: 箱の区画は形と大きさだけを保つ（長い id・多すぎる印・自由な文字を入れない）', () => {
  const n = B.normalize({ version: 1, years: { 2026: { hikkoshi: { moveDate: '2026-11-05', kind: 'same', has: { car: 1, '<b>': true }, done: Array.from({ length: 80 }, (_, i) => 'a' + i).concat(['x'.repeat(40), 'メモ']), memo: '氏名' } } } });
  const h = n.years['2026'].hikkoshi;
  assert.deepEqual(Object.keys(h), ['moveDate', 'kind', 'has', 'done']);
  assert.deepEqual(h.has, { car: true });
  assert.equal(h.done.length, 50);
  assert.ok(!h.done.includes('メモ'));
});

// ---------- 出典と画面の突き合わせ ----------
test('どの項目にも窓口があり、期限の無い 3 つ（郵便・電気ガス水道・銀行）以外は出典がある。出典は使い方ページに全部載る', () => {
  const guide = read('hikkoshi/guide.html');
  for (const it of V.ITEMS) {
    assert.ok(it.where, it.id);
    if (!['lifeline', 'bank'].includes(it.id)) assert.ok(it.basis.length, it.id);
    for (const [k] of it.basis) assert.ok(V.SOURCES[k], it.id + ' ' + k);
    assert.ok(!/\{\w+\}/.test(H.fill(it.text)), it.id);
  }
  for (const [k, s] of Object.entries(V.SOURCES)) assert.ok(guide.includes(s.url), k + ' ' + s.url);
  assert.match(V.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
});

test('画面: 読む script が全部あり、どこにも送信しない。自由な文字の欄が無い。「全部」と言わない（A6）', () => {
  const html = read('hikkoshi/index.html');
  for (const m of html.matchAll(/<script src="(\.[^"]+)"/g)) assert.ok(fs.existsSync(path.join(ROOT, 'hikkoshi', m[1])), m[1]);
  assert.doesNotMatch(html, /type="text"|<textarea/);
  for (const f of ['hikkoshi/app.js', 'lib/hikkoshi.js', 'lib/hikkoshi-values.js']) {
    const src = read(f).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\bfetch\s*\(|sendBeacon|XMLHttpRequest|WebSocket|geolocation/, f);
    assert.doesNotMatch(src, /全部|すべての手続き/, f);
  }
  for (const f of ['hikkoshi/index.html', 'hikkoshi/guide.html']) assert.doesNotMatch(read(f).replace(/<!--[\s\S]*?-->/g, ''), /全部|すべての手続き|全ての手続き/, f);
  assert.match(html, /この一覧は目安です。/);
  assert.match(html, /ほかにも手続きがある場合があります。/);
  assert.match(read('index.html'), /href="\.\/hikkoshi\/"/);                 // 制度の計算機の一覧から 1 リンク
  assert.match(read('sitemap.xml'), /seido-keisan\/hikkoshi\/<\/loc>/);
  assert.match(read('sitemap.xml'), /seido-keisan\/hikkoshi\/guide\.html<\/loc>/);
});
