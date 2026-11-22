'use strict';
// 型 A（yorozu-plans D900・Q-1142）: <main> の最初の段落は答えの文。今の最初の段落（断り・使う道具へのリンク）は字を変えずにその後ろ。
// title・description・h1 は変えない（このテストは見ない。字は行のまま）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const firstP = html => {
  const main = html.slice(html.indexOf('<main'));
  return { main, text: main.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)[1] };
};

const PAGES = [
  ['iryohi/meisai/index.html',
    '医療を受けた方・支払先・区分・支払った額・補塡される額を入れると、国税庁の医療費控除の明細書と同じ列の表になり、合計と10万円を超えた分が出ます。CSV でダウンロードして、A4 で印刷できます。',
    '<p class="badge no-print" id="asof">令和8年に払った医療費・確認日'],
  ['gensen/guide.html',
    '源泉徴収票で、年収（額面）は「支払金額」、1年の所得税は「源泉徴収税額」の欄です。手取りは票に書かれていないので、支払金額から源泉徴収税額・社会保険料等の金額・住民税を引いて出します。',
    '<a href="./">▶ 源泉徴収票の見方と手取りの計算を使う</a>'],
  ['hikkoshi/guide.html',
    '転入届と転居届は、引越した日から14日以内です。転出届は「あらかじめ」（引越しの前）に出すもので、日数の定めはありません。',
    '<a href="./">▶ 引越しの日から手続きの一覧と期限を出す</a>'],
  ['iryohi/index.html',
    '支払った医療費と給与の収入を入れると、令和8年分の医療費控除で戻る所得税と、令和9年度の住民税の減額の目安が出ます。医療費控除は年末調整では引かれず、確定申告で受けます。',
    '<p class="badge" id="asof">令和8年に払った医療費（令和9年2〜3月の確定申告）・確認日'],
  ['koko-mushoka/index.html',
    '授業料と住んでいる都道府県を入れると、2026年度の高校無償化（国の就学支援金と都府県の上乗せ）を引いた授業料の自己負担が、年額と3年間で出ます。',
    '<p class="badge" id="asof">2026年4月からの新制度（所得制限なし）・確認日'],
  ['en/take-home-pay/index.html',
    'Enter your monthly or yearly salary before tax to see your take-home pay in Japan after income tax, residence tax, health insurance, pension, employment insurance and the child support levy.',
    '<p class="badge" id="asof">2026 tax rules and premiums from April 2026, checked'],
];

for (const [file, answer, before] of PAGES) {
  test(`型 A: ${file} の最初の段落は答えの文、前の最初の段落はその後ろ`, () => {
    const { main, text } = firstP(read(file));
    assert.equal(text, answer);
    assert.ok(main.indexOf(before) > main.indexOf(answer));
  });
}

test('型 A: 明細書の答えの文は印刷に出さない（A4 は国税庁の様式のまま）', () => {
  assert.match(read('iryohi/meisai/index.html'), /<p class="no-print">医療を受けた方/);
});

test('型 A: 医療費控除の画面は「年末調整では引かれず」を 1 つだけ持つ（上へ移した）。年末調整の計算へのリンクは残す', () => {
  const html = read('iryohi/index.html');
  assert.equal(html.split('医療費控除は年末調整では引かれず、確定申告で受けます。').length - 1, 1);
  assert.match(html, /<p class="small">所得控除の合計は → <a href="\.\.\/nenmatsu\/">年末調整の計算<\/a>でも出せます<\/p>/);
});
