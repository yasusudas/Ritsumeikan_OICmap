# 立命館OICマップ / Ritsumeikan OIC Map

## 日本語

### 概要

立命館OICマップは、立命館大学大阪いばらきキャンパス(OIC)の教室や施設をブラウザで探すための非公式キャンパスマップです。フロア図を見ながら、教室名、研究室名、ラウンジ、ホール、学生利用スペース、トイレ、エレベーター、プリンターなどを検索できます。

### できること

閲覧用サイトでは、1Fから5Fに加えて、A棟6から9F、H棟6から9F、プリンター案内図を切り替えて表示できます。地図はスマートフォンではピンチ操作、PCではホイールやドラッグ操作で拡大、縮小、移動できます。

検索欄に教室名や施設名を入力すると、該当する場所が地図上でハイライトされます。通信に失敗した場合は、検索欄の「再試行」から読み込み直せます。施設アイコンを使うと、トイレ、ウォーターサーバー、自販機、階段・エスカレーター、エレベーターを確認できます。「その他」からプリンター案内図やAED、ATM、授乳スペースを選べます。施設ボタンをもう一度押すとリングが消え、別の施設を押すと表示が切り替わります。ATMは1F、授乳スペースは2Fへ自動で切り替わり、解除すると選択前の階に戻ります。両者を切り替えた場合も、最初に開いていた階に戻ります。

### データと構成

地図画像はSVGとして管理しています。日本語版は `src/assets/floors/ja/`、英語版は `src/assets/floors/en/` を使います。編集用の完全な検索データは `public/manual-search-index.json` に保存し、閲覧用の検索項目と施設リングはビルド時に別々のハッシュ付きJSONへ生成します。シラバス関連の生成データや取得時の一時解析物はローカル作業用として扱い、GitHubには含めません。

施設リングの編集・保存は日本語SVGの座標を基準にします（H棟はxからviewBox原点の8.5を引いて正規化）。編集画面の地図はUIの言語によらず日本語版を使います。英語版の閲覧時は、SVGから生成した `src/assets/facility-ring-offsets.json` の補正を施設の種類と近くのピクトグラムから自動選択し、保存座標に加えて表示します。リングの追加・再作成時も英語用の位置設定は不要です。リングの半径も同じデータから各言語のピクトグラムに合わせ、色付きの線の中心が円の輪郭に重なります。SVGを差し替えた場合は、Playwrightを利用できる環境で `node scripts/generate-facility-ring-offsets.mjs` を実行すると補正表を再生成できます。

UIの文言は `src/i18n.js` にまとまっています。日本語と英語の表示を変える場合は、原則としてこの翻訳辞書を更新し、`npm run sync:en` または `npm run build` で英語版HTMLを同期します。

同じ階・同じ名前の検索候補8組には、`locationHint` / `locationHintEn` に棟名や近くの教室などの補足を持たせ、候補の下段に表示します。補足も検索対象ですが、施設名・ID・個別URLは維持します。編集時の読み込み・保存・書き出しでも補足を保持します。

### 注意

このマップは立命館大学公式のサービスではありません。地図情報は、立命館大学「立命館大学 大阪いばらきキャンパス フロアガイド 日本語」(2025年3月発行、OIC地域連携課)をもとにした非公式の案内です。

## English

### Overview

Ritsumeikan OIC Map is an unofficial campus map for browsing classrooms and facilities at Ritsumeikan University Osaka Ibaraki Campus (OIC) via a web browser. While viewing floor plans, you can search for classroom names, laboratory names, lounges, halls, student-use spaces, restrooms, elevators, printers, and more.

### Features

On the viewing site, you can switch between displays for the 1st to 5th floors, as well as Building A floors 6 to 9, Building H floors 6 to 9, and a printer guide map. You can zoom in/out and move the map using pinch gestures on smartphones, or by using the mouse wheel and dragging on a PC.

When you enter a classroom or facility name in the search bar, the corresponding location will be highlighted on the map. If loading fails, use “Try again” in the search panel to retry. Facility icons show restrooms, water dispensers, vending machines, stairs and escalators, and elevators. The More menu contains the printer guide, AEDs, ATMs, and the nursing space. Select a facility again to hide its rings, or select another facility to switch the display. Selecting ATMs switches to 1F, and selecting the nursing space switches to 2F. Deselecting returns to the previous floor, even after switching between these two facilities.

### Data and Structure

Map images are managed as SVGs. The Japanese version uses `src/assets/floors/ja/`, and the English version uses `src/assets/floors/en/`. The complete editable search data remains in `public/manual-search-index.json`; the viewer's search entries and facility rings are emitted as separate hashed JSON assets at build time. Generated syllabus data and one-off scraping captures are treated as local working files and are not included on GitHub.

Facility rings are edited and saved using Japanese SVG coordinates (subtract the 8.5 viewBox x origin for Building H). The editor always displays the Japanese map, regardless of its UI language. The English viewer automatically selects a nearby pictogram of the same facility type from the SVG-derived `src/assets/facility-ring-offsets.json` and adds its offset to the saved coordinates. New or recreated rings need no separate English position settings. Ring radii also follow each language’s individual pictogram sizes, with the colored stroke centered on the circle’s edge. After replacing floor SVGs, regenerate the offsets with `node scripts/generate-facility-ring-offsets.mjs` in an environment with Playwright available.

UI text is consolidated in `src/i18n.js`. To change the Japanese and English displays, you should generally update this translation dictionary and sync the English HTML using `npm run sync:en` or `npm run build`.

The eight groups of same-floor, same-name search results include building or nearby-room hints in `locationHint` / `locationHintEn`, displayed below each result name. Hints are searchable; facility names, IDs, and individual URLs remain unchanged. The editor preserves these hints when loading, saving, and exporting data.

### Disclaimer

This map is not an official service of Ritsumeikan University. The map information is based on the Ritsumeikan University Osaka Ibaraki Campus Floor Guide (Japanese) (published March 2025, OIC Community Liaison Division) and serves as an unofficial guide.
