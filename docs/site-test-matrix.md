# サイト全体の操作テスト

[2026-10-18の実行結果・検出した問題](site-test-results-2026-10-18.md)

対象は `dev` の Vite ビルドで生成する16ページと、旧ドメイン用の移転案内1ページ。`npm run test:site` で翻訳同期チェック、検索データ検査、操作一覧、既存の Node テスト、実ブラウザ E2E を順に実行する。途中の検査が失敗しても独立した後続検査を続け、いずれかが失敗すると終了コード1を返す。

```sh
npm ci
npm run test:e2e:install
npm run test:site
```

通常は Chromium の PC（1440×900）とタッチ端末（390×844）で全操作を実行。画面幅の検査は320、375、390、720、721、768、820、821、1024、1239、1240、1440、1920px。追加の Safari/WebKit は `npx playwright install webkit` の後に `E2E_CROSS_BROWSER=1 npm run test:site` で実行する。

```sh
# 一部だけ再現するとき
npm run test:e2e -- --project=mobile --grep FOOD
npm run test:e2e -- --project=desktop --grep 'SEARCH all entries'
npm run test:e2e -- --headed --grep TIMETABLE
# ページ内の全静的ボタン・入力・リンクと、動的な検索/店舗/時刻表の対象一覧
npm run --silent test:inventory -- --json > /tmp/oicmap-actions.json
```

`E2E_PORT`（既定4173）、`E2E_WORKERS`（既定2）、`E2E_OUTPUT_DIR` を変更できる。サーバーを再利用せず、毎回ビルドして専用のローカル preview サーバーを起動する。実行中の開発サーバーや本番には依存しない。結果は OS の一時ディレクトリ内 `oicmap-e2e/results.json`、失敗のスクリーンショット・トレースは `oicmap-e2e/results/`。`npx playwright show-trace <trace.zip>` で操作を再生できる。同じ出力先の次回実行で結果を置き換えるので保存する場合は出力先を分ける。

## ページごとの操作と対応テスト

`SEARCH`、`MAP` などはテスト名の先頭で、`--grep` にそのまま指定できる。元データから検索1,029件・別名417件・施設リング514件・食事場所11件・時刻表8カードを読み込む（この件数は作成時点）。追加されたデータも自動で対象になる。検索は40件ずつの独立テストに分け、各件の名前とIDをステップに記録する。1件の失敗後も別バッチは実行される。同一バッチで失敗より後の項目は未実行として扱い、全件成功とは報告しない。

