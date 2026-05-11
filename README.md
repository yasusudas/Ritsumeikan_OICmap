# 立命館OICマップ / Ritsumeikan OIC Map

## 日本語

### 概要

立命館OICマップは、立命館大学大阪いばらきキャンパス(OIC)の教室や施設をブラウザで探すための非公式キャンパスマップです。フロア図を見ながら、教室名、研究室名、ラウンジ、ホール、学生利用スペース、トイレ、エレベーター、プリンターなどを検索できます。

公開している本番サイトは次の3つです。

- 閲覧用サイト: `https://rits-oic-map.vercel.app/`
- 編集用サイト: `https://rits-oic-map.vercel.app/editor/`
- 編集用ログイン: `https://rits-oic-map.vercel.app/editor/login/?next=%2Feditor%2F`

このリポジトリでは、`main` ブランチを本番用の唯一のブランチとして扱います。以前のテスト用Preview Deploymentや非mainブランチ由来のURLは運用対象ではありません。

### できること

閲覧用サイトでは、1Fから5Fに加えて、A棟6から9F、H棟6から9F、プリンター案内図を切り替えて表示できます。地図はスマートフォンではピンチ操作、PCではホイールやドラッグ操作で拡大、縮小、移動できます。

検索欄に教室名や施設名を入力すると、該当する場所が地図上でハイライトされます。施設アイコンを使うと、トイレ、ウォーターサーバー、自販機、プリンター、階段、エレベーターなど、キャンパス内でよく探す設備をすばやく確認できます。

右上メニューの「お問い合わせ」から、Google Forms の問い合わせフォームを埋め込み表示できます。フォームを有効にするには、Google Forms の埋め込みURLを `VITE_CONTACT_FORM_EMBED_URL` に設定してください。ローカルでは `.env.local` に `VITE_CONTACT_FORM_EMBED_URL=https://docs.google.com/forms/d/e/.../viewform?embedded=true` のように記載します。

日本語版と英語版の両方を用意しています。日本語版は `/`、英語版は `/en/` で表示され、画面上の言語切替ボタンでも切り替えられます。英語版のHTMLは `scripts/sync-en-index.mjs` によって日本語版の `index.html` と翻訳辞書から同期されます。

編集用サイトでは、地図上をクリックして検索用ラベルの位置を追加したり、施設リングの位置を調整したりできます。編集内容はブラウザのローカルストレージに下書きとして保存され、JSONとしてコピーまたは書き出しできます。本番データとして反映する場合は、書き出した内容を `public/manual-search-index.json` に反映してからビルド、デプロイします。

### 公開と更新

このサイトはオンラインアクセスを前提にしています。利用者向けの閲覧、編集、ログインは、すべて本番URLから行います。

更新作業では、検索データ、地図SVG、翻訳辞書、画面HTML、スタイル、JavaScriptを変更したあと、`main` ブランチへ反映します。Vercelは `main` ブランチからProduction Deploymentを作成し、本番URLへ公開します。

英語版HTMLを手動で同期したい場合は `npm run sync:en` を使います。同期状態を確認したい場合は `npm run check:en` を使います。本番ビルドの確認には `npm run build` を使います。

### データと構成

地図画像はSVGとして管理しています。日本語版は `floor_img/`、英語版は `floor_img_Eng/` を使います。検索用の座標データと施設リングは `public/manual-search-index.json` に入っています。

UIの文言は `src/i18n.js` にまとまっています。日本語と英語の表示を変える場合は、原則としてこの翻訳辞書を更新し、`npm run sync:en` または `npm run build` で英語版HTMLを同期します。

Vercelでは `main` ブランチからProduction Deploymentを作成します。`vercel.json` では旧ドメイン `iris-oic-map.vercel.app` から本番ドメインへのリダイレクト、静的アセットのキャッシュ、`manual-search-index.json` と `sw.js` のキャッシュ方針を設定しています。

### 注意

