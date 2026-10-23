# 地図描画の比較検証

## Version3.1の採用後の組み合わせ比較（2026-10-24）

ユーザー指定により、この回は実際の`Version3.1`作業ツリーと、未改善Dev `cb403e0a0c882b0de79ae0182a3a98988f9097e4`を比較する。既存GPS・オフライン等のWIPも含むため、3変更だけの因果対照とはしない。下記の独立検証とは区別する。

`node scripts/benchmarks/build-version31-comparison.mjs`、`node scripts/benchmarks/version31-safari-server.mjs`の順に実行し、実Safariで`http://127.0.0.1:5210/?run=perf&controlled=1`を開く。1Fは日英各8対応組、5Fは各4組、計48試行。録画は主FPS計測から分離し、`?run=video&controlled=1`で同じ入力列を別実行する。画質は`?run=quality&variant=baseline&language=ja&floor=1F&steps=20`などを使用する。

各ページに一意の読み込みIDを付け、同じvariantを続けて開く際も前のdocumentを参照しない。画像・CSSサイズ・実際の言語・非表示コマ・初期倍率・停止後scaleを確認する。主FPSの集計は`python3 scripts/benchmarks/summarize-version31-safari.py --controlled`。`python3 scripts/benchmarks/capture-version31-safari.py quality`で、画面中央に揃えたnative PNG16枚を自動撮影する。`video`ならSafariウインドウIDを指定して録画する。画面全体の座標を使う録画は別画面・別Spaceを捉える可能性があるため使わない。PNGシグネチャとMOVの実際の映像を検証する。native画質PNGとJSONをそろえてから`python3 scripts/benchmarks/summarize-version31-quality.py`を実行する。[条件・結果・録画](../../docs/map-performance/version31-combined-safari-comparison-2026-10-24.md)。

## 以下の各変更の独立検証

Version 3.1以降に向けた検証用。**各検証は、その時点のバニラDevと、対象の変更だけを適用した候補を比較する。** 過去のSVGO・mask/filter置換などを次の候補へ積み重ねない。`origin/dev`を取得して基準コミットを記録し、各回の結果を別の`docs/*-comparison-YYYY-MM-DD.md`に残す。

## Leafletタイル版

アプリ本体は変更せず、Viteのビルド時変換で描画アダプターを差し込む。既存Devの操作ハンドラ・倍率・オーバーレイを使い、Leaflet 1.9.4のTileLayerが画像タイルを管理する。操作までLeafletへ全面移行した実装ではない。

```sh
npm install --prefix /tmp/oic-leaflet-tools leaflet@1.9.4 sharp@0.34.5 --ignore-scripts --no-audit --no-fund
git diff --exit-code dev -- src public index.html en vite.config.js package.json package-lock.json
node node_modules/vite/bin/vite.js build --manifest --outDir /tmp/oic-leaflet-baseline
node scripts/benchmarks/build-leaflet-candidate.mjs /tmp/oic-leaflet-candidate
node scripts/benchmarks/leaflet-safari-server.mjs /tmp/oic-leaflet-baseline /tmp/oic-leaflet-candidate output/leaflet-safari-YYYY-MM-DD 5193
```

実アプリのSafariで`http://127.0.0.1:5193/`を開き、前面に保った状態で「FPS比較」「表示比較」を実行する。Playwright WebKitを実Safariの代用にしない。

- FPS: 日英1F／5F、各条件4回、ABBA/BAAB順の計32試行。24段階の拡大・縮小を3往復。rAF間隔で操作更新を測り、GPUの提示フレーム数とは区別する。
- タイルは元DevのSVGから生成する。mask/filter・パスは保持し、エクスポートするviewBoxだけをタイル領域へ変更する。512pxの中身に周囲1pxの余白を付けた514px PNGを使う。重ねた余白が明るい線にならないよう、Leaflet標準の`plus-lighter`を`mix-blend-mode: normal`へ変える。
- 計測前に同じ操作でタイルを事前生成する。生データの`serverBefore/After.generated`が変化した試行では、生成処理とSafari描画の負荷が混在するため結果をそのまま採用しない。
- `hiddenFrames`、viewport、DPR、タイルエラー、`tileFrames.loadedTiles === 0`も必ず確認する。高FPSと表示の連続性を分けて評価する。
- 表示: 初期倍率、12段階後（約3.14倍）、24段階後（約9.85倍）。SVGの実表示位置とLeafletの読み込み済みタイルから、実Safariで地図面の比較画像を保存する。UIは別途目視する。
- PNGタイルの初回生成・本番通信・モバイル・高DPRの性能は、このウォーム状態のFPSから推定しない。

