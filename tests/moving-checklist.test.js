// 引越し・在留の手続きリスト（英語ページ。K69）のテスト: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../lib/moving-checklist.js');
const V = require('../lib/moving-checklist-values.js');

test('期限: 「〜した日から 14 日以内」は初日を数えない（民法 140 条）', () => {
  assert.equal(M.addDays('2027-04-01', V.DAYS.notice), '2027-04-15');
  assert.equal(M.addDays('2027-12-25', 14), '2028-01-08');
});

test('在留期間の更新: 満了の 3 か月前から（同じ日が無い月は月末）', () => {
  assert.equal(M.monthsBefore('2027-03-31', 3), '2026-12-31');
  assert.equal(M.monthsBefore('2027-05-31', 3), '2027-02-28');
  assert.equal(M.monthsBefore('2028-05-30', 3), '2028-02-29');
  const b = M.build({ situations: ['renew'], expiryDate: '2027-03-31' });
  const it = b.groups[0].items.find((x) => x.id === 'renewApply');
  assert.equal(it.from, '2026-12-31');
  assert.equal(it.due, '2027-03-31');
  // 在留期間が 6 か月未満なら「3 か月前から」は出さない
  assert.equal(M.build({ situations: ['renew'], expiryDate: '2027-03-31', longStay: false }).groups[0].items[0].from, '');
});

test('場面とカードの有無で項目が決まる。並びは 前 → 出国のとき → 後 → 在留期間', () => {
  const b = M.build({ situations: ['other', 'renew', 'leave'], moveDate: '2027-04-01' });
  assert.deepEqual(b.groups.map((g) => g.when), ['before', 'depart', 'after', 'renew']);
  const ids = b.groups.flatMap((g) => g.items.map((i) => i.id));
  assert.ok(ids.includes('moveInCard'));
  assert.equal(b.groups.find((g) => g.when === 'after').items.find((i) => i.id === 'moveIn').due, '2027-04-15');
  const noCard = M.build({ situations: ['other', 'renew', 'leave'], hasCard: false });
  const ids2 = noCard.groups.flatMap((g) => g.items.map((i) => i.id));
  for (const id of ['moveInCard', 'renewCard', 'leaveMyNumber']) assert.ok(!ids2.includes(id), id);
  assert.equal(M.build({}).count, 0);
  assert.deepEqual(M.normalizeInput({ situations: ['leave', 'x', 'arrive', 'leave'] }).situations, ['arrive', 'leave']);
});

test('どの項目にも出典がある（年金の項目は自サイトの計算機へのリンク）。文は 1 項目 3 文まで', () => {
  for (const it of V.ITEMS) {
    assert.ok(it.basis.length || it.link, it.id);
    for (const b of it.basis) assert.ok(V.SOURCES[b[0]], it.id + ' ' + b[0]);
    assert.ok(it.text.split(/\. /).length <= 3, it.id);
    assert.ok(V.SITUATIONS.some((s) => s.id === it.sit), it.id);
  }
  for (const s of Object.values(V.SOURCES)) assert.match(s.url, /^https:\/\/(laws\.e-gov\.go\.jp|www\.moj\.go\.jp)\//);
});

test('法的助言に見える言い方をしない（must・should・guarantee・you are required を使わない）', () => {
  const all = V.ITEMS.map((i) => i.text).join(' ') + fs.readFileSync(path.join(__dirname, '..', 'en/moving-checklist/guide.html'), 'utf8');
  for (const w of [/\bmust\b/i, /\bshould\b/i, /guarantee/i, /you are required/i, /legally/i]) assert.ok(!w.test(all), String(w));
});

test('書き出し・読み込み', () => {
  const f = M.toExportFile({ situations: ['same'], name: 'A' }, new Date('2026-10-03T00:00:00Z'));
  assert.equal(f.tool, 'seido-keisan-moving-checklist');
  assert.deepEqual(M.fromExportFile(f), { ok: true, data: f.data });
  assert.equal(M.fromExportFile({ tool: 'x' }).code, 'otherTool');
});

test('日数は値ファイルの DAYS から文に入る（文に日数を写さない）', () => {
  for (const it of V.ITEMS) assert.ok(!/\b(14|90|30)\b days|\b[2-6] months/.test(it.text), it.id + ': ' + it.text);
  const b = M.build({ situations: ['other', 'renew', 'trip'] });
  const all = b.groups.flatMap((g) => g.items.map((i) => i.text)).join(' ');
  assert.ok(!/\{\w+\}/.test(all));
  assert.ok(all.includes('within ' + V.DAYS.notice + ' days of moving'));
  assert.ok(all.includes('from ' + V.DAYS.renewMonths + ' months before'));
});