このマップは立命館大学公式のサービスではありません。地図情報は、立命館大学「立命館大学 大阪いばらきキャンパス フロアガイド 日本語」(2025年3月発行、OIC地域連携課)をもとにした非公式の案内です。

編集用サイトはパスワードで保護されています。パスワードそのものはREADMEや公開ドキュメントには記載しません。運用上必要な人にだけ別経路で共有してください。

## English

### Overview

Ritsumeikan OIC Map is an unofficial browser-based campus map for Ritsumeikan University's Osaka Ibaraki Campus (OIC). It helps visitors and students find classrooms, laboratories, lounges, halls, student spaces, restrooms, elevators, printers, and other campus facilities while looking at the actual floor maps.

The production site is published at the following URLs.

- Viewer: `https://rits-oic-map.vercel.app/`
- Editor: `https://rits-oic-map.vercel.app/editor/`
- Editor login: `https://rits-oic-map.vercel.app/editor/login/?next=%2Feditor%2F`

This repository treats the `main` branch as the only production branch. Old test Preview Deployments and URLs generated from non-main branches are not part of the current operation.

### Features

The viewer can switch between 1F through 5F, Building A 6F through 9F, Building H 6F through 9F, and the printer guide map. Users can zoom and pan the map with touch gestures on mobile devices or with wheel and drag operations on desktop browsers.

The search box highlights matching rooms and facilities directly on the map. Facility buttons make it easier to find frequently used campus amenities such as restrooms, water dispensers, vending machines, printers, stairs, and elevators.

The top-right menu includes a Contact item that embeds a Google Forms form. To enable it, set the Google Forms embed URL in `VITE_CONTACT_FORM_EMBED_URL`. For local development, add a `.env.local` value such as `VITE_CONTACT_FORM_EMBED_URL=https://docs.google.com/forms/d/e/.../viewform?embedded=true`.

The app supports both Japanese and English. The Japanese viewer is served from `/`, and the English viewer is served from `/en/`. Users can also switch languages from the button in the UI. The English HTML is generated from the Japanese `index.html` and the translation dictionary by `scripts/sync-en-index.mjs`.

The editor site lets maintainers click the map to add searchable label positions and adjust facility highlight rings. Editor changes are stored as drafts in browser local storage, and they can be copied or exported as JSON. To update the deployed search data, export the JSON, apply it to `public/manual-search-index.json`, then build and deploy the project.

### Publishing and Updates

This site is intended to be accessed online. Viewer access, editor access, and editor login all use the production URLs listed above.

When updating the site, maintainers change the search data, SVG maps, translation dictionary, HTML, styles, or JavaScript, then publish those changes through the `main` branch. Vercel creates the Production Deployment from `main` and serves it through the production URLs.

Use `npm run sync:en` when the English HTML needs to be regenerated. Use `npm run check:en` to confirm that the English HTML is in sync. Use `npm run build` to verify the production build before publishing.

### Data and Project Structure

Floor maps are stored as SVG files. Japanese maps live in `floor_img/`, and English maps live in `floor_img_Eng/`. Search coordinates and facility rings are stored in `public/manual-search-index.json`.

UI text is centralized in `src/i18n.js`. When changing Japanese or English copy, update the translation dictionary and run `npm run sync:en` or `npm run build` so that the English HTML stays in sync.

Vercel creates the Production Deployment from the `main` branch. `vercel.json` configures the redirect from the old `iris-oic-map.vercel.app` domain, cache rules for static assets, and cache behavior for `manual-search-index.json` and `sw.js`.

### Notes

This is not an official Ritsumeikan University service. The map information is based on Ritsumeikan University's Osaka Ibaraki Campus Floor Guide (Japanese), published in March 2025 by the OIC Regional Partnerships Office, and is provided as an unofficial guide.

The editor is password-protected. The password itself should not be written in the README or other public documentation. Share it only with maintainers through a separate private channel.
