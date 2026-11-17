// ページに書いた「最終確認日」が、その日付の元の値ファイルの CHECKED と同じか（Q-256 で 3 枚、Q-348 で日付のある全部に広げた。otasuke・gengo の tests/guide-date.test.js と同じ型）。
// 日付は HTML に手で書いてあり、値ファイルにも同じ日付がある（画面の JS は値ファイルから描き直すが、HTML の値はその控えとして残る）。片方だけ直すとずれるので、ここで突き合わせる。
// 比べる相手はページごとに EXPECT に書く（ページの中の順に並べる）。値ファイルに相手が無いページは NOT_TIED に理由を書く。日付を書いたページが増えたら、どちらにも無いと落ちる。
// 値ファイルは 1 本に CHECKED を複数持つことがある（iryohi-values.js の MEISAI.CHECKED）ので、比べる相手は「ファイルの最古」ではなく、ここに書いた 1 つ。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const C = (f, k = 'CHECKED') => () => require(`../lib/${f}.js`)[k];
const meisai = () => require('../lib/iryohi-values.js').MEISAI.CHECKED;

// ページ → その中の日付の元（ページの中の順）
const EXPECT = {
  'dattai-ichiji/guide.html': [C('dattai-values'), C('dattai-values')],
  'en/childcare-leave/guide.html': [C('ikukyu-values')],
  'en/high-cost-medical/guide.html': [C('kogaku-values')],
  'en/moving-checklist/guide.html': [C('moving-checklist-values')],
  'en/pension-refund/guide.html': [C('dattai-values'), C('dattai-values')],
  'en/residence-tax/guide.html': [C('juminzei-values')],
  'en/take-home-pay/guide.html': [C('take-home-values'), C('kyuyo-bunpu-values')],
  'gensen/guide.html': [C('gensen')],
  'hikkoshi/guide.html': [C('hikkoshi-values')],
  'hikkoshi/index.html': [C('hikkoshi-values')],
  'ikukyu/guide.html': [C('ikukyu-values'), C('ikukyu-values')],
  'ikukyu/index.html': [C('ikukyu-values')],
  'invoice/guide.html': [C('invoice-values')],
  'invoice/index.html': [C('invoice-values')],
  'iryohi/guide.html': [C('iryohi-values')],
  'iryohi/meisai/guide.html': [meisai],
  'juminzei/guide.html': [C('juminzei-values'), C('juminzei-values')],
  'juminzei/index.html': [C('juminzei-values')],
  'kaitei/index.html': [C('kaitei-values')],
  'kogaku-ryoyohi/guide.html': [C('kogaku-values')],
  'koko-mushoka/guide.html': [C('koko-values')],
  'koko-mushoka/index.html': [C('koko-values')],
  'lifeplan/guide.html': [C('kuriage-values'), C('lifeplan-values'), C('take-home-values')],
  'nenkin-kuriage/guide.html': [C('kuriage-values')],
  'nenmatsu/guide.html': [C('tax2026'), C('tax2026')],
  'nenmatsu/hoken/guide.html': [C('hoken')],
  'nenmatsu/index.html': [C('tax2026')],
  'shienkin/guide.html': [C('shienkin-values')],
  'shobyo/guide.html': [C('shobyo')],
  'yobosesshu/guide.html': [C('yobosesshu-values')],
};
// 日付を書いているが、値ファイルに相手が無いページ（理由）
const NOT_TIED = {};

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// 表示の文字（2026-11-12・2026年11月12日・November 12, 2026）を ISO に
function isoOf(s) {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4}) ?年 ?(\d{1,2}) ?月 ?(\d{1,2}) ?日$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/);
  if (m && MONTHS.includes(m[1])) return `${m[3]}-${pad(MONTHS.indexOf(m[1]) + 1)}-${pad(m[2])}`;
  return null;
}
// 確認日の印: 「最終確認日」「Checked」「Last checked」の直後（dt/dd を挟んでよい）、または id・data-v に checked を持つ要素
const LABEL = /(?:最終確認日は?|[Ll]ast checked|Checked|\(checked) ?(?:<\/?d[td]>\s*)*$/;
const MARK = /\b(?:id|data-v)="[^"]*[cC]hecked"/;
// ページの中の確認日を順に返す。{ iso, shown }（shown は表示の文字。空の要素＝実行時に書く、は数えない）
function datesIn(h) {
  const out = [];
  const re = /<(time|span)\b([^>]*)>([^<]*)<\/\1>|最終確認日は?\s*(\d{4} ?年 ?\d{1,2} ?月 ?\d{1,2} ?日)/g;
  for (const m of h.matchAll(re)) {
    if (m[4]) { out.push({ iso: isoOf(m[4].replace(/ /g, '')), shown: m[4] }); continue; }
    const before = h.slice(Math.max(0, m.index - 40), m.index);
    if (!MARK.test(m[2]) && !LABEL.test(before)) continue;
    const dt = (m[2].match(/\bdatetime="([^"]*)"/) || [])[1];
    if (m[1] === 'time') { if (dt) out.push({ iso: dt, shown: m[3] }); continue; }
    if (m[3]) out.push({ iso: isoOf(m[3]), shown: m[3] });
  }
  return out;
}

const pages = [];
(function walk(d) {
  for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
    if (['node_modules', '.git', 'tests', 'tools', '.github'].includes(e.name)) continue;
    const p = d ? `${d}/${e.name}` : e.name;
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html') && datesIn(fs.readFileSync(path.join(ROOT, p), 'utf8')).length) pages.push(p);
  }
})('');

test('日付を書いたページは全部 EXPECT か NOT_TIED にある（増えたらここに足す）', () => {
  assert.deepEqual(pages.sort(), [...Object.keys(EXPECT), ...Object.keys(NOT_TIED)].sort());
});

for (const [p, wants] of Object.entries(EXPECT)) {
  test(`${p} の確認日が値ファイルの CHECKED と同じ`, () => {
    const ds = datesIn(fs.readFileSync(path.join(ROOT, p), 'utf8'));
    for (const x of ds) assert.equal(isoOf(x.shown), x.iso, `${p}: 日付「${x.shown}」が読めないか、datetime ${x.iso} と違う`);
    const w = wants.map((f) => f());
    for (const x of w) assert.match(x, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(ds.map((x) => x.iso), w);
  });
}

// 予防接種の画面は確認日を HTML に書かず、app.js が値ファイルから書く（Q-348。それまでは手書きの 2026-10-03 が値の 2026-11-13 とずれていた）
test('yobosesshu/index.html は確認日を HTML に書かず、app.js が CHECKED から書く', () => {
  const h = fs.readFileSync(path.join(ROOT, 'yobosesshu/index.html'), 'utf8');
  assert.ok(h.includes('<span id="asof-date"></span>'));
  assert.ok(h.includes('<span id="about-checked"></span>'));
  assert.equal(datesIn(h).length, 0);
  const js = fs.readFileSync(path.join(ROOT, 'yobosesshu/app.js'), 'utf8');
  assert.match(js, /\$\('asof-date'\)\.textContent = c\[0\] \+ '年'/);
  assert.match(js, /\$\('about-checked'\)\.textContent = \$\('asof-date'\)\.textContent/);
});
