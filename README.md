# 制度の計算機

公開 URL: **https://yorozu-craft.com/seido-keisan/**

年末調整など、税の制度の計算を国税庁の資料どおりに。出典と確認日つき。
yorozu-craft のツールの1つです（共通ルールは [youheioonuki.github.io の README](https://github.com/YouheiOonuki/youheioonuki.github.io) を参照）。

制度の計算機は 1 つのリポジトリに複数のページで持ちます（yorozu-plans の ROADMAP 7.3.1 の決定 D36）。控除の表と計算は `lib/` に置き、住民税などのページを足すときも使い回します。

| ページ | URL |
|-------|-----|
| 制度の計算機（一覧） | https://yorozu-craft.com/seido-keisan/ |
| 年末調整の計算（令和8年分） | https://yorozu-craft.com/seido-keisan/nenmatsu/ |
| 年末調整の計算の使い方 | https://yorozu-craft.com/seido-keisan/nenmatsu/guide.html |

## 機能（年末調整の計算）

- 給与の収入・源泉徴収税額・社会保険料・生命保険料・地震保険料・配偶者・扶養親族（特定親族）・障害者などを入れると、令和8年分の年調年税額と、戻る見込み（還付）か足りない見込み（不足）かを出す
- 途中の計算（給与所得控除後の金額 → 所得控除 → 課税給与所得金額 → 算出所得税額 → 住宅ローン控除 → 年調年税額）を、使った表や規則つきで全部表示
- 同じ入力を令和7年分の制度で計算した場合との比較
- 入力はこの端末のブラウザにだけ自動保存（`seido-keisan_nenmatsu_draft`）し、外部には送信しない
- ファイルへの書き出し・読み込み（JSON。`{ tool: 'seido-keisan-nenmatsu', version: 1, exportedAt, data }`。決定 D31）。年収や家族の情報を含むため共有リンクは作らない

対象外（画面と使い方ページに明記）: 給与の収入 2,000 万円超、課税給与所得金額 1,805 万円超、所得金額調整控除、特定支出控除、非居住者、2 か所以上の給与の合算、住宅ローン控除額そのものの計算。給与のほかに所得がない前提。

## 計算の仕様・根拠

国税庁「令和8年分 年末調整のしかた」（比較は「令和7年分」）の原文 PDF を 2026-09-24 に読んで値を入れた。値と出典（PDF の URL と冊子のページ）は `lib/tax2026.js` の `SOURCES` にまとめ、画面の確認日と使い方ページの「根拠と確認日」にも出す。

- 給与所得控除後の給与等の金額: 114.pdf（47〜54 ページ）の表を `tools/extract-kyuyo-table.mjs` で取り出した `lib/kyuyo-table-2026.js`・`lib/kyuyo-table-2025.js` をそのまま引く。テストで全行を計算の規則（102.pdf 3 ページの特例を含む）と突き合わせる
- 速算表・配偶者控除等・基礎控除・扶養控除等・特定親族特別控除: 115.pdf（55〜56 ページ）
- 生命保険料控除（計算式Ⅰ〜Ⅲ、23 歳未満の扶養親族がいる場合の特例）・地震保険料控除: 107.pdf（24〜26 ページ）
- 課税給与所得金額の 1,000 円未満切り捨て、年調所得税額 × 102.1%・100 円未満切り捨て: 109.pdf（38〜39 ページ）
- 国税庁の設例（110rei.pdf 57〜59 ページ）の数字をテストで再現している（設例は所得金額調整控除を含むので、テスト用のオプションで入れて計算）

### 給与所得控除後の金額の表を取り出す（開発用）

```sh
npm install --no-save pdfjs-dist@4      # 最初に 1 回（node_modules は .gitignore 済み）
curl -A "Mozilla/5.0" -o 114.pdf https://www.nta.go.jp/publication/pamph/gensen/nencho2026/pdf/114.pdf
node tools/extract-kyuyo-table.mjs 114.pdf 2026 https://www.nta.go.jp/publication/pamph/gensen/nencho2026/pdf/114.pdf > lib/kyuyo-table-2026.js
node --test tests/*.test.js
```

国税庁のサイトはブラウザの User-Agent を付けないと断ることがある。取り出した行が「前の行の未満 = 次の行の以上」でつながっていないときは、道具が止まる。

## 保守

| 時期 | 確認すること | 直す場所 |
|------|------------|---------|
| 毎年 9 月ごろ | 国税庁の翌年分「年末調整のしかた」の公開。変わった点（102.pdf）と各表 | `lib/tax2026.js` に年を足す（または新しいファイル）、`lib/kyuyo-table-<年>.js` を取り出し直す、テストの期待値、画面の年の表記、`guide.html` の最終確認日と更新履歴 |

値や計算を直したら、`nenmatsu/guide.html` の「更新履歴」に日付と内容を 1 行足す。画面は確認日から 12 か月たつと注意を出す（`STALE_MONTHS`）。

## ファイル

| ファイル | 役割 |
|---------|------|
| `index.html` | 制度の計算機の一覧（ハブ） |
| `nenmatsu/index.html` / `nenmatsu/app.js` | 年末調整の計算の画面と、その制御（保存・書き出し・読み込み・表示） |
| `nenmatsu/guide.html` | 使い方・根拠と確認日・計算の手順・よくある質問・ご利用上の注意・更新履歴 |
| `lib/tax2026.js` | 所得税（年末調整）の値の表（令和8年分・令和7年分。値・出典・確認日） |
| `lib/kyuyo-table-2026.js` / `lib/kyuyo-table-2025.js` | 給与所得控除後の給与等の金額の表（PDF から自動生成。手で直さない） |
| `lib/nenmatsu.js` | 年末調整の計算（画面から切り離した純粋関数）と、入力の正規化・ファイル形式 |
| `style.css` | 見た目（和紙風の配色、ダークモード対応。全ページ共通） |
| `tools/extract-kyuyo-table.mjs` | 114.pdf から表を取り出す開発用の道具 |
| `404.html` | ツール配下の存在しない URL で出るページ（サイト共通のもの） |
| `favicon.svg` / `apple-touch-icon.png` / `og-image.png` | アイコン / ホーム画面用アイコン / SNS 共有用画像（1200×630）。`nenmatsu/og-image.png` は年末調整のページ用 |
| `sitemap.xml` | サイトマップ（robots.txt はドメイン直下で管理） |
| `tests/*.test.js` | テスト（`node --test tests/*.test.js`。`.github/workflows/test.yml` で push・PR のたびに自動実行） |

## ライセンス

MIT License（`LICENSE`）。表の値は国税庁「年末調整のしかた」から写したもの。
