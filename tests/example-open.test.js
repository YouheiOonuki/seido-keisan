'use strict';
// 書類の棚の計算 3 枚（住民税・保険料控除・年末調整）を、例の値と結果を出した状態で開く（yorozu-plans Q-1223・D1060）。
// 入力が何も無い（保存した入力も無い）間だけ、入力欄の placeholder の例と同じ値で lib が計算した結果を出す。
// 画面の app.js を、DOM の代わりに何でも受ける替え玉の上で走らせて、結果の欄の字と例の 1 行を確かめる。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// 何を呼ばれても受ける要素。textContent・hidden・value などは書いた値を覚える
function makeDoc() {
  const els = {};
  function makeEl() {
    const data = { textContent: '', hidden: false, value: '', dataset: {}, className: '', style: {}, listeners: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } };
    return new Proxy(function () {}, {
      get(t, p) {
        if (p in data) return data[p];
        if (p === 'tBodies') return [makeEl()];
        if (p === 'lastChild' || p === 'caption') return makeEl();
        if (p === 'querySelectorAll') return () => [];
        if (p === 'addEventListener') return (type, fn) => { (data.listeners[type] = data.listeners[type] || []).push(fn); };
        if (p === 'fire') return (type, ev) => (data.listeners[type] || []).forEach(fn => fn(ev));
        if (p === Symbol.toPrimitive) return () => '';
        return () => makeEl();
      },
      set(t, p, v) { data[p] = v; return true; },
    });
  }
  const doc = {
    getElementById(id) { return els[id] || (els[id] = makeEl()); },
    querySelector() { return this.getElementById('__main'); },
    querySelectorAll() { return []; },
    createElement() { return makeEl(); },
    createElementNS() { return makeEl(); },
    createTextNode() { return makeEl(); },
    createDocumentFragment() { return makeEl(); },
    documentElement: { classList: { add() {}, remove() {} } },
    activeElement: null,
  };
  return doc;
}

// 開いた時の画面を作る。saved は localStorage に入っている保存（キー → 値）
function openPage(libs, appFile, saved) {
  const doc = makeDoc();
  const store = {};
  Object.keys(saved || {}).forEach(k => { store['seido-keisan_' + k] = JSON.stringify(saved[k]); });
  const bar = { text: null };
  const sb = {
    document: doc,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
    performance: { now: () => 0 },
    setTimeout: () => 0, clearTimeout: () => {},
    console,
  };
  sb.window = sb;
  vm.createContext(sb);
  libs.forEach(f => vm.runInContext(read(f), sb, { filename: f }));
  sb.ScreenParts = { setText() {}, optText() { return ''; }, fixbar() { return t => { bar.text = t; }; } };
  vm.runInContext(read(appFile), sb, { filename: appFile });
  const $ = id => doc.getElementById(id);
  return { sb, $, bar };
}

const JUMIN = ['lib/kyuyo-table-2026.js', 'lib/kyuyo-table-2025.js', 'lib/tax2026.js', 'lib/nenmatsu.js', 'lib/juminzei-values.js', 'lib/juminzei.js', 'juminzei/chart.js'];
const HOKEN = ['lib/tax2026.js', 'lib/nenmatsu.js', 'lib/juminzei-values.js', 'lib/juminzei.js', 'lib/hoken.js'];
const NENMATSU = ['lib/kyuyo-table-2026.js', 'lib/kyuyo-table-2025.js', 'lib/tax2026.js', 'lib/nenmatsu.js'];
const yen = n => Math.round(n).toLocaleString('ja-JP') + '円';

test('住民税: 開いた時、lib に例の値を渡した年額と内訳が出て、例の 1 行が付く', () => {
  const p = openPage(JUMIN, 'juminzei/app.js');
  const J = p.sb.Juminzei;
  const r = J.calc(J.normalizeInput({ income: 3000000, shakai: 450000 }), p.sb.JuminzeiValues.CURRENT);
  assert.equal(r.total, 116500);
  assert.equal(p.$('r-big').textContent, yen(r.total));
  assert.match(p.$('r-detail').textContent, new RegExp(`所得割 ${yen(r.wari)} ＋ 均等割 ${yen(r.prefKinto + r.cityKinto)} ＋ 森林環境税 ${yen(r.shinrin)}`));
  assert.equal(p.$('r-example').hidden, false);
  assert.equal(p.$('r-example').textContent, '例: 給与 300 万円・社会保険料 45 万円の場合');
  assert.equal(p.bar.text, '', '例の結果は固定バーに出さない');
});

test('住民税: 入力が 1 つ入ると例の 1 行が消え、入れた値の結果になる。空に戻しても例は戻らない', () => {
  const p = openPage(JUMIN, 'juminzei/app.js');
  p.$('form').fire('input', { target: { dataset: { k: 'income' }, type: 'number', value: '4000000', id: 'income' } });
  const J = p.sb.Juminzei;
  const r = J.calc(J.normalizeInput({ income: 4000000 }), p.sb.JuminzeiValues.CURRENT);
  assert.equal(p.$('r-example').hidden, true);
  assert.equal(p.$('r-example').textContent, '');
  assert.equal(p.$('r-big').textContent, yen(r.total));
  p.$('form').fire('input', { target: { dataset: { k: 'income' }, type: 'number', value: '', id: 'income' } });
  assert.equal(p.$('r-example').hidden, true);
  assert.equal(p.$('r-big').textContent, '—');
});

