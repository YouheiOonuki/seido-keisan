// ===========================
// この場所の 1 枚（K246。yorozu-plans ROADMAP 続き 40 の答え・D600・D601・D613・D117、QUEUE Q-768）の芯 — 画面から切り離した純粋関数
// (a) 緯度経度とズームから、タイルの番号（z/x/y）とタイルの中の画素の位置（Web メルカトル、1 枚 256 px）
// (b) 画素の色（RGBA）と、色 → 区分の表（引数で受ける）から区分を引く。透明は「色なし」、表に無い色は「読めない」。近い色に寄せない
// (c) 2 点の間を等間隔に割った点の並びと、点ごとの始点からの距離（m）。標高の並びから、いちばん高い点・低い点・上りと下りの合計
// (d) 2 か所の結果を、同じ項目の順に横に並べる形
// 「安全」「危険」・点数・順位は出さない（D117）。どの口にも要求を出さない（条件 62）。公式の凡例の色は Q-767・Q-789 の後に、呼ぶ側が表で渡す。
// ブラウザでは window.Basho、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var TILE = 256;
  // Web メルカトルで表せる緯度の端（atan(sinh(π)) の度）。これより極に近い点は端に寄せる
  var MAX_LAT = 85.0511287798066;
  // 距離に使う地球の半径（m）。平均半径（IUGG の R1）で、球として測る
  var EARTH_R = 6371008.8;

  function num(v) { return typeof v === 'number' && isFinite(v); }
  function intIn(v, lo, hi) { return num(v) && Math.floor(v) === v && v >= lo && v <= hi; }

  // ---------- (a) 位置 → タイルと画素 ----------
  // 返す: { z, x, y, px, py }。px・py はタイルの左上を 0 にした画素（0〜255）。
  // タイルの境目ちょうどの点は、右・下のタイルの 0 番の画素に入る。経度 180 は −180 と同じ（x = 0）
  function tileOf(lat, lng, z) {
    if (!num(lat) || lat < -90 || lat > 90) throw new RangeError('緯度は −90〜90 の数: ' + lat);
    if (!num(lng) || lng < -180 || lng > 180) throw new RangeError('経度は −180〜180 の数: ' + lng);
    if (!intIn(z, 0, 24)) throw new RangeError('ズームは 0〜24 の整数: ' + z);
    var n = Math.pow(2, z);
    var la = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
    var r = la * Math.PI / 180;
    var xf = (lng + 180) / 360 * n;
    var yf = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
    var gx = Math.floor(xf * TILE);
    var gy = Math.floor(yf * TILE);
    var w = n * TILE;
    gx = ((gx % w) + w) % w;            // 経度 180 → 0 に回す
    gy = Math.max(0, Math.min(w - 1, gy)); // 端に寄せた緯度の丸め誤差で外へ出さない
    return { z: z, x: Math.floor(gx / TILE), y: Math.floor(gy / TILE), px: gx % TILE, py: gy % TILE };
  }

  // ---------- (b) 色 → 区分 ----------
  // table: [{ rgb: [r, g, b], label: '…' }, …]。同じ色に別の区分が 2 つ在る表は受けない
  function colorKey(r, g, b) { return r + ',' + g + ',' + b; }
  function byte(v) { return intIn(v, 0, 255); }

  function makeTable(table) {
    if (!Array.isArray(table)) throw new TypeError('色の表は配列');
    var map = Object.create(null);
    table.forEach(function (row, i) {
      var c = row && row.rgb;
      if (!Array.isArray(c) || c.length !== 3 || !c.every(byte)) throw new TypeError('色の表の ' + i + ' 行目の rgb が 0〜255 の整数 3 つでない');
      if (typeof row.label !== 'string' || row.label === '') throw new TypeError('色の表の ' + i + ' 行目に区分の名前が無い');
      var k = colorKey(c[0], c[1], c[2]);
      if (k in map && map[k] !== row.label) throw new Error('色の表で ' + k + ' に区分が 2 つ: ' + map[k] + ' / ' + row.label);
      map[k] = row.label;
    });
    return map;
  }

  // rgba: [r, g, b, a]（a は 0〜255。Canvas の getImageData の並び）
  // 返す: { status: 'none' } 透明（色なし）／ { status: 'unreadable' } 表に無い色／ { status: 'hit', label }
  // 半透明の画素も RGB がそのまま表に在る時だけ引く（混ざった色を近い色へ寄せない）
  function classify(rgba, table) {
    if (!Array.isArray(rgba) || rgba.length !== 4 || !rgba.every(byte)) throw new TypeError('画素の色は 0〜255 の整数 4 つ（RGBA）');
    var map = makeTable(table);
    if (rgba[3] === 0) return { status: 'none' };
    var k = colorKey(rgba[0], rgba[1], rgba[2]);
    return k in map ? { status: 'hit', label: map[k] } : { status: 'unreadable' };
  }

  // ---------- (c) 断面 ----------
  function rad(d) { return d * Math.PI / 180; }
  // 2 点の間の大円の距離（m。ハバーサイン）
  function distance(a, b) {
    var dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function point(p, name) {
    if (!p || !num(p.lat) || !num(p.lng) || p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) throw new RangeError(name + 'は { lat, lng }（緯度 −90〜90・経度 −180〜180）');
  }

  // a から b までを parts 等分した parts + 1 点。各点に始点からの距離 d（m）を付ける。
  // 割るのは緯度経度の直線（近い 2 点の断面を引くためのもので、地球を回る長さは扱わない）。経度 180 をまたぐ組は受けない
  function profilePoints(a, b, parts) {
    point(a, '始点'); point(b, '終点');
    if (!intIn(parts, 1, 10000)) throw new RangeError('割る数は 1〜10000 の整数: ' + parts);
    if (Math.abs(b.lng - a.lng) > 180) throw new RangeError('経度 180 をまたぐ 2 点は割らない');
    var out = [];
    for (var i = 0; i <= parts; i++) {
      var t = i / parts;
      var p = i === parts ? { lat: b.lat, lng: b.lng } : { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
      p.d = distance(a, p);
      out.push(p);
    }
    return out;
  }

  // elev: 標高（m）の並び。欠け（標高タイルに値が無い点）は null。
  // 返す: { highest: { index, value } | null, lowest: 同, ascent, descent, missing: [欠けの番号] }
  // 上り・下りは、隣り合う 2 点がどちらも在る区間だけを足す（欠けをまたいで推し量らない）。同じ高さが 2 点在れば先の点
  function elevationSummary(elev) {
    if (!Array.isArray(elev)) throw new TypeError('標高は配列');
    var hi = null, lo = null, up = 0, down = 0, missing = [];
    elev.forEach(function (v, i) {
      if (v === null) { missing.push(i); return; }
      if (!num(v)) throw new TypeError('標高の ' + i + ' 番目が数でも null でもない');
      if (!hi || v > hi.value) hi = { index: i, value: v };
      if (!lo || v < lo.value) lo = { index: i, value: v };
      var prev = i > 0 ? elev[i - 1] : null;
      if (prev !== null && i > 0) {
        if (v > prev) up += v - prev; else down += prev - v;
      }
    });
    return { highest: hi, lowest: lo, ascent: round1(up), descent: round1(down), missing: missing };
  }
  // 足し算の 2 進の端数（0.1 + 0.2 など）を 0.1 m で丸める。標高タイルの値は 0.01 m 刻みで、断面に出すのは 0.1 m まで
  function round1(v) { return Math.round(v * 10) / 10; }

  // ---------- (d) 2 か所を横に並べる ----------
  // items: [{ key, label }, …] の順に、各か所の結果 results[i][key] を並べる。無い値は null
  // 返す: [{ key, label, values: [1 か所目, 2 か所目, …] }, …]。並べるだけで、比べた印・差の評価は付けない
  function sideBySide(items, results) {
    if (!Array.isArray(items) || !Array.isArray(results)) throw new TypeError('項目と結果は配列');
    var seen = Object.create(null);
    return items.map(function (it) {
      if (!it || typeof it.key !== 'string' || it.key === '') throw new TypeError('項目に key が無い');
      if (it.key in seen) throw new Error('項目の key が 2 つ: ' + it.key);
      seen[it.key] = true;
      return {
        key: it.key,
        label: it.label,
        values: results.map(function (r) { return r && Object.prototype.hasOwnProperty.call(r, it.key) ? r[it.key] : null; })
      };
    });
  }

  var api = {
    TILE: TILE, MAX_LAT: MAX_LAT, EARTH_R: EARTH_R,
    tileOf: tileOf, classify: classify, distance: distance,
    profilePoints: profilePoints, elevationSummary: elevationSummary, sideBySide: sideBySide
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Basho = api;
})(this);