`?run=inspect&variant=leaflet&language=en&floor=5F&steps=24`で固定状態を確認できる。`?run=perf&smoke=1`は日本語1F各1回の予備確認で、正式結果には含めない。

生成物と生データは指定した`output/`へ保存する。通常の`src/`、依存定義、ロックファイル、Devブランチへの採用は別作業。

## 拡大中をscaleだけにする比較

候補はDevの4コマごとのwidth/height更新だけを外し、停止140ms後の更新を維持する。SVGや他の改善を加えない。

```sh
git diff --exit-code origin/dev -- src public index.html en vite.config.js package.json package-lock.json
npm run build -- --manifest --outDir /tmp/oic-scale-baseline
node scripts/benchmarks/build-scale-only-candidate.mjs /tmp/oic-scale-candidate
node scripts/benchmarks/scale-only-safari-server.mjs
```

実Safariで`http://127.0.0.1:5194/`の「FPS比較」を実行する。日英1F／5F、各条件4回の計32試行。前回と同じ24段階の拡大・縮小を3往復し、停止区間を別枠と合算の両方で記録する。候補の各操作区間でCSSのwidthが1種類であることと、停止後にscaleが1へ戻ることも確認する。

画質は`?run=quality&variant=baseline&language=ja&floor=1F&steps=23`と、variantを`scale-only`へ変えたページを比較する。11段階（約2.85倍）／23段階（約8.95倍）の途中状態を、140msの停止描き直しだけ保留して保持する。Safariのnativeスクリーンショットを保存し、「停止後の描画」を押してから再び撮影する。SVGをcanvasへ描き直した画像を、拡大中の画質の代わりに使わない。この保留処理はFPS計測へ入れない。

日英1F／5Fの23段階と日本語1Fの11段階、各前後・各フェーズの20枚を保存した後、NumPy/Pillowが使えるPythonで`python3 scripts/benchmarks/summarize-scale-only-safari.py`を実行すると、JSONと画像一覧を生成する。原寸native画面は1025×1207、iframe960×800、DPR1が今回の集計条件。結果は`docs/map-performance/scale-only-safari-comparison-2026-10-21.md`を参照。

## 描き直し頻度1/2・1/3・1/4・1/5の比較

今回の依頼に合わせ、結果は直前の`docs/map-performance/scale-only-safari-comparison-2026-10-21.md`へ追加する。各候補はバニラDevから定数`ZOOM_RASTER_EVERY_FRAMES`だけを差し替え、過去の改善は組み込まない。1/4候補も独立にbuild・計測し、Devとファイルが完全一致する対照にする。

```sh
git fetch origin dev
git diff --exit-code origin/dev -- src public index.html en vite.config.js package.json package-lock.json
npm run build -- --manifest --outDir /tmp/oic-frequency-baseline
for interval in 2 3 4 5; do
  node scripts/benchmarks/build-redraw-frequency-candidate.mjs "$interval"
done
node scripts/benchmarks/redraw-frequency-safari-server.mjs
```

実Safariで`http://127.0.0.1:5195/`を開き、前面に保って「FPS比較」。日英1F／5F×5条件×4回＝80試行。各対象は`D,2,3,4,5,5,4,3,2,D,3,D,5,2,4,4,2,5,D,3`順（D=Dev）。入力、ウォームアップ、24段階×3往復、停止18フレーム、ドラッグ60フレームは直前と同じ。計測中に撮影・build・テスト・画像解析を実行しない。

画質は`?run=quality&variant=every-2&language=ja&floor=1F&steps=23`などで開く。variantは`baseline`、`every-2`〜`every-5`。日英1F／5Fの23段階後、日本語1Fの11／20段階後を撮り、各場面で「停止後の描画」を押してから再撮影する。60枚のnative Safari PNGを、対応するJSONと同じ名前で指定outputへ保存する。途中状態の保持・撮影方法は上のscale比較と同じ。20段階は1/5の最大scale 1.4641を含む場面であり、23段階の静止画だけで周期全体の画質を判断しない。

NumPy/Pillowの使えるPythonで`python3 scripts/benchmarks/summarize-redraw-frequency-safari.py`を実行すると集計と画像一覧を生成する。画面1025×1207、iframe960×800、DPR1、地図本文cropは前回と同じ。画質PNGがそろう前にFPSだけ集計する場合は`python3 scripts/benchmarks/summarize-redraw-frequency-safari.py output/redraw-frequency-safari-2026-10-21 --perf-only`。

