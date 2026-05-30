# 立命館OICマップ / Ritsumeikan OIC Map

## 日本語

### 概要

立命館OICマップは、立命館大学大阪いばらきキャンパス(OIC)の教室や施設をブラウザで探すための非公式キャンパスマップです。フロア図を見ながら、教室名、研究室名、ラウンジ、ホール、学生利用スペース、トイレ、エレベーター、プリンターなどを検索できます。

### できること

閲覧用サイトでは、1Fから5Fに加えて、A棟6から9F、H棟6から9F、プリンター案内図を切り替えて表示できます。地図はスマートフォンではピンチ操作、PCではホイールやドラッグ操作で拡大、縮小、移動できます。

検索欄に教室名や施設名を入力すると、該当する場所が地図上でハイライトされます。施設アイコンを使うと、トイレ、ウォーターサーバー、自販機、プリンター、階段、エレベーターなど、キャンパス内でよく探す設備をすばやく確認できます

### データと構成

地図画像はSVGとして管理しています。日本語版は `floor_img/`、英語版は `floor_img_Eng/` を使います。検索用の座標データと施設リングは `public/manual-search-index.json` に入っています。

UIの文言は `src/i18n.js` にまとまっています。日本語と英語の表示を変える場合は、原則としてこの翻訳辞書を更新し、`npm run sync:en` または `npm run build` で英語版HTMLを同期します。

### 注意

このマップは立命館大学公式のサービスではありません。地図情報は、立命館大学「立命館大学 大阪いばらきキャンパス フロアガイド 日本語」(2025年3月発行、OIC地域連携課)をもとにした非公式の案内です。

## English

### Overview

Ritsumeikan OIC Map is an unofficial campus map for browsing classrooms and facilities at Ritsumeikan University Osaka Ibaraki Campus (OIC) via a web browser. While viewing floor plans, you can search for classroom names, laboratory names, lounges, halls, student-use spaces, restrooms, elevators, printers, and more.

### Features

On the viewing site, you can switch between displays for the 1st to 5th floors, as well as Building A floors 6 to 9, Building H floors 6 to 9, and a printer guide map. You can zoom in/out and move the map using pinch gestures on smartphones, or by using the mouse wheel and dragging on a PC.

When you enter a classroom or facility name in the search bar, the corresponding location will be highlighted on the map. You can use the facility icons to quickly identify frequently searched amenities on campus, such as restrooms, water dispensers, vending machines, printers, stairs, and elevators.

### Data and Structure

Map images are managed as SVGs. The Japanese version uses `floor_img/`, and the English version uses `floor_img_Eng/`. Coordinate data for searching and facility rings are stored in `public/manual-search-index.json`.

UI text is consolidated in `src/i18n.js`. To change the Japanese and English displays, you should generally update this translation dictionary and sync the English HTML using `npm run sync:en` or `npm run build`.

### Disclaimer

This map is not an official service of Ritsumeikan University. The map information is based on the Ritsumeikan University Osaka Ibaraki Campus Floor Guide (Japanese) (published March 2025, OIC Community Liaison Division) and serves as an unofficial guide.
