// 「リンクだけの行」を 44px にする規則（style.css の :where(.footer-nav li, .calc-list > li, p.card, p.lang-switch, p.guide-link, .link-row) > a:only-child）の当たり方（Q-560）
// 裸の :where(p, li) は文中のリンクにも当たるので、箱を名指しし、同じ型に文中のリンクが混じる行には class link-row を付けている。
// (1) link-row の付いた行は a の外に字を持たない（文中のリンクに 44px の箱が当たらない）
// (2) 名指しの型にも link-row にも当たらない「リンクだけの p・li」は 0（新しく足した行が規則から漏れたら落ちる）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function htmlFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'tests', 'tools'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...htmlFiles(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

// 要素の木（tag・class・子）。script・style・コメントの中身は読まない
function parse(src) {
  src = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const top = { tag: '#root', cls: [], kids: [], parent: null };
  let cur = top;
  const re = /<\/?([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[3] !== undefined) { cur.kids.push(m[3]); continue; }
    const tag = m[1].toLowerCase();
    if (m[0][1] === '/') {
      let c = cur;
      while (c !== top && c.tag !== tag) c = c.parent;
      if (c !== top) cur = c.parent;
      continue;
    }
    const cm = m[2].match(/\bclass="([^"]*)"/);
    const n = { tag, cls: cm ? cm[1].split(/\s+/).filter(Boolean) : [], kids: [], parent: cur };
    cur.kids.push(n);
    if (!VOID.has(tag) && !m[2].endsWith('/')) cur = n;
  }
  return top;
}

const isEl = k => typeof k === 'object';
const outsideText = n => n.kids.filter(k => !isEl(k)).join('').trim();
function named(n) {
  if (n.tag === 'p' && n.cls.some(c => ['card', 'lang-switch', 'guide-link'].includes(c))) return true;
  if (n.tag === 'li') {
    if (n.parent.cls.includes('calc-list')) return true;
    for (let a = n.parent; a; a = a.parent) if (a.tag === 'nav' && a.cls.includes('footer-nav')) return true;
  }
  return false;
}
function rows(src) {
  const out = [];
  (function walk(n) {
    for (const k of n.kids) {
      if (!isEl(k)) continue;
      if (k.tag === 'p' || k.tag === 'li') {
        const els = k.kids.filter(isEl);
        if (els.length === 1 && els[0].tag === 'a') out.push(k);
      }
      walk(k);
    }
  })(parse(src));
  return out;
}

const files = htmlFiles(root);

test('link-row の付いた行は、a 1 つだけで、その外に字を持たない', () => {
  const bad = [];
  let n = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const all = [];
    (function walk(x) { for (const k of x.kids) if (isEl(k)) { if (k.cls.includes('link-row')) all.push(k); walk(k); } })(parse(src));
    for (const k of all) {
      n++;
      const els = k.kids.filter(isEl);
      if (els.length !== 1 || els[0].tag !== 'a' || outsideText(k)) bad.push(path.relative(root, f) + ': ' + k.tag + ' ' + outsideText(k).slice(0, 30));
    }
  }
  assert.ok(n > 0, 'link-row の行が 1 つも無い');
  assert.deepEqual(bad, []);
});

test('名指しの型にも link-row にも当たらない「リンクだけの p・li」は 0', () => {
  const left = [];
  for (const f of files) {
    for (const k of rows(fs.readFileSync(f, 'utf8'))) {
      if (outsideText(k)) continue;   // 文中のリンク（規則は当たらない）
      if (named(k) || k.cls.includes('link-row')) continue;
      left.push(path.relative(root, f) + ': <' + k.tag + (k.cls.length ? ' class="' + k.cls.join(' ') + '"' : '') + '>');
    }
  }
  assert.deepEqual(left, []);
});

test('名指しの型の行は a の外に字を持たない（同じ型に文中のリンクが入ったら、名指しを外して link-row に替える）', () => {
  const bad = [];
  for (const f of files) {
    for (const k of rows(fs.readFileSync(f, 'utf8'))) if (named(k) && outsideText(k)) bad.push(path.relative(root, f) + ': ' + outsideText(k).slice(0, 30));
  }
  assert.deepEqual(bad, []);
});

test('style.css の規則は箱を名指しし、裸の :where(p, li) > a:only-child を持たない', () => {
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  assert.ok(css.includes(':where(.footer-nav li, .calc-list > li, p.card, p.lang-switch, p.guide-link, .link-row) > a:only-child'));
  assert.ok(!/:where\(p, li\)\s*>\s*a:only-child/.test(css));
});

test('出典の一覧を描く guide.js は、a の後ろに字を足さない行にだけ link-row を付ける', () => {
  for (const f of ['dattai-ichiji/guide.js', 'en/moving-checklist/guide.js']) {
    const js = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(js, /li\.appendChild\(document\.createTextNode\([^\n]*\n\s*else li\.className = 'link-row';/, f);
  }
});
