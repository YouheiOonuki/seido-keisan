// 子どもの予防接種スケジュール（lib/yobosesshu.js・lib/yobosesshu-values.js）のテスト
// 期待値は 厚生労働省の事務連絡（平成26年3月11日）の例と、予防接種法施行令 3 条・定期接種実施要領（令和8年10月1日改正）を手で日付にしたもの
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Y = require('../lib/yobosesshu.js');
const V = require('../lib/yobosesshu-values.js');

test('事務連絡の例: 平成25年4月1日生まれ', () => {
  assert.equal(Y.reachMonths('2013-04-01', 1), '2013-04-30', '生後1月 ＝ 翌月の同日の前日');
  assert.equal(Y.reachMonths('2013-04-01', 3), '2013-06-30', '生後3月');
  assert.equal(Y.reachMonths('2013-04-01', 6), '2013-09-30', '生後6月');
  assert.equal(Y.reachMonths('2013-04-01', 12), '2014-03-31', '1歳に達した日 ＝ 誕生日の前日');
  assert.equal(Y.reachMonths('2013-01-31', 1), '2013-02-28', '翌月に同日が無いときは翌月の末日');
});

test('月末・うるう年', () => {
  assert.equal(Y.reachMonths('2024-02-29', 12), '2025-02-28');
  assert.equal(Y.reachMonths('2024-02-29', 48), '2028-02-28', '同じ日がある年は前日');
  assert.equal(Y.reachMonths('2026-08-31', 2), '2026-10-30');
  assert.equal(Y.reachMonths('2026-12-31', 2), '2027-02-28');
});

test('小学校就学の始期と MR 2期・HPV の年度', () => {
  assert.equal(Y.schoolStart('2020-04-01'), '2026-04-01', '4月1日生まれは早生まれ');
  assert.equal(Y.schoolStart('2020-04-02'), '2027-04-01');
  assert.equal(Y.schoolStart('2021-03-31'), '2027-04-01');
  const mr2 = V.VACCINES.find((v) => v.id === 'mr2').target;
  assert.equal(Y.resolve('2020-04-02', mr2[0]), '2026-04-01');
  assert.equal(Y.resolve('2020-04-02', mr2[1]), '2027-03-31');
  const hpv = V.VACCINES.find((v) => v.id === 'hpv').target;
  // 2014-04-02 生まれ: 12歳となる日 2026-04-01（2026年度）→ 2026-04-01〜、16歳となる日 2030-04-01（2030年度）→ 2031-03-31 まで
  assert.equal(Y.resolve('2014-04-02', hpv[0]), '2026-04-01');
  assert.equal(Y.resolve('2014-04-02', hpv[1]), '2031-03-31');
  // 2014-04-01 生まれ: 12歳となる日 2026-03-31（2025年度）
  assert.equal(Y.resolve('2014-04-01', hpv[0]), '2025-04-01');
});

test('2026-05-10 生まれの一覧（手で数えた日付）', () => {
  const s = Y.schedule('2026-05-10', '2026-10-03');
  const r = (id) => s.rows.find((x) => x.id === id);
  assert.deepEqual(r('hepb-0').std, { from: '2026-07-09', to: '2027-02-09' }, 'B型肝炎: 生後2月〜9月');
  assert.deepEqual(r('hepb-0').target, { from: '2026-05-10', to: '2027-05-09' }, '1歳に至るまで');
  assert.deepEqual(r('rota-0').std, { from: '2026-07-09', to: '2026-08-22' }, 'ロタ1回目: 生後2月〜出生14週6日後（+104日）');
  assert.deepEqual(r('rota-0').target, { from: '2026-06-21', to: '2026-12-20' }, '出生6週0日後〜32週0日後');
  assert.deepEqual(r('go-0').std, { from: '2026-07-09', to: '2026-12-09' }, '5種混合: 生後2月〜7月');
  assert.equal(r('go-0').target.to, '2033-11-09', '生後90月');
  assert.deepEqual(r('pcv-2').std, { from: '2027-05-09', to: '2027-08-09' }, '肺炎球菌の追加: 生後12月〜15月');
  assert.equal(r('pcv-0').target.to, '2031-05-09', '生後60月');
  assert.deepEqual(r('bcg-0').std, { from: '2026-10-09', to: '2027-01-09' }, 'BCG: 生後5月〜8月');
  assert.deepEqual(r('mr1-0').target, { from: '2027-05-09', to: '2028-05-09' }, 'MR1期: 生後12月〜24月');
  assert.deepEqual(r('vari-0').std, { from: '2027-05-09', to: '2027-08-09' });
  assert.equal(r('vari-0').target.to, '2029-05-09', '生後36月');
  assert.deepEqual(r('je1-0').std, { from: '2029-05-09', to: '2030-05-09' }, '日本脳炎: 3歳〜4歳に達するまで');
  assert.deepEqual(r('je1-0').target, { from: '2026-11-09', to: '2033-11-09' }, '生後6月〜90月');
  assert.deepEqual(r('mr2-0').target, { from: '2032-04-01', to: '2033-03-31' }, '2026-05-10 生まれは 2033 年 4 月に入学');
  assert.deepEqual(r('je2-0').target, { from: '2035-05-09', to: '2039-05-09' }, '9歳以上13歳未満');
  assert.deepEqual(r('dt2-0').std, { from: '2037-05-09', to: '2038-05-09' });
  assert.deepEqual(r('hpv-0').target, { from: '2038-04-01', to: '2043-03-31' });
  assert.deepEqual(r('hpv-0').std, { from: '2039-04-01', to: '2040-03-31' }, '13歳となる日の属する年度');
  // いまの状態
  assert.deepEqual(s.now.map((x) => x.id), ['hepb-0', 'go-0', 'pcv-0']);
  assert.equal(s.next.date, '2026-10-09');
  assert.deepEqual(s.next.rows.map((x) => x.id), ['bcg-0']);
  assert.deepEqual(s.late.map((x) => x.id), ['rota-0']);
  assert.equal(r('hepb-1').status, 'follow');
});