test('住民税: 保存した入力がある時は、例を出さない', () => {
  const p = openPage(JUMIN, 'juminzei/app.js', { juminzei_draft: { income: 6000000, shakai: 800000 } });
  const J = p.sb.Juminzei;
  const r = J.calc(J.normalizeInput({ income: 6000000, shakai: 800000 }), p.sb.JuminzeiValues.CURRENT);
  assert.equal(p.$('r-example').hidden, true);
  assert.equal(p.$('r-big').textContent, yen(r.total));
});

test('保険料控除: 開いた時、lib に例の値（A 新保険料 80,000 円）を渡した控除額が出て、例の 1 行が付く', () => {
  const p = openPage(HOKEN, 'nenmatsu/hoken/app.js');
  const H = p.sb.Hoken;
  const r = H.calc(H.normalizeInput({ a: 80000 }));
  assert.equal(r.empty, false);
  assert.ok(r.shotoku.total > 0);
  assert.equal(p.$('r-big').textContent, yen(r.shotoku.total));
  assert.equal(p.$('s-seimei').textContent, yen(r.shotoku.seimei));
  assert.equal(p.$('j-seimei').textContent, yen(r.jumin.seimei));
  assert.equal(p.$('r-example').hidden, false);
  assert.equal(p.$('r-example').textContent, '例: A 新保険料 8 万円の場合');
  assert.equal(p.$('topbar').hidden, true);
});

test('保険料控除: 入力が 1 つ入ると例の 1 行が消え、入れた値の結果になる', () => {
  const p = openPage(HOKEN, 'nenmatsu/hoken/app.js');
  const H = p.sb.Hoken;
  p.$('__main').fire('input', { target: { dataset: { k: 'a' }, type: 'number', value: '30000' } });
  const r = H.calc(H.normalizeInput({ a: 30000 }));
  assert.equal(p.$('r-example').hidden, true);
  assert.equal(p.$('r-big').textContent, yen(r.shotoku.total));
  p.$('__main').fire('input', { target: { dataset: { k: 'a' }, type: 'number', value: '' } });
  assert.equal(p.$('r-example').hidden, true);
  assert.equal(p.$('r-big').textContent, '—');
});

test('保険料控除: 保存した入力がある時は、例を出さない', () => {
  const p = openPage(HOKEN, 'nenmatsu/hoken/app.js', { hoken_draft: { a: 50000 } });
  const H = p.sb.Hoken;
  const r = H.calc(H.normalizeInput({ a: 50000 }));
  assert.equal(p.$('r-example').hidden, true);
  assert.equal(p.$('r-big').textContent, yen(r.shotoku.total));
});

test('年末調整: 開いた時、lib に placeholder の例の値を渡した結果が出て、例の 1 行が付く', () => {
  const p = openPage(NENMATSU, 'nenmatsu/app.js');
  const N = p.sb.Nenmatsu, T = p.sb.TaxValues;
  const r = N.calc(N.normalizeInput({ income: 5000000, withheld: 120000, shakai: 720000 }), T.CURRENT);
  assert.equal(r.ok, true);
  assert.ok(r.diff !== 0);
  const big = p.$('r-big').textContent;
  assert.equal(big, (r.diff > 0 ? '戻る見込み ' : '足りない見込み ') + yen(Math.abs(r.diff)));
  assert.equal(p.$('r-example').hidden, false);
  assert.equal(p.$('r-example').textContent, '例: 給与 500 万円・源泉徴収 12 万円・社会保険料 72 万円の場合');
  assert.equal(p.bar.text, '');
});

test('年末調整: 入力が 1 つ入ると例の 1 行が消え、入れた値の結果になる', () => {
  const p = openPage(NENMATSU, 'nenmatsu/app.js');
  p.$('form').fire('input', { target: { dataset: { k: 'income' }, type: 'number', value: '3000000', id: 'income', closest: () => null } });
  const N = p.sb.Nenmatsu, T = p.sb.TaxValues;
  const r = N.calc(N.normalizeInput({ income: 3000000 }), T.CURRENT);
  assert.equal(p.$('r-example').hidden, true);
  assert.equal(p.$('r-big').textContent, yen(r.nenzei));
});

test('年末調整: 保存した入力がある時は、例を出さない', () => {
  const p = openPage(NENMATSU, 'nenmatsu/app.js', { nenmatsu_draft: { income: 3000000, withheld: 0, shakai: 0 } });
  assert.equal(p.$('r-example').hidden, true);
  assert.notEqual(p.$('r-big').textContent, '—');
});

test('3 枚とも、入力欄の placeholder の例は今のまま、例の 1 行の入れ物がある', () => {
  const ph = { 'juminzei/index.html': ['例：3000000', '例：450000'], 'nenmatsu/hoken/index.html': ['例：80000'], 'nenmatsu/index.html': ['例：5000000', '例：120000', '例：720000'] };
  Object.keys(ph).forEach(f => {
    const html = read(f);
    ph[f].forEach(s => assert.ok(html.includes(`placeholder="${s}"`), f + ' ' + s));
    assert.match(html, /<div class="result-head"><h2 id="h-result">[^<]+<\/h2><p class="example-line" id="r-example" hidden><\/p><\/div>/, f);
  });
});
