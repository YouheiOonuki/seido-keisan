// 生成物。正本は youheioonuki.github.io の tools/common/calc/gakunen.js（tools/sync-common.mjs --calc で配る。ここは手で直さない。yorozu-plans D484）
// ===========================
// 学年（4 月 2 日〜翌年 4 月 1 日生まれが同じ学年）と、学年早見表・履歴書の学歴の計算（純粋関数）と、その法令の値（値・出典・確認日をセットで）
// yorozu-plans D484・企画書 102 の 4 章: 道具をまたいで使う計算の正本。gengo の calc.js から 2026-11-05 に移した（関数と値は 1 字も変えていない）。
// 日付は { y, m, d } の形で持つ。ほかのファイルを読まない（日付の道具 validDate・cmp は gengo の calc.js と同じ式をここにも持つ）
// ブラウザでは window.Gakunen、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function daysInMonth(y, m) { return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  function validDate(y, m, d) {
    return Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d) && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
  }
  function cmp(a, b) { return (a.y - b.y) || (a.m - b.m) || (a.d - b.d); }

  // --- 値（2026-09-24〜25 に e-Gov 法令 API で条文を取得して確認） ---
  var VALUES = {
    schoolEntry: {
      value: '満六歳に達した日の翌日以後における最初の学年の初めから',
      label: '学校教育法第17条（就学の始期）',
      source: 'e-Gov 法令検索「学校教育法」第十七条',
      url: 'https://laws.e-gov.go.jp/law/322AC0000000026',
      checked: '2026-09-24'
    },
    schoolYear: {
      value: '4月1日に始まり、翌年3月31日に終わる',
      label: '学校教育法施行規則第59条（小学校の学年）',
      source: 'e-Gov 法令検索「学校教育法施行規則」第五十九条',
      url: 'https://laws.e-gov.go.jp/law/322M40000080011',
      checked: '2026-09-24'
    },
    // 修業年限（年）。履歴書の学歴の既定の年数に使う。専門学校は法律では「1 年以上」なので、画面の既定の 2 年は法令の値ではない
    schoolLength: {
      value: { elementary: 6, junior: 3, high: 3, univ4: 4, univ6: 6, tandai: 2, kosen: 5 },
      label: '修業年限: 小学校 6 年（32 条）、中学校 3 年（47 条）、高等学校 全日制 3 年（56 条。定時制・通信制は 3 年以上）、大学 4 年（87 条 1 項。医学・歯学・薬学の臨床・獣医学は 6 年、同 2 項）、短期大学 2 年または 3 年（108 条 2 項）、高等専門学校 5 年（117 条。商船は 5 年 6 月）、専修学校 1 年以上（124 条）',
      source: 'e-Gov 法令検索「学校教育法」第三十二条・第四十七条・第五十六条・第八十七条・第百八条・第百十七条・第百二十四条',
      url: 'https://laws.e-gov.go.jp/law/322AC0000000026',
      checked: '2026-09-25'
    },
    gradSchoolLength: {
      value: { master: 2, doctorLater: 3, doctor6: 4 },
      label: '標準修業年限: 修士課程 2 年（3 条 2 項）、博士課程 5 年（4 条 2 項。前期 2 年・後期 3 年に区分できる、同 3 項）、医学・歯学・薬学（6 年制の学部が基礎）・獣医学の博士課程は 4 年（45 条）',
      source: 'e-Gov 法令検索「大学院設置基準」第三条・第四条・第四十五条',
      url: 'https://laws.e-gov.go.jp/law/349M50000080028',
      checked: '2026-09-25'
    }
  };

  // --- 学年（4 月 2 日〜翌年 4 月 1 日生まれが同じ学年） ---

  /** 早生まれ（1 月 1 日〜4 月 1 日生まれ） */
  function isHayaumare(birth) { return birth.m < 4 || (birth.m === 4 && birth.d === 1); }
  /** 小学校に入学する年（学校教育法 17 条: 満 6 歳に達した日の翌日以後の最初の 4 月 1 日） */
  function schoolEntryYear(birth) { return birth.y + (isHayaumare(birth) ? 6 : 7); }

  /**
   * 入学・卒業の年月（履歴書用）
   * @returns {Array<{key:string, event:'in'|'out', date:{y,m,d}}>}
   */
  function schoolHistory(birth) {
    var e = schoolEntryYear(birth);
    function ev(key, event, y) { return { key: key, event: event, date: event === 'in' ? { y: y, m: 4, d: 1 } : { y: y, m: 3, d: 31 } }; }
    return [
      ev('elementary', 'in', e), ev('elementary', 'out', e + 6),
      ev('junior', 'in', e + 6), ev('junior', 'out', e + 9),
      ev('high', 'in', e + 9), ev('high', 'out', e + 12),
      ev('college2', 'in', e + 12), ev('college2', 'out', e + 14),
      ev('university', 'in', e + 12), ev('university', 'out', e + 16)
    ];
  }

  /**
   * ref の日の学年（目安。浪人・留年・飛び級は考えない）
   * @returns {{stage:string, grade:number}} stage: 'preschool'|'elementary'|'junior'|'high'|'university'|'graduated'|'notborn'
   */
  function gradeAt(birth, ref) {
    if (cmp(ref, birth) < 0) return { stage: 'notborn', grade: 0 };
    var fy = ref.m >= 4 ? ref.y : ref.y - 1;          // 学年の年度（4 月 1 日始まり）
    var n = fy - schoolEntryYear(birth) + 1;          // 小 1 が 1
    if (n <= 0) return { stage: 'preschool', grade: n };   // 0: 年長、-1: 年中、-2: 年少（3 年保育）
    if (n <= 6) return { stage: 'elementary', grade: n };
    if (n <= 9) return { stage: 'junior', grade: n - 6 };
    if (n <= 12) return { stage: 'high', grade: n - 9 };
    if (n <= 16) return { stage: 'university', grade: n - 12 };
    return { stage: 'graduated', grade: 0 };
  }

  // --- 学年早見表・履歴書の学歴 ---

  /** その日の学年の年度（4 月 1 日始まり。学校教育法施行規則 59 条） */
  function fiscalYearOf(date) { return date.m >= 4 ? date.y : date.y - 1; }
  /** fy 年度の通し番号の学年（小 1 が 1、年長 0、年少 -2、大学 1 年 13、修士 1 年 17、博士 3 年 21） */
  function gradeNumber(birth, fy) { return fy - schoolEntryYear(birth) + 1; }

  // 学年早見表の行（画面の名前のキーと通し番号）。大学院は大学 4 年・修士 2 年・博士後期 3 年とストレートに進んだ場合
  var GRADE_ROWS = [
    ['k3', -2], ['k4', -1], ['k5', 0],
    ['e1', 1], ['e2', 2], ['e3', 3], ['e4', 4], ['e5', 5], ['e6', 6],
    ['j1', 7], ['j2', 8], ['j3', 9], ['h1', 10], ['h2', 11], ['h3', 12],
    ['u1', 13], ['u2', 14], ['u3', 15], ['u4', 16],
    ['m1', 17], ['m2', 18], ['d1', 19], ['d2', 20], ['d3', 21]
  ];

  /**
   * fy 年度の学年早見表。通し番号 n の学年は (fy − n − 6) 年 4 月 2 日 〜 (fy − n − 5) 年 4 月 1 日生まれ
   * age は年度の初め（4 月 1 日）の満年齢。年度中に誕生日を迎えて age + 1 になる
   * @returns {Array<{key:string, n:number, from:{y,m,d}, to:{y,m,d}, age:number}>}
   */
  function gradeTable(fy) {
    return GRADE_ROWS.map(function (r) {
      var n = r[1], entry = fy - n + 1;   // 小学校に入学した（する）年
      return { key: r[0], n: n, from: { y: entry - 7, m: 4, d: 2 }, to: { y: entry - 6, m: 4, d: 1 }, age: n + 5 };
    });
  }

  /**
   * 履歴書の学歴（最終学歴まで。入学は 4 月、卒業・修了は 3 月）
   * @param {{y,m,d}} birth
   * @param {object} [opt]
   *   final: 'high' | 'senmon' | 'tandai' | 'kosen' | 'univ4' | 'univ6' | 'master' | 'doctor'（修士 2 年＋博士後期 3 年）| 'doctor6'（6 年制＋博士 4 年）
   *   years: { 学校のキー: 在学年数 }（留年・休学・定時制など。既定は修業年限、専門学校は 2 年）
   *   ronin: 高校を出てから次の学校に入るまでの年数（浪人）
   * @returns {Array<{key:string, event:'in'|'out', date:{y,m,d}}>|null}
   */
  function resumeHistory(birth, opt) {
    opt = opt || {};
    var L = VALUES.schoolLength.value, G = VALUES.gradSchoolLength.value;
    var PATH = {
      high: ['elementary', 'junior', 'high'],
      senmon: ['elementary', 'junior', 'high', 'senmon'],
      tandai: ['elementary', 'junior', 'high', 'tandai'],
      kosen: ['elementary', 'junior', 'kosen'],
      univ4: ['elementary', 'junior', 'high', 'univ4'],
      univ6: ['elementary', 'junior', 'high', 'univ6'],
      master: ['elementary', 'junior', 'high', 'univ4', 'master'],
      doctor: ['elementary', 'junior', 'high', 'univ4', 'master', 'doctorLater'],
      doctor6: ['elementary', 'junior', 'high', 'univ6', 'doctor6']
    };
    var path = PATH[opt.final || 'univ4'];
    if (!path || !birth || !validDate(birth.y, birth.m, birth.d)) return null;
    var STD = { senmon: 2, master: G.master, doctorLater: G.doctorLater, doctor6: G.doctor6 };
    var years = opt.years || {};
    var ronin = Math.max(0, Math.min(10, Math.floor(Number(opt.ronin) || 0)));
    var y = schoolEntryYear(birth), out = [];
    path.forEach(function (key, i) {
      if (path[i - 1] === 'high') y += ronin;
      var n = Math.floor(Number(years[key]));
      if (!(n >= 1 && n <= 12)) n = L[key] !== undefined ? L[key] : STD[key];
      out.push({ key: key, event: 'in', date: { y: y, m: 4, d: 1 } });
      y += n;
      out.push({ key: key, event: 'out', date: { y: y, m: 3, d: 31 } });
    });
    return out;
  }

  var api = {
    VALUES: VALUES, isHayaumare: isHayaumare, schoolEntryYear: schoolEntryYear, schoolHistory: schoolHistory, gradeAt: gradeAt,
    fiscalYearOf: fiscalYearOf, gradeNumber: gradeNumber, gradeTable: gradeTable, resumeHistory: resumeHistory
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Gakunen = api;
})(this);
