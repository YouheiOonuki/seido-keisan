// 使い方の「原文と条文」（details.rels）の、字のまま載せた長い URL が横にあふれないこと（Q-585）
// yobosesshu・hikkoshi の guide は、全部開くと 390 幅で +52・+90 px あふれていた（URL は空白が無く折り返せない）。
// (1) style.css の details.rels ul が overflow-wrap: anywhere を持つ
// (2) URL を字にした a（30 字以上）は、どの guide.html でも details.rels の中にだけ在る（外に足すと (1) の規則が当たらない）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('details.rels ul は長い URL を折り返す', () => {
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const m = css.match(/details\.rels ul\s*\{([^}]*)\}/);
  assert.ok(m, 'details.rels ul の規則が無い');
  assert.match(m[1], /overflow-wrap:\s*anywhere/);
});

test('URL を字にした長いリンクは details.rels の中にだけ在る', () => {
  const files = fs.readdirSync(root, { recursive: true })
    .filter(f => /(^|[\\/])guide\.html$/.test(f) && !/node_modules|^\.git/.test(f));
  assert.ok(files.length >= 20, `guide.html が ${files.length} 枚`);
  const outside = [];
  let inside = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    const rels = src.match(/<details class="rels">[\s\S]*?<\/details>/g) || [];
    for (const r of rels) inside += [...r.matchAll(/<a [^>]*>https?:[^<]{30,}<\/a>/g)].length;
    const rest = src.replace(/<details class="rels">[\s\S]*?<\/details>/g, '');
    for (const m of rest.matchAll(/<a [^>]*>(https?:[^<]{30,})<\/a>/g)) outside.push(`${f}: ${m[1]}`);
  }
  assert.ok(inside > 0, 'details.rels の中の長い URL が 0（数え方が壊れている）');
  assert.deepEqual(outside, []);
});
