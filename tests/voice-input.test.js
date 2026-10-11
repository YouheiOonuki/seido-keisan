// 声で入力（yorozu-plans ROADMAP 7.37.1 K148、企画書 85）: 値 → 欄の手順、WAV、ページの例外文、押したときだけマイク、保存しない
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../lib/voice-input.js');
const ROOT = path.join(__dirname, '..');
const PAGES = { kogaku: 'kogaku-ryoyohi', kuriage: 'nenkin-kuriage', iryohi: 'iryohi' };

test('高額療養費: 年齢 → 年齢と保険（70・75 で分ける）、医療費 → 1 か月目の欄、入院・外来 → ラジオ', () => {
  assert.deepEqual(V.plan('kogaku', { age: 78, cost: 300000, place: 'in' }), [
    { id: 'ageplan', value: 'kouki', event: 'change' }, { id: 'cost0', value: '300000', event: 'input' }, { name: 'place0', value: 'in', event: 'change' }]);
  assert.equal(V.plan('kogaku', { age: 69 })[0].value, 'u70');
  assert.equal(V.plan('kogaku', { age: 70 })[0].value, 'o70');
  assert.equal(V.plan('kogaku', { age: 74 })[0].value, 'o70');
  assert.equal(V.plan('kogaku', { age: 75 })[0].value, 'kouki');
  assert.deepEqual(V.plan('kogaku', { age: null, cost: 0, place: 'home' }), []);
});

test('年金: 昭和・平成・西暦の生年月日 → 日付の欄（1940〜2010 年だけ）、受け取り始める年齢は 60〜75 だけ（月は無ければ 0）', () => {
  const p = V.plan('kuriage', { birth_era: '昭和', birth_year: 35, birth_month: 4, birth_day: 2, kiso: 800000, kosei: 1000000, start_age: 70, start_month: null });
  assert.deepEqual(p, [
    { id: 'birth', value: '1960-04-02', event: 'change' }, { id: 'kiso', value: '800000', event: 'input' }, { id: 'kosei', value: '1000000', event: 'input' },
    { id: 'age', value: '70', event: 'change' }, { id: 'mon', value: '0', event: 'change' }]);
  assert.equal(V.plan('kuriage', { birth_era: '平成', birth_year: 2, birth_month: 1, birth_day: 9 })[0].value, '1990-01-09');
  assert.equal(V.plan('kuriage', { birth_era: '西暦', birth_year: 1958, birth_month: 12, birth_day: 31 })[0].value, '1958-12-31');
  assert.equal(V.plan('kuriage', { birth_era: null, birth_year: 1958, birth_month: 12, birth_day: 31 })[0].value, '1958-12-31', '数が 1900 以上なら西暦');
  assert.deepEqual(V.plan('kuriage', { birth_era: '昭和', birth_year: 10, birth_month: 1, birth_day: 1 }), [], '1935 年は欄の範囲の外');
  assert.deepEqual(V.plan('kuriage', { birth_era: '昭和', birth_year: 35, birth_month: 4 }), [], '日が無ければ入れない');
  assert.deepEqual(V.plan('kuriage', { start_age: 80 }), []);
  assert.equal(V.plan('kuriage', { start_age: 66, start_month: 6 })[1].value, '6');
});

test('医療費控除: 医療費・補てん・給与の年収（入れ方を「給与だけ」にしてから）', () => {
  assert.deepEqual(V.plan('iryohi', { hiyo: 250000, hoten: 50000, income: 4500000 }), [
    { id: 'hiyo', value: '250000', event: 'input' }, { id: 'hoten', value: '50000', event: 'input' },
    { id: 'mode', value: 'kyuyo', event: 'change' }, { id: 'income', value: '4500000', event: 'input' }]);
  assert.deepEqual(V.plan('nenmatsu', { hiyo: 1 }), []);
});

test('WAV: 16kHz・16 ビット・モノラル、見出し 44 バイト、-1〜1 の外は切る', () => {
  const w = V.toWav(new Float32Array([0, 1, -1, 2]), 16000);
  const b = Buffer.from(w);
  assert.equal(b.toString('latin1', 0, 4), 'RIFF');
  assert.equal(b.toString('latin1', 8, 12), 'WAVE');
  assert.equal(b.readUInt32LE(24), 16000);
  assert.equal(b.readUInt32LE(28), 32000);
  assert.equal(b.length, 44 + 8);
  assert.deepEqual([b.readInt16LE(44), b.readInt16LE(46), b.readInt16LE(48), b.readInt16LE(50)], [0, 32767, -32768, 32767]);
});

test('3 ページ: 声の箱（最初は隠す）・例外文・voice-input.js。欄の id が手順の id と合う', () => {
  for (const [form, dir] of Object.entries(PAGES)) {
    const html = fs.readFileSync(path.join(ROOT, dir, 'index.html'), 'utf8');
    assert.match(html, new RegExp(`<div class="voice-box" data-voice-form="${form}" hidden>`), dir);
    assert.ok(html.includes('声の入力はサーバー（Cloudflare の AI）で文字にします。保存しません。ほかの入力は端末の外に出ません。'), dir);
    assert.ok(html.indexOf('<script src="../lib/voice-input.js"></script>') > html.indexOf('<script src="./app.js"></script>'), dir);
    const ids = { kogaku: ['ageplan', 'cost0'], kuriage: ['birth', 'kiso', 'kosei', 'age', 'mon'], iryohi: ['hiyo', 'hoten', 'mode', 'income'] }[form];
    for (const id of ids) assert.ok(html.includes(`id="${id}"`) || dir === 'nenkin-kuriage', `${dir} #${id}`);
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'kogaku-ryoyohi', 'index.html'), 'utf8'), /name="place0" value="in"/);
});

test('マイクは押したときだけ・送るのは声で入力の 1 か所だけ・保存しない', () => {
  const js = fs.readFileSync(path.join(ROOT, 'lib', 'voice-input.js'), 'utf8').replace(/\/\/.*$/gm, '');
  const click = js.indexOf("btn.addEventListener('click'");
  assert.ok(click > 0 && js.indexOf('getUserMedia({') > click, 'getUserMedia はクリックの中');
  assert.equal((js.match(/fetch\(/g) || []).length, 1);
  assert.match(js, /fetch\(API,/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.equal(V.API, 'https://yorozu-ai.oonuki-youhei.workers.dev/v1/listen');
});