| ページ | 操作・確認する結果 | テスト |
|---|---|---|
| `/`, `/en/` | 日英の全教室・施設名を入力→該当IDの候補を選択→ラベル、階、URL、座標または領域を確認→クリアしてURLと強調表示が消える | `search.spec.js` / `SEARCH all entries` |
| 同上 | 全別名による該当候補表示（「教員研究室」など一致が18件を超える共通別名は上限18件と候補の正当性を確認）、全半角・大小文字・空白の正規化、部分検索、矢印上下、Enter、Escape、IME変換中Enter、該当なし、記号のみ、クリアとフォーカス | `SEARCH aliases`, `SEARCH keyboard` |
| 同上 | 検索URLを再読み込みして復元、ハッシュ直接指定、日英切替後の検索位置維持 | `SEARCH keyboard`, `MAP deep links` |
| 同上 | PCの全階タブ、モバイルの階リストで1〜5F・A棟6〜9F・H棟6〜9F、選択表示と地図画像 | `MAP every floor` |
| 同上 | トイレ・給水・自販機・階段/エスカレーター・エレベーター・AEDを各階でON/OFF、元データに一致するリング数、トイレ凡例 | `MAP every floor` |
| 同上 | ATMで1F、授乳で2Fへ移動して解除で元の階へ戻る、プリンター図の表示と通常階への復帰、施設の排他的選択 | `MAP every floor` |
| 同上 | その他施設メニューの開閉、外側クリック、Escape、ArrowDown、モバイル階リストの閉じ方 | `MAP menus` |
| 同上 | ホイール拡大縮小、マウスドラッグ、実タッチイベントによるピンチとパン、実際の変換行列更新 | `MAP wheel`, `MAP mobile touch` |
| 同上 | 食事一覧を開く、11店舗すべてを選択、選択領域とカードの一致、閉じる、一覧へ戻る | `food.spec.js` / `FOOD every store` |
| 同上 | モバイルの概要→詳細→概要、画面内に収まるカード、縦横切替、ハンドルを上下にドラッグして展開・縮小・閉じる | `FOOD every store`, `FOOD mobile sheet` |
| 同上 | 各店舗の領域クリック、PCホバー、各ピンのクリック/キーボード選択、Escapeで閉じる、ATMなど施設カード、日英の全カード内外部リンク | `FOOD every pin`, `FOOD every external` |
| 同上 | CaféがCafeteriaと共有する領域や、別店舗を指す部分領域を元データに従い判別 | `FOOD every pin` |
| `/food/`, `/en/food/` | 全店舗カード、営業時間/利用案内、各「地図で見る」から正しい店舗へ移動、再読み込み復元、公式/メニュー/営業時間リンク | `FOOD every store`, `FOOD every external` |
| 同上 | キッチンカー出店あり・出店なし・期間外・通信失敗、営業時間通信失敗、画像フォールバック、店舗データ再読み込み | `recovery.spec.js` / `RECOVERY food`, `RECOVERY coop` |
| `/timetable/` | 全8カードの次便・残り時間・全便の開閉、非表示確認のキャンセル/確定、再読み込み保持、個別再表示 | `timetable.spec.js` / `TIMETABLE every train` |
| 同上 | 全カードを隠す→空状態→すべて表示、ドラッグ並べ替え→再読み込み保持→初期順へ戻す | `TIMETABLE hide all` |
| 同上 | 平日・週末・祝日・日付境界の予定選択、運行情報、シャトルバス次便と公式/予約/PDFリンク | `TIMETABLE weekday`, `TIMETABLE English`, `RECOVERY rail` |
| `/en/timetable/` | 英語版は公式リンク案内。全駅・方面・曜日別リンク、運行情報、シャトルバス、参考資料を開く | `TIMETABLE English` |
| `/access/`, `/en/access/` | アクセス地図が画像として読み込める、国内/国際表記の電話リンク、各交通機関のルート表示、ナビゲーション | `pages.spec.js` / `PAGES` |
| `/terms/`, `/privacy/` と英語版 | 本文、ページ内アンカー、本文スキップ、規約/プライバシーのリンク、日英切替 | `PAGES`, `LINKS` |
| `/sources/`, `/en/sources/` | 食事/時刻表データから出典一覧を生成、公式出典リンク、読込失敗表示 | `PAGES`, `LINKS`, `RECOVERY sources` |
| `/legacy-moved.html` | 移転案内、クエリ/選択ハッシュを保持した新ドメインへのリンクをクリック | `PAGES legacy migration` |
| 全公開ページ | PCナビ/モバイルメニュー、全メニュー・フッター内リンク、日英切替と再読み込み、説明/問い合わせダイアログ、閉じるボタン/Escape/背景クリック、問い合わせiframeのURL | `PAGES` |
| 全公開ページ | 画面幅・ブレークポイント両側で横はみ出し、ヘッダー操作の画面内配置、階選択、モバイルメニュー、スクリーンショット | `RESPONSIVE` |
| `/editor/login/` | 未認証リダイレクトと戻り先、空欄必須、誤パスワード、送信ボタン再有効化、閲覧へ戻る、日英切替、任意の実パスワードログイン | `editor.spec.js` / `EDITOR login`, `EDITOR real password` |
| `/editor/` | 隔離した認証状態と小さな試験データで名前/位置の登録、位置クリア、保存・再読込、移動・削除、JSONコピー/ダウンロード/ファイル選択/不正JSON、ローカル確定、ログアウト | `EDITOR add`, `EDITOR login guard` |
| 同上 | 全リング種別・3色の追加/選択/削除、領域対象選択、新規頂点・最低点数・Undo・保存・編集・頂点移動・キャンセル・削除 | `EDITOR every ring` |
| 同上 | 共通の階・施設・検索、言語切替後の編集画面・下書き維持、隠れたクイックリンクの扱い | `EDITOR controls`, `EDITOR authenticated language` |
| 地図/PWA | manifestと全アイコン、Service Workerの有効化、キャッシュ済み地図/検索をオフラインで再表示 | `pwa.spec.js` / `PWA` |
| 障害時 | 検索JSON、施設リングJSON、SVG、店舗JSONの取得失敗→表示された再試行ボタンで復旧 | `RECOVERY search`, `RECOVERY facility`, `RECOVERY map`, `RECOVERY food data` |
| 全ページ/全操作 | 未捕捉JavaScript例外、console.error、意図しないローカルHTTP 4xx/5xx、白画面、Viteエラー表示を失敗にする | `helpers.js` 自動fixture |

