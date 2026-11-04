// ===========================
// 引越しの手続きの一覧（/seido-keisan/hikkoshi/。K233）— 画面から切り離した純粋関数
// 引越しの種類と当てはまるものから手続きを順に並べ、引越しの日を入れたら期限の日付を出す。
// 期限の数え方: 「〜した日から 14 日以内」は初日を数えない（民法 140 条）ので、引越しの日 ＋ 14 日（英語版と同じ addDays）。
// 休日でも日付は延ばさない（延びるかは窓口ごとに違う。使い方ページに 1 文）。
// やった印と入力は家庭の書類の箱（lib/box.js）の区画 hikkoshi に、引越しの日の年で入れる。
// ブラウザでは window.Hikkoshi、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var V = isNode ? require('./hikkoshi-values.js') : root.HikkoshiValues;
  var M = isNode ? require('./moving-checklist.js') : root.MovingChecklist;
  var B = isNode ? require('./box.js') : root.Box;

  var SECTION = 'hikkoshi';
  var KIND_IDS = V.KINDS.map(function (k) { return k.id; });
  var HAS_IDS = V.HAS.map(function (h) { return h.id; });
  var ITEM_IDS = V.ITEMS.map(function (it) { return it.id; });
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];

  function isoOk(s) { return M.addDays(s, 0) === s && s !== ''; }
  // 「11月19日（木）」
  function ja(s) {
    var p = s.split('-');
    var w = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
    return (+p[1]) + '月' + (+p[2]) + '日（' + WEEK[w] + '）';
  }
  function fill(t) { return t.replace(/\{(\w+)\}/g, function (m, k) { return V.DAYS[k] === undefined ? m : String(V.DAYS[k]); }); }

  // 入力の形をそろえる（箱にもこの形で入れる）。知らない値・壊れた値は既定に戻す
  function normalize(raw) {
    var r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    var has = {};
    var h = r.has && typeof r.has === 'object' ? r.has : {};
    HAS_IDS.forEach(function (id) { has[id] = h[id] === undefined ? true : !!h[id]; });   // 既定は全部入り
    var done = Array.isArray(r.done) ? r.done : [];
    return {
      moveDate: typeof r.moveDate === 'string' && isoOk(r.moveDate) ? r.moveDate : '',
      kind: KIND_IDS.indexOf(r.kind) >= 0 ? r.kind : 'other',
      has: has,
      done: ITEM_IDS.filter(function (id) { return done.indexOf(id) >= 0; }),   // 並びは一覧の順、重複と知らない id は落とす
    };
  }

  // 戻り値 { input, groups: [{ when, items: [{ id, name, text, where, basis, due, deadlineText, done, overdue }] }], count, left, next }
  // today（YYYY-MM-DD）は「過ぎています」と次の期限に使う
  function build(raw, today) {
    var d = normalize(raw);
    var items = V.ITEMS.filter(function (it) {
      return (!it.kind || it.kind === d.kind) && (!it.need || d.has[it.need]);
    }).map(function (it) {
      var o = { id: it.id, when: it.when, name: it.name, text: fill(it.text), where: it.where, basis: it.basis, due: '', deadlineText: '', done: d.done.indexOf(it.id) >= 0, overdue: false };
      if (it.deadline && typeof it.deadline === 'object') {
        var n = V.DAYS[it.deadline.days];
        o.due = d.moveDate ? M.addDays(d.moveDate, n) : '';
        o.deadlineText = o.due ? ja(o.due) + 'まで' : '引越しから' + n + '日以内';
        o.overdue = !!(o.due && today && today > o.due && !o.done);
      } else {
        o.deadlineText = V.DEADLINE_LABEL[it.deadline];
        if (it.deadline === 'before' && d.moveDate) o.deadlineText = ja(d.moveDate) + 'より前に（あらかじめ）';
      }
      return o;
    });
    var groups = ['before', 'after'].map(function (w) { return { when: w, items: items.filter(function (o) { return o.when === w; }) }; })
      .filter(function (g) { return g.items.length; });
    var left = items.filter(function (o) { return !o.done; });
    // 次の期限: 済んでいない、日付のある項目のうち、今日以後で一番早いもの
    var next = null;
    left.forEach(function (o) {
      if (o.due && (!today || o.due >= today) && (!next || o.due < next.due)) next = o;
    });
    return { input: d, groups: groups, count: items.length, left: left.length, next: next };
  }

  // --- 箱（lib/box.js）への出し入れ ---
  // 開いたとき: 区画 hikkoshi がある一番新しい年の中身（無ければ空の入力と、今年）
  function fromBox(box, today) {
    var years = Object.keys((box && box.years) || {}).filter(function (y) { return box.years[y] && box.years[y][SECTION]; }).sort();
    var y = years.length ? years[years.length - 1] : String(today || '').slice(0, 4);
    return { year: y, state: normalize(years.length ? box.years[y][SECTION] : {}) };
  }
  // 保存するとき: 引越しの日の年（無ければ prevYear か今年）に入れ、年が変わったら前の年の区画を外す。新しい箱を返す
  function toBox(box, state, prevYear, today) {
    var s = normalize(state);
    var y = s.moveDate ? s.moveDate.slice(0, 4) : (prevYear || String(today || '').slice(0, 4));
    var b = B.setSection(box, y, SECTION, s);
    if (prevYear && prevYear !== y && b.years[prevYear]) {
      delete b.years[prevYear][SECTION];
      if (!Object.keys(b.years[prevYear]).length) delete b.years[prevYear];
    }
    return { box: b, year: y };
  }

  var api = { SECTION: SECTION, ITEM_IDS: ITEM_IDS, normalize: normalize, build: build, fill: fill, ja: ja, fromBox: fromBox, toBox: toBox };
  if (isNode) module.exports = api;
  else root.Hikkoshi = api;
})(this);