## 1/4の低下原因：入力・描画・停止タイマーの診断

結果は同じ`docs/map-performance/scale-only-safari-comparison-2026-10-21.md`の「1/4だけ遅くなる理由の追加調査」。通常ソースを変更せず、実寸更新分岐とrAF・タイマーへメモリ内のイベント記録を入れる。抑制・位相変更はハーネスで明示した診断条件に限る。GPUのpaint回数を計測するコードではない。

先に前節の手順で**最新の同じDevから**`/tmp/oic-frequency-baseline`と2/3/4/5候補を再buildし、その後に次を実行する。

```sh
node scripts/benchmarks/build-zoom-timing-probes.mjs
node scripts/benchmarks/zoom-timing-safari-server.mjs
```

実Safariで`http://127.0.0.1:5196/`を開き「追加診断」。日本語1F9条件×2、英語1F3条件×2、日本語5F2条件×2の28試行。通常4頻度に加え、ログなし1/4、操作中の停止更新抑制、地図側rAF、1/4のcounter初期値2による位相変更を比較する。各条件の倍率列は前節と同じ。画面を前面に保ち、計測中に撮影・build・テスト・解析を実行しない。

```sh
node scripts/benchmarks/zoom-cadence-safari-server.mjs
```

続いて実Safariで`http://127.0.0.1:5197/`の「入力方式診断」。指定50msの独立タイマーwheelと、以前の接点距離変化を投影した合成touch・パンを各頻度2回（16試行）。入力予定時刻を信頼するだけでなく、実際の入力間隔も保存する。全rAF、変更コマだけの条件付き指標、CSS変更観測／秒を区別する。旧iPhoneの実行を再現したものとはしない。

```sh
node scripts/benchmarks/zoom-svg-visibility-safari-server.mjs
```

最後に`http://127.0.0.1:5198/`の「SVG表示を切り分け」。元画像表示／非表示／非表示／表示の4試行。同じ1/4・同じ元rAF入力で、画像要素のvisibilityだけ変える診断。非表示のFPSは改善候補のランキングに入れない。

48試行が完了した後に`python3 scripts/benchmarks/summarize-zoom-timing-safari.py`で集計する。元の80試行の段階別グラフは`plot-zoom-timing-safari.py`（Matplotlib必要）で生成する。今回Matplotlibは`/tmp/oic-timing-plot`へ隔離して追加し、`PYTHONPATH=/tmp/oic-timing-plot`で実行した。通常のプロジェクト依存やシステムPythonは変更していない。

成果物は`output/zoom-timing-safari-2026-10-21/`。再実行は同名JSONを上書きするので、既存証跡を残す場合は出力先を分ける。API/console全ログやGPUの直接プロファイルはこのハーネスの対象外。

## 1/4を維持し最終入力+140msにする比較

`scripts/benchmarks/build-last-input-candidate.mjs` は通常ソースがorigin/devと同じことを確認し、Vite transformだけで `/tmp/oic-last-input-candidate` を生成する。SVGや本体は編集しない。

```sh
npm run build -- --manifest --outDir /tmp/oic-last-input-baseline
node scripts/benchmarks/build-last-input-candidate.mjs
node --test scripts/benchmarks/check-last-input-candidate.mjs
node scripts/benchmarks/last-input-safari-server.mjs
```

実Safariで `http://127.0.0.1:5199/?run=perf` を表示。32試行の間は前面を維持し、スクリーンショット・別の重い処理を行わない。完了後、`?run=diagnostic` で50ms指定入力の8試行を実行する。後者のタイマー計装は主FPSと別データ。

画質は `?run=quality&variant=baseline&language=ja&floor=1F&steps=11` を開き、「拡大中の状態を保持」でnative PNGを撮影。「停止後の描画」を押して完了後に再撮影する。variantはbaseline/last-input。ja1F11/20/23、en1F23、ja5F23、en5F23の6場面×2条件×2状態。最後の入力直前から実寸更新callbackを識別して保留するため、候補の可変delayでも機能する。画質時のみiframe原点(32.5,100)、960×800を固定。地図body cropはブラウザ上端75pxの場合(33,367,993,941)で、別のブラウザchrome高では撮り直して原点を確認する。タイマーを保留した画像はリアルタイム動画の代わりにはしない。

native画像を `output/last-input-safari-2026-10-21/quality-{variant}-{language}-{floor}-{steps}-{moving|stopped}.png` へ保存した後、NumPy/Pillow付きPythonで `scripts/benchmarks/summarize-last-input-safari.py --quality` を実行する。外周2pxを除く比較と、外周込みの差を両方残す。主FPS32件・期限診断8件・画像24件の検証を通した集計を同じdocsの追加節へ反映する。画面非表示で開始できなかった履歴や原点が変わった初回画像は採用データへ混ぜない。