## 網羅性の維持

`scripts/site-action-inventory.mjs` は全ビルドエントリの静的な button/input/select/textarea/summary とリンクを抽出し、各操作に対応するテストを付記する。未分類のコントロールが追加されると失敗する。動的な店舗・検索候補・時刻表はそれぞれのデータを巡回する。`INVENTORY` テストは、ビルド対象ページとテスト対象ページの一致も検査する。

この一覧は「クリックできた」というだけの合格判定ではない。機能テストは選択状態、領域、件数、URL、保存データ、表示の開閉など期待する結果を検証する。隠されたDOMを強制クリックして合格にすることはしない。

## 外部サービスと実機の境界

- 外部API（運行情報、祝日、生協、キッチンカー）は形を合わせた固定応答を返す。日時は2026-10-19の日本時間12時を基準に固定し、日付依存テストでは明示的に変更する。外部サービス自身の稼働や最新内容は保証しない。
- 外部リンクは実際にクリックし、別タブのURLが正しいことを確認するが、先のページ本文はローカルのテスト応答で置換する。問い合わせ送信、実際の通話、シャトル予約は行わない。電話番号はリンク先を検証する。
- 編集はテスト専用ブラウザのsessionStorage/localStorageだけに保存する。JSONコピーはテスト用クリップボードへ書く。本番公開・元JSONの書換え・ユーザーのブラウザ/クリップボード変更はしない。通常の編集テストは認証状態をfixtureで設定する。実パスワードの確認は `E2E_EDITOR_PASSWORD` が与えられた場合だけ実行する。
- タッチ/ピンチはChromiumのCDP入力で検査。IMEは変換中イベントのガードを検査する。OSの日本語入力、Safari実機の慣性・ホームインジケーター、PWAのOSインストール画面は別途実機確認が必要。
- レスポンシブ検査は寸法・可視性・状態・スクリーンショットによる。承認済み画像がないためピクセル差分の基準画像を自動で正解とはしない。すべての端末/操作順列を数学的に網羅するものではない。
- 外部フォントの通信も置換し、OSのフォールバックフォントで検査する。Webフォントを読み込んだ本番と文字幅が異なる可能性がある。レイアウトの不具合報告にはこの条件を付記する。
- 失敗を既知扱いで握り潰したり、自動リトライで成功扱いにしたりしない。現行サイトに不具合があれば統合コマンドは非ゼロで終了する。条件付きスキップはテスト出力に理由を表示する。

設定の参照: [Playwright projects](https://playwright.dev/docs/test-projects)、[webServer](https://playwright.dev/docs/test-webserver)。
