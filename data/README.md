# 制度の改定カレンダーのデータ（CC0）

[制度の改定カレンダー](https://yorozu-craft.com/seido-keisan/kaitei/)と同じ中身を、ほかの道具やカレンダーで使える形で置いています。

| ファイル | URL | 中身 |
|---------|-----|------|
| `kaitei.json` | https://yorozu-craft.com/seido-keisan/data/kaitei.json | 施行日の決まった行（`items`）、毎年変わるもの（`yearly`）、施行日が決まっていないもの（`pending`）、出典の一覧（`sources`） |
| `kaitei.ics` | https://yorozu-craft.com/seido-keisan/data/kaitei.ics | `items` と同じ行の iCalendar（RFC 5545、終日の予定。説明欄に出典の URL。カレンダーの説明 `X-WR-CALDESC` に CC0・確認日・出典の URL の一覧。購読用に `REFRESH-INTERVAL`・`X-PUBLISHED-TTL` は 1 週間。登録のしかたは https://yorozu-craft.com/calendar-help.html） |

## ライセンス

このフォルダのデータ（`kaitei.json`・`kaitei.ics`）は **CC0 1.0**（パブリック・ドメイン提供）です。全文は `LICENSE`。表示の義務はありませんが、使うときに次のように書いてもらえると、どこで使われているかが分かって助かります。

```
出典: 制度の改定カレンダー（yorozu-craft） https://yorozu-craft.com/seido-keisan/kaitei/
```

このリポジトリのコード（`lib/`・`tools/` など）は MIT License（リポジトリ直下の `LICENSE`）のままです。

## 項目（kaitei.json）

| 項目 | 意味 |
|------|------|
| `checked` | 出典の原文を最後に確かめた日（YYYY-MM-DD） |
| `items[].date` | 施行日（期限の行は期限の日） |
| `items[].category` / `category_label` | 分類（`zei` 税、`shaho` 社保・年金、`kosodate` 子育て・教育、`other` その他） |
| `items[].title` / `what` / `who` | 何が変わるか、対象 |
| `items[].url` | カレンダーのページのその行 |
| `items[].tools` | その改定を扱っているこのサイトの計算機（`note` はその計算機での扱い） |
| `items[].sources` | 出典（`label`・`url`・`checked`）。日付はこの原文で確かめた |
| `pending[].status` | 「法案（未成立）」「施行日は政令で決まる」など。施行日が決まるまで `items` と `.ics` に入れない |

## 注意

- 日付と内容は `checked` の日に出典の原文で確かめたものです。その後の改正・政令で変わることがあります。制度の判断には原文を確かめてください。
- 行の `id` は変えません（`.ics` の `UID` は `kaitei-<id>@yorozu-craft.com`）。

## 作り方（保守）

`data/` のファイルは手で直しません。値は `lib/kaitei-values.js` にだけ書き、次で書き出します。テスト（`tests/data.test.js`）が、書き出した結果とファイルが同じかを確かめます。

```
node tools/build-kaitei.mjs   # kaitei/index.html の一覧
node tools/build-data.mjs     # data/kaitei.json と data/kaitei.ics
```