## 最大ズーム上限だけを変える比較

```sh
npm run build -- --manifest --outDir /tmp/oic-max-zoom-baseline
node scripts/benchmarks/build-max-zoom-candidates.mjs
node scripts/benchmarks/max-zoom-safari-server.mjs
```

基準DevのmaxZoom10と2/4/6を比較する。他の改善は加えず、通常ソースは変更しない。実Safariで `http://127.0.0.1:5200/?run=perf&smoke=1` の4試行で上限・clampモデル・描画サイズを確認し、`?run=perf` で48試行を開始する。前面を維持し、スクリーンショットや別の重い処理は完了後に行う。

共通範囲11段階と、同じ32回入力で各上限へ到達する範囲を各2往復。全入力FPSと、元ソースのclampで受理された入力FPSを分ける。上限・下限で変化しない入力、停止18rAFの費用も全てJSONへ残す。1Fは4回/条件、5Fは2回/条件。パンは各上限で60コマ。

画質URLは `?run=quality&variant=baseline&language=ja&floor=1F&mode=common`。variantはbaseline/max-2/max-4/max-6。mode=commonはja1Fの11段階、mode=ceilingは初めて各上限へ到達する段階を自動計算する。ceilingはja1F/en1F/ja5F。各状態でnative PNGを撮影し、停止後の描画ボタンで実寸表示へ戻して再撮影する（計32PNG）。iframe原点32.5/100、960×800を固定。最後の入力直前から実寸callbackを識別して保留し、主FPSには入れない。

検索の確認は `?run=usage&variant=baseline&language=ja&query=AC130` および `language=en&query=AS555`。4条件で8操作・native8PNG。対象外周の実寸、停止後zoom、対象画像をJSONへ保存する。

native画像は `output/max-zoom-safari-2026-10-21/quality-{variant}-{language}-{floor}-{common|ceiling}-{moving|stopped}.png` と `usage-{variant}-{language}-{query}.png`。NumPy/Pillow付きPythonで `scripts/benchmarks/summarize-max-zoom-safari.py --quality` を実行する。native画面高からブラウザchrome高75または113pxを確認し、同じ地図body960×574を切り出す。異なる上限は拡大範囲が違うため、画素差で画質順位を付けない。同倍率での一致、各条件のmoving/stopped、検索後サイズを分けて評価する。結果は `docs/map-performance/max-zoom-safari-comparison-2026-10-21.md`。

## Canvasと表示範囲のブロック読み込み

結果は[Canvas比較docs](../../docs/map-performance/canvas-block-comparison-2026-10-23.md)。元Dev `cb403e0a0c882b0de79ae0182a3a98988f9097e4` の隔離コピーから、SVG版とCanvas版を独立buildする。作業中チェックアウトのmain.js等を基準に使わない。

```sh
mkdir -p /tmp/oic-canvas-dev-20261023
git archive cb403e0a0c882b0de79ae0182a3a98988f9097e4 | tar -x -C /tmp/oic-canvas-dev-20261023
ln -s "$PWD/node_modules" /tmp/oic-canvas-dev-20261023/node_modules
node scripts/benchmarks/build-canvas-block-candidate.mjs /tmp/oic-canvas-dev-20261023
node scripts/benchmarks/canvas-block-server.mjs
```

空の専用ディレクトリで行い、既存エクスポートや測定outputを上書きしない。buildスクリプトの引数2/3で基準／候補build先も変えられる。サーバーは`build-verification.json`のbuild先を使う。sharpは従来の隔離依存`/tmp/oic-leaflet-tools/node_modules/sharp`を使用する（なければ`npm install --prefix /tmp/oic-leaflet-tools sharp`）。従来Leafletのタイルは元SVGのハッシュが一致する場合だけ再利用し、過去のキャッシュがなければ新規生成する。

実Safari・Firefoxで`http://127.0.0.1:5205/perf-probe.html`を開く。右上にブラウザ名と準備OKが出る。iframe900×440・DPR 1を画面内へ収める。各言語・フロアでA-B-B-A-B-A-A-B、1ブラウザ32試行。ズームは20回拡大／20回縮小×3、パン120回、入力の間に親rAFを待つ。ブラウザ間で入力周期そのものが固定されるわけではない。

