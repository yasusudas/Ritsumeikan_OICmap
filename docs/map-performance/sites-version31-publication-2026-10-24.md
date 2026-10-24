# Version3.1のSites全体公開

2026年10月24日。採用済みのSafari向け最適化を含むVersion3.1を、ログイン不要で公開した。

- [日本語版](https://rits-oic-map-version31.yasusudas.chatgpt.site/)
- [英語版](https://rits-oic-map-version31.yasusudas.chatgpt.site/en/)

## 公開した状態

アプリ元は`2a07e9e4b80083197639a66bdba0994f2f4c5087`。このコミットから隔離したソースを作り、次の採用済み3項目を日英に反映した。

1. 配信用SVG18資産をSVGO 4.1.0、精度5で軽量化。
2. 1Fの既知の一定濃度mask/filterをopacityへ置換。
3. 4フレームごとの実寸更新を維持し、最後に処理した入力＋140msで停止時の更新を行う。

[追加4案の検証](next-optimizations-safari-comparison-2026-10-24.md)は未採用の試作として管理する。公開アプリへは含めていない。別作業のGPS・オフライン機能も、この固定コミットの公開範囲には含めていない。

## Sitesの公開記録

| 項目 | 値 |
|---|---|
| project_id | `appgprj_6adc26e82e24819199af2834a24116fc` |
| Sites version | 1 |
| version_id | `appgprj_6adc26e82e24819199af2834a24116fc~appgver_60c0b8f7713c8191b62c25dfad0784d3` |
| deployment_id | `appgdep_6adc283a589081919a9e2c881c14512e` |
| Sites管理ソースcommit | `6ccd204e1fb6b9f19ee5bc37cabf51b584c4bc6b` |
| 公開範囲・結果 | `public` / `succeeded` |

Sites管理ソースのSHAと、アプリ元のSHAを区別する。既存の4 APIをSitesのWorkerへ接続する薄いアダプターを専用ソースに追加し、Viteの出力を配信した。元アプリの`src`、`public`、APIハンドラー、日英HTMLは固定元と一致する。Version3.2のSitesとは別のサイトであり、更新するときは上記project_idを再利用する。

## 公開先での確認

- Cookie・AuthorizationなしのGETで、日英を含む16 HTMLページと4 APIがHTTP 200。
- 実Safariで検証済みの公開Version3.1ビルド、今回のビルド、公開先の配信SVG18資産がバイト一致。
- 地図の最終入力状態を含む実行JS13ファイルも、今回のビルドと公開先でバイト一致。
- 新規ブラウザーコンテキストのPC Chromium／iPhone 13相当WebKit×日英の4条件で、地図・食事ピン11個と画像、AC130検索と停止後の外周、5Fへの移動、トイレリングを確認。JavaScriptのpageerrorと横方向のoverflowは0。
- スクリーンショットはスクリプトで自動保存し、画像のデコードと検索移動の完了を待って確認した。

今回の確認は公開先の表示・配信・操作確認であり、新たな実Safari FPS測定や実機iPhoneの検証ではない。編集画面はHTMLの配信のみ確認し、編集ログイン・保存操作は行っていない。

ローカル証跡は`output/sites-version31-public-2026-10-24/`の`publication.json`、`optimized-assets.json`、`live-http-check.json`、`live-js-assets.json`、`live-browser-check.json`とPNG。`output/`はGit管理外の成果物なので、文書を共有する際は必要な画像・JSONを同梱する。
