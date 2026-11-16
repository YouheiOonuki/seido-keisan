// guide の「最終確認日」が、その日付の元の値ファイルの CHECKED と同じか（Q-256、yorozu-plans の QUEUE 2026-11-16 朝。otasuke の tests/guide-date.test.js と同じ型）。
// 値ファイルは 1 本に CHECKED を複数持つことがある（iryohi-values.js の MEISAI.CHECKED）ので、比べる相手は「ファイルの最古」ではなく、ここに書いた 1 つ。
// 対応はここ 1 か所。guide.html は静的な HTML なので日付は guide に持ったまま（id のある日付は画面の JS が値ファイルから描き直す。HTML の値はその控え）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// [guide, 日付の見つけ方（id が無ければ「最終確認日」の直後の 1 つ目）, 値ファイルの CHECKED]
const TIES = [
  ['iryohi/guide.html', null, () => require('../lib/iryohi-values.js').CHECKED],
  ['iryohi/meisai/guide.html', null, () => require('../lib/iryohi-values.js').MEISAI.CHECKED],
  ['lifeplan/guide.html', null, () => require('../lib/kuriage-values.js').CHECKED],
  ['lifeplan/guide.html', 'tax-checked', () => require('../lib/take-home-values.js').CHECKED],
  ['lifeplan/guide.html', 'teikibin-checked', () => require('../lib/lifeplan-values.js').CHECKED],
];

const dateOf = (h, id) => {
  const re = id
    ? new RegExp(`<time id="${id}" datetime="(\\d{4}-\\d{2}-\\d{2})">([^<]+)</time>`)
    : /最終確認日 <time datetime="(\d{4}-\d{2}-\d{2})">([^<]+)<\/time>/;
  return (h.match(re) || []).slice(1);
};

for (const [g, id, checked] of TIES) {
  test(`${g}${id ? ` の #${id}` : ''} の日付が値ファイルの CHECKED と同じ`, () => {
    const [attr, text] = dateOf(read(g), id);
    assert.match(attr || '', /^\d{4}-\d{2}-\d{2}$/, `${g} に日付が無い`);
    assert.equal(text, attr, 'datetime と表示が同じ');
    assert.equal(attr, checked());
  });
}