開始はlocalhostの`/control`へPOSTする。別のrunIdを使い、同名JSONを上書きしない。3秒以内の準備ポーリングがある参加ブラウザだけ指定する。

```sh
curl -X POST http://127.0.0.1:5205/control -H 'Content-Type: application/json' \
  --data '{"action":"start","runId":"canvas-check-unique-id","smoke":true,"participants":["safari","firefox"]}'
```

smokeは日本語1Fの2試行。正式試行は`smoke:false`。サーバーは4図のz0〜2を準備するが、ロード時に使う別SVG・検索先のブロック等は追加生成され得る。正式計測前に全ケースを一度動かしてキャッシュを温め、`/stats`の生成時刻と計測区間を照合する。今回の正式runは測定中生成0件。実通信・冷えた生成負荷を含む結果として扱わない。終了時の`/stats`を別名で保存する。

```sh
python3 scripts/benchmarks/summarize-canvas-block.py canvas-check-unique-id safari firefox
```

32件／ブラウザ、各条件n=4、visible、DPR、画面寸法、言語、同期を検証し`summary.json/csv`を生成する。親rAFとCSS変化／秒、代用ブロック、blankを別々に読む。GPU提示FPSや省電力率には換算しない。Chromeを参加させるときは`participants`と集計CLIにも追加するが、今回Chromeの正式比較は文書準備タイムアウトで未完了だった。

画質URLは`?run=quality&variant=baseline&language=ja&floor=1F&steps=23`。variantはbaseline/canvas、日英1F／5Fで拡大中保持と停止後をnative撮影する。途中状態の保持はFPS測定へ入れない。検索は`?run=usage&variant=baseline&language=ja&query=AC130`、英語は`language=en&query=AS555`。公開検索処理・トイレ表示を動かしJSONを保存する。

Safari画像を`output/canvas-block-2026-10-23/safari-quality-{variant}-{language}-{floor}-23-{moving|stopped}.png`、操作画像を`safari-usage-{variant}-{language}-{query}.png`として保存する。Firefox補足は日本語1Fの同名prefixをfirefoxへ変えた4枚。Pillowを使えるPythonで`compare-canvas-block-screens.py`を実行し、撮影寸法・座標・準備状態を検証して等倍比較画像を作る。別のウィンドウ配置ではcropを現物に合わせて確認する。正式測定時のJSはoutputの`paired-*`へ保存済みで、現在のハーネスには後続のiframe読み込み対策と画質／検索確認も含む。

## Leafletの操作も移す全面移行比較

閲覧地図のcamera/wheel/drag/touch/double-click/keyboard/box zoomをLeafletへ委譲する独立build。既存の検索・施設・店舗UIはDOMを維持して追従させる。通常ソースと原本SVGはDevのまま。エディターの移行確認は含まない。

```sh
npx vite build --manifest --outDir /tmp/oic-leaflet-full-baseline
node scripts/benchmarks/build-leaflet-candidate.mjs /tmp/oic-leaflet-render-only
node scripts/benchmarks/build-leaflet-full-candidate.mjs
node scripts/benchmarks/leaflet-full-safari-server.mjs
```

Leaflet/sharpは既定で`/tmp/oic-leaflet-tools/node_modules`を使用し、`LEAFLET_TOOLS`で変更できる。実Safariの`http://127.0.0.1:5203/?run=perf`で日英1F/5F×3条件×4回=48試行、各試行2ワークロード。`&check=1`は全面版1試行、`&smoke=1`は日本語1Fの3条件。計測中は重い処理やスクリーンショットを入れない。

commonは全条件24段階×1.1倍（全面版は公開API）、nativeは同じwheel delta36px（全面版は標準入力処理）。後者の倍率範囲はDevと異なるため、FPSだけで高速化率を付けない。原点・倍率・CSSアニメーション状態・タイル取得・実際のdragstart/移動数も保存する。比較用マウス入力はHTMLElementからバブリングさせる。documentへ直接送るとLeafletの実際の入力対象と異なる。

完了後`node scripts/benchmarks/summarize-leaflet-full.mjs`で48件/96ワークロードのvisible・言語・共通倍率・実ドラッグ・エラーを検証する。画質/操作診断とnative PNGを保存した後、NumPy/Pillow付きPythonで`compare-leaflet-full-screens.py`、Nodeで`validate-leaflet-full.mjs`を実行する。全フロアを操作できることと全領域の画素同等性は分けて判断する。詳細URL・結果・途中修正は[Leaflet docsの追加節](../../docs/map-performance/leaflet-tiles-safari-comparison-2026-10-21.md#leaflet-full)を参照。
