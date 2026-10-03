// ===========================
// 引越し・在留の手続きリスト（英語ページ。K69）— 画面から切り離した純粋関数
// 選んだ場面とカードの有無から、項目を「前・後・出国のとき・在留期間」の順に並べ、日付を入れたら期限を出す。
// 項目・日数・出典は lib/moving-checklist-values.js にだけ置く。
// 期限の数え方: 「〜した日から 14 日以内」は初日を数えない（民法 140 条）ので、引越しの日 ＋ 14 日。
// ブラウザでは window.MovingChecklist、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var V = isNode ? require('./moving-checklist-values.js') : root.MovingChecklistValues;

  var TOOL_ID = 'seido-keisan-moving-checklist';
  var FILE_VERSION = 1;
  var SIT_IDS = V.SITUATIONS.map(function (s) { return s.id; });
  var WHEN_ORDER = ['before', 'depart', 'after', 'renew'];
  var DAY = 86400000;

  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]), d = new Date(t);
    if (d.getUTCMonth() !== +m[2] - 1 || +m[1] < 2000 || +m[1] > 2100) return null;
    return t;
  }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function addDays(s, n) { var t = parseDate(s); return t === null ? '' : iso(t + n * DAY); }
  // k か月前の同じ日（その日が無い月は月末）
  function monthsBefore(s, k) {
    var t = parseDate(s); if (t === null) return '';
    var d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth() - k, day = d.getUTCDate();
    var first = new Date(Date.UTC(y, m, 1));
    var last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return iso(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last)));
  }

  // 文の中の {notice} などを DAYS の値に置き換える（日数を文に写さない）
  function fill(t) { return t.replace(/\{(\w+)\}/g, function (m, k) { return V.DAYS[k] === undefined ? m : String(V.DAYS[k]); }); }

  function normalizeInput(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var sits = Array.isArray(r.situations) ? r.situations.filter(function (s, i, a) { return SIT_IDS.indexOf(s) >= 0 && a.indexOf(s) === i; }) : [];
    var md = parseDate(r.moveDate), ed = parseDate(r.expiryDate);
    return {
      situations: SIT_IDS.filter(function (s) { return sits.indexOf(s) >= 0; }),
      hasCard: r.hasCard === undefined ? true : !!r.hasCard,
      moveDate: md === null ? '' : iso(md),
      expiryDate: ed === null ? '' : iso(ed),
      longStay: r.longStay === undefined ? true : !!r.longStay,   // 在留期間が 6 か月以上
      name: typeof r.name === 'string' ? r.name.slice(0, 40) : '',
    };
  }

  // 戻り値 { input, groups: [{ when, items: [{ id, text, where, basis, link, due, dueKind }] }], count }
  function build(raw) {
    var d = normalizeInput(raw);
    var items = V.ITEMS.filter(function (it) { return d.situations.indexOf(it.sit) >= 0 && (!it.needCard || d.hasCard); });
    var out = items.map(function (it) {
      var o = { id: it.id, sit: it.sit, when: it.when, text: fill(it.text), where: it.where, basis: it.basis, link: it.link || null, due: '', dueKind: '' };
      if (it.due && it.due.from === 'move' && d.moveDate) { o.due = addDays(d.moveDate, V.DAYS[it.due.days]); o.dueKind = 'by'; }
      if (it.due && it.due.from === 'expiry' && d.expiryDate) {
        o.from = d.longStay ? monthsBefore(d.expiryDate, V.DAYS[it.due.months]) : '';
        o.due = d.expiryDate; o.dueKind = 'by';
      }
      return o;
    });
    var groups = WHEN_ORDER.map(function (w) { return { when: w, items: out.filter(function (o) { return o.when === w; }) }; })
      .filter(function (g) { return g.items.length; });
    return { input: d, groups: groups, count: out.length };
  }

  function toExportFile(data, now) {
    return { tool: TOOL_ID, version: FILE_VERSION, exportedAt: (now || new Date()).toISOString(), data: normalizeInput(data) };
  }
  function fromExportFile(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, code: 'notJson' };
    if (obj.tool !== TOOL_ID) return { ok: false, code: 'otherTool' };
    if (typeof obj.version !== 'number' || obj.version > FILE_VERSION) return { ok: false, code: 'newer' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, code: 'empty' };
    return { ok: true, data: normalizeInput(obj.data) };
  }

  var api = {
    TOOL_ID: TOOL_ID, FILE_VERSION: FILE_VERSION, addDays: addDays, monthsBefore: monthsBefore,
    normalizeInput: normalizeInput, build: build, fill: fill, toExportFile: toExportFile, fromExportFile: fromExportFile,
  };
  if (isNode) module.exports = api;
  else root.MovingChecklist = api;
})(this);