test('状態の境目（両端の日を含む）', () => {
  const std = { from: '2026-07-09', to: '2026-12-09' }, target = { from: '2026-07-09', to: '2033-11-09' };
  assert.equal(Y.status('2026-07-08', std, target), 'before');
  assert.equal(Y.status('2026-07-09', std, target), 'now');
  assert.equal(Y.status('2026-12-09', std, target), 'now');
  assert.equal(Y.status('2026-12-10', std, target), 'late');
  assert.equal(Y.status('2033-11-09', std, target), 'late');
  assert.equal(Y.status('2033-11-10', std, target), 'ended');
  assert.equal(Y.schedule('2026-02-30', '2026-10-03'), null, 'ない日付');
});

test('値のファイル: 確認日・出典・すべてのワクチンに出典の鍵', () => {
  assert.match(V.CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(V.STALE_MONTHS, 12);
  const keys = new Set(V.SOURCES.map((s) => s.key));
  for (const s of V.SOURCES) assert.match(s.url, /^https:\/\//);
  for (const v of V.VACCINES) for (const k of v.src) assert.ok(keys.has(k), v.id + ' ' + k);
  assert.equal(V.VACCINES.length, 12);
});

test('ページの決まり: 保存しない・医療の NG 語・リンク・sitemap・一覧', () => {
  const root = path.join(__dirname, '..');
  const js = fs.readFileSync(path.join(root, 'yobosesshu', 'app.js'), 'utf8') + fs.readFileSync(path.join(root, 'lib', 'yobosesshu.js'), 'utf8');
  assert.ok(!/localStorage|indexedDB/.test(js.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), '保存しない（消すボタンは不要）');
  const visible = (h) => h.replace(/^[\s\S]*?<body\b[^>]*>/i, '').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '');
  for (const f of ['index.html', 'guide.html']) {
    const h = fs.readFileSync(path.join(root, 'yobosesshu', f), 'utf8');
    // 「予防接種」は法令の名前（予防接種法）なので除き、効能の語が無いこと（REVIEW C7 R4 の語）
    const t = visible(h).split('予防接種').join('');
    assert.deepEqual(t.match(/診断|改善|予防|効果|治る|若返/g), null, f);
    assert.ok(h.includes('href="../../about.html"') && h.includes('href="../../privacy-policy.html"'), f);
    assert.equal((h.match(/beacon\.min\.js/g) || []).length, 1, f);
    assert.ok(h.includes(`<link rel="canonical" href="https://yorozu-craft.com/seido-keisan/yobosesshu/${f === 'index.html' ? '' : f}">`), f);
  }
  // 画面の値の文にも NG 語が無い
  const vt = JSON.stringify(V.VACCINES) + JSON.stringify(V.OUT_OF_SCOPE);
  assert.deepEqual(vt.split('予防接種').join('').match(/診断|改善|予防|効果|治る|若返/g), null);
  const guide = fs.readFileSync(path.join(root, 'yobosesshu', 'guide.html'), 'utf8');
  for (const o of V.OUT_OF_SCOPE) assert.ok(guide.includes(o), '使い方ページの対象外: ' + o);
  const sm = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.ok(sm.includes('/seido-keisan/yobosesshu/</loc>') && sm.includes('/seido-keisan/yobosesshu/guide.html</loc>'));
  const hub = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(hub.includes('href="./yobosesshu/"'));
});
