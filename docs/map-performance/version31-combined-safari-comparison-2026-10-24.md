# Version3.1の3項目適用後と改善なしDev：実Safariの比較

2026年10月24日、実際の`Version3.1`作業ツリーと、改善なしDevを比較した。**位置を揃えた1Fの高倍率条件では、日英ともFPSの改善が統計的に有意だった。撮影した範囲では、拡大中・停止後に追加の画質劣化は見つからなかった。5Fの有意な改善は確認できていない。**

## 対象と比較範囲

Devは`cb403e0a0c882b0de79ae0182a3a98988f9097e4`。開始時・終了時の両方で`git ls-remote origin refs/heads/dev`と照合し、同じ先頭であることを確認した。Git archiveから別ディレクトリへ取り出し、SVGO等を加えずにbuildした。

Version3.1は、ユーザーが作業中のブランチの実際の作業ツリーからbuildした。適用済みの3項目は次の通り。

1. 日英1Fの既知mask/filterをopacityへ置換。
2. 配信用の日英SVGをSVGO 4.1.0で軽量化。
3. 停止更新を最後に処理した入力＋140msへ変更。4フレームごとの実寸更新は維持。

[実装と採用時の確認](adoption-2026-10-24.md)。現在の作業ツリーには既存のGPS・オフライン・地図位置制御等も含まれる。**Version3.1全体の改善を示す比較であり、3項目だけの寄与を分離した因果対照ではない。** ビルド時の差分と18SVGの対応・SHA-256を保存した。今回の検証でアプリ本体を追加修正していない。

## Version3.1への公開範囲

2026年10月24日のコミット・pushでは、上記3項目、対応テスト、検証docsと計測スクリプトを対象とする。計測時の作業ツリーに含まれていたGPS・オフライン・地図位置制御等の既存の未コミット変更は、このコミットに含めない。したがって、本書のFPSは計測時の作業ツリーの結果であり、今回公開するコミットそのものを再計測した値ではない。公開対象だけを取り出した状態で、`npm test`の173件とproduction buildが成功した。日英の全階・施設・wheel/pan・食事表示を、PlaywrightのChromium/WebKit各PC・モバイル設定で確認し、28件成功・環境条件による4件skip、失敗0だった。これは公開前の回帰確認であり、実SafariでのFPS再計測ではない。録画・PNG・生データを含む`output/`はローカル証跡として保持し、Gitには含めない。

## 条件と2つのFPS試験

端末はMac14,9、Apple M2 Pro、メモリ32 GiB。macOS 27.0.1（26A434）、インストール済みSafari 27.0.1を使用した。Playwright WebKitによる代替ではない。両方を同じVite 7.3.1・ローカル依存でproduction buildした。

iframeは960×800 CSS px、原点(32.5,100)、DPR 1。Safariのウインドウ内に全体が収まる状態で実施。位置情報取得、外部フォント読み込み、Service Workerによるバックグラウンド保存だけを共通の比較用ページで隔離した。アプリの既存オフラインUI・入力リスナーは残る。通信・GPS・初回起動・オフライン保存・電力の測定ではない。

FPSは既存ハンドラへ合成wheel/mouse入力を送り、親ページのrAF間隔を保存した。**GPUの提示フレーム数や実トラックパッドの入力そのものを計測した値ではない。** 同じ入力列・回数を使い、停止区間とパンも別記する。各試行はページを新規読み込みし、画像のdecodeと1.2秒待機、同じ往復のウォームアップ、600ms待機後に計測した。

### A. 従来の24段階・3往復（参考）

初期fitから24段階の拡大・縮小を3往復。各半区間の後に18 rAFの停止区間、追加16段階後に60フレームのパンを測った。1Fは日英各8組、5Fは各4組、計48試行。順序は組内でDev→候補／逆順を均等にし、言語を挟んだ。

1F中央値は日本語32.24→60.03 FPS、英語34.24→59.86 FPSだった。しかし、既存の地図位置制御の差によって、同じwheel入力でも20段階後の地図y位置に約282px、23段階後に約376pxの差が出た。初期の地図サイズ・位置は一致していたが、操作中の視野は一致していない。したがって、次のBを主結果として追加した。AとBは実施時刻・倍率範囲が異なり、混ぜて集計しない。

### B. 同じ視野での高倍率・16段階・3往復（主結果）

最初に8段階拡大し、公開のドラッグハンドラを通して地図を中央へ合わせる。位置制限の差が働かない**初期fit比約2.14～9.85倍**の範囲で16段階の拡大・縮小を3往復する。各半区間の後は18 rAF、パンはさらに16段階後の60フレーム。ウォームアップも同じ16段階の往復とした。

1Fは日英各8組、5Fは各4組、計48試行。各言語・階・組の同じ入力コマを対応させた2,304コマについて、論理幅の差は最大0.000987 CSS px、平行移動の差は最大0.066003 CSS pxだった。非表示コマ0、実際の言語・画像・viewport一致、全停止区間の最後でscale=1、実行エラー0を確認した。外側のviewportは全試行1324×1094だった。

主FPS計測中は録画・スクリーンショット・build・テスト・画像解析を行っていない。録画はBと同じ入力を使う独立実行とし、録画中の値を主集計へ混ぜていない。

## FPS結果（B）

FPSは試行の中央値、括弧内は試行の最小～最大。p95はフレーム間隔の試行中央値。「25ms超」は全操作コマの割合を記述した補助量で、個々のコマを独立標本として検定していない。

| 対象 | 対応組数 | Dev FPS | Version3.1 FPS | p95間隔 Dev→候補 | 25ms超 Dev→候補 |
|---|---:|---:|---:|---:|---:|
| 日本語 1F | 8 | 22.43 (15.57–25.45) | 59.06 (57.66–60.26) | 268.5→19.0 ms | 16.93→1.43% |
| 英語 1F | 8 | 24.99 (21.45–25.46) | 59.28 (43.28–60.11) | 263.5→18.0 ms | 16.15→1.04% |
| 日本語 5F | 4 | 60.28 (58.93–60.57) | 60.32 (47.48–60.38) | 18.0→18.0 ms | 1.04→1.04% |
| 英語 5F | 4 | 60.30 (60.15–60.42) | 60.45 (44.14–60.45) | 18.0→18.0 ms | 0.26→1.04% |

停止区間を含めた1F中央値も、日本語33.45→59.43 FPS、英語35.81→59.49 FPSに改善した。パンは両者とも約60 FPSだった。

**遅延は完全には消えていない。** Bの英語1F候補に43.28 FPS、5F候補に44～47 FPSの試行もあり、全試行を除外せずに集計した。Aの日本語候補にも最大1,043msの単発の遅延がある。通常の引っかかりが減ったことと、常に60 FPSを保証することは区別する。これら単発の遅延の原因は今回特定していない。

## 有意な結果か

主評価はBの日英1F。**試行の対応組を単位**とした平均FPS差の両側・正確な符号反転検定を行い、2仮説をHolm補正した（有意水準0.05）。8組なので符号の全256通りを列挙した。平均差の95%区間は対応組のbootstrap 40,000回、seed 20261024で求めた。

| 1F | 対応組の平均FPS差 | 95% bootstrap区間 | 両側p | Holm補正後p |
|---|---:|---:|---:|---:|
| 日本語 | +37.32 FPS | +35.20～+39.52 | 0.0078125 | **0.015625** |
| 英語 | +32.99 FPS | +29.29～+35.55 | 0.0078125 | **0.015625** |

日英とも全8組で候補が上回り、この測定の前提では有意な改善が得られた。5Fは日本語p=0.375、英語p=1.0で、有意な改善は確認できなかった。4組の補助評価なので同等性の証明にもならない。

同一端末・同一Safariでの反復であり、別端末・別日・モバイル・高DPR・利用者全体への統計的な一般化はできない。順序を均等にしたが、固定順の反復には時間変化や共有端末上の負荷が残りうる。ページの可視性は検査したが、OS全体の前面アプリや他プロセスの負荷を固定した実験室条件ではない。検定は対応差の符号反転可能性を仮定する。3項目のそれぞれの効果量や電力削減をこの結果から分離・推定しない。

## 拡大中・停止後の画質

同じ言語・1Fの20段階（約6.73倍）／23段階（約8.95倍）を比較。最終入力直前から停止更新のタイマーだけを保留し、端数を保持した合成マウス移動で両者を同じ地図中央へ合わせた。拡大中のcompositor状態をmacOSの`screencapture`でPNG保存した後、停止更新を解放し、停止後scale=1と完了データを待って再撮影した。保留・位置合わせは画質用で、主FPSと録画へは入れていない。

**16枚すべてをスクリプトで自動撮影し、PNGのシグネチャも検証した。** SVGをCanvasへ再描画した画像を途中状態の代用にしていない。ウインドウの実高さとページviewportの差からブラウザUIの高さを算出し、同じ地図領域880×546 pxを切り出した。追加のGPSボタンやヘッダー・フッターは画素集計から外す。原画も保存する。

「輪郭指標」は地図ROIの輝度Laplacian分散の拡大中／停止後比。知覚評価の得点ではなく、場面間の直接比較にも使わない。同じ場面のDev／候補の変化を見る補助量とした。

| 1F | 段階 | 拡大中CSS scale Dev / 候補 | 輪郭指標 Dev / 候補 | 停止後の変化画素率 | 停止後の最大RGB差 |
|---|---:|---:|---:|---:|---:|
| 日本語 | 20 | 1.331 / 1.331 | 89.45% / 89.44% | 0.00000% | 0 / 255 |
| 日本語 | 23 | 1.210 / 1.210 | 67.28% / 67.28% | 0.00000% | 0 / 255 |
| 英語 | 20 | 1.331 / 1.331 | 89.22% / 89.19% | 0.04849% | 7 / 255 |
| 英語 | 23 | 1.210 / 1.210 | 67.10% / 67.09% | 0.04142% | 3 / 255 |

4場面の停止後は、日本語のROIが画素一致、英語の変化画素率は最大0.04850%、RGB差32/255を超える画素は0だった。比較画像で文字・記号・部屋の欠落や候補だけの追加のぼけは見つからなかった。拡大中は両者とも一時的なぼけがあり、停止後に鮮明になる。**画質の統計的な同等性検定は行っておらず、全地図・全倍率での同一性を保証しない。**

[日本語20段階の比較](../../output/version31-combined-safari-2026-10-24/quality-centered-comparison-ja-20.png)・[日本語23段階](../../output/version31-combined-safari-2026-10-24/quality-centered-comparison-ja-23.png)・[英語20段階](../../output/version31-combined-safari-2026-10-24/quality-centered-comparison-en-20.png)・[英語23段階](../../output/version31-combined-safari-2026-10-24/quality-centered-comparison-en-23.png)。左Dev／右Version3.1、上拡大中／下停止後。

## 録画と自動化

[比較録画 MP4](../../output/version31-combined-safari-2026-10-24/safari-version31-comparison.mp4)・[macOS収録の原本 MOV](../../output/version31-combined-safari-2026-10-24/safari-version31-comparison-original.mov)。Bの操作を日本語Dev→日本語Version3.1→英語Dev→英語Version3.1の順に実行し、右上にSafari・対象・言語・準備／動作開始／完了を表示する。SafariウインドウIDのみを指定した録画用の独立実行であり、そのFPSを主結果へ使わない。動画は動作確認用、画素比較はPNGを使う。音声は収録しない。

録画は約75秒、閲覧用MP4は1324×1094・約9.5MB。動作区間の目安は次の通り（録画処理開始基準）。

| 区間 | 映像上の時間 |
|---|---:|
| 日本語 Dev | 約12～19秒 |
| 日本語 Version3.1 | 約24～29秒 |
| 英語 Dev | 約33～41秒 |
| 英語 Version3.1 | 約45～50秒 |

[録画の区間と独立実行の数値](../../output/version31-combined-safari-2026-10-24/recording-segments.json)・[録画条件](../../output/version31-combined-safari-2026-10-24/recording-metadata.json)・[映像の抜き出し確認](../../output/version31-combined-safari-2026-10-24/video-contact-sheet.png)。原本のフレーム数をアプリのFPSと取り違えない。

撮影・録画にComputer Useは使わず、CoreGraphicsで比較用Safariウインドウを特定し、macOSの`screencapture`を呼ぶPythonを保存した。ページの「準備完了」をデータで待ち合わせ、PNG保存後に停止更新を解放する。ユーザーの「今後はスクリプト方式を使う」に従い、この方法を再利用する。

```sh
node scripts/benchmarks/build-version31-comparison.mjs
node scripts/benchmarks/version31-safari-server.mjs
# 実Safariで、録画なしの主計測を開始する
open -a Safari 'http://127.0.0.1:5210/?run=perf&controlled=1'
# 主計測完了後に実行する
python3 scripts/benchmarks/summarize-version31-safari.py --controlled
python3 scripts/benchmarks/capture-version31-safari.py quality
python3 scripts/benchmarks/capture-version31-safari.py video
```

画質集計にはNumPy/Pillowが利用できるPythonで`python3 scripts/benchmarks/summarize-version31-quality.py`を実行する。今回、標準PythonのNumPyにはアーキテクチャ不一致があったため、Codex同梱Pythonを使った。MP4はMOVからH.264・60fpsの閲覧用へ変換し、ブラウザUIと末尾のパディングを切り取った。原本MOVは可変フレーム間隔のまま保持する。MP4のフレーム数をFPS測定に使わない。

## 証跡・検証上の修正

- [主FPS生データ](../../output/version31-combined-safari-2026-10-24/performance-controlled.json)・[集計と検定](../../output/version31-combined-safari-2026-10-24/summary-controlled.json)
- [Aの生データ](../../output/version31-combined-safari-2026-10-24/performance.json)・[Aの集計](../../output/version31-combined-safari-2026-10-24/summary.json)。Bの生データのmethod文字列には複製元の24段階表記が残るが、`controlled=true`・`zoomSteps=16`・各半区間16件のrawを検査してBの条件を確認した。
- [画質集計](../../output/version31-combined-safari-2026-10-24/quality-centered-summary.json)・[自動撮影の形式・ハッシュ・コマンド](../../output/version31-combined-safari-2026-10-24/script-capture-manifest.json)
- [ビルド入力・18資産の対応](../../output/version31-combined-safari-2026-10-24/build-evidence.json)・[計測コード](../../scripts/benchmarks/version31-safari-page.js)・[自動撮影／録画](../../scripts/benchmarks/capture-version31-safari.py)・[ウインドウ特定](../../scripts/benchmarks/find-macos-window.swift)

予備確認・画面の一部が切れた試行・不完全なSW隔離・切替前documentの参照による中断は本集計へ含めず、`discarded-*`に保存した。一意のdocument IDを使い、言語・階の切替時に古いページを参照しないよう修正した。最初の矩形指定の録画は別画面を捉えていたため成果物から除外し、ウインドウID指定で撮り直した。最初のComputer Use画像はJPEGで位置も未補正だったため画素評価から除外し、実際の形式に合わせて`.jpg`へ直した。途中の失敗・中断を完了試行として数えていない。

生データ・原画・動画は`output/version31-combined-safari-2026-10-24/`。`output/`はローカル成果物なので、別環境へ渡すときは同梱が必要。ブランチはVersion3.1、アプリ本体の追加変更・commit・push・deployなし。

## 最終確認

`npm test`は192件成功。`pnpm test`は既存の依存再配置確認が非TTYで停止し、テスト開始前に`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`で終了したため、同じtestスクリプトをnpmから実行した。依存の強制再配置は行っていない。新しいJS/Pythonの構文、差分の空白、文書のローカルリンク、PNG16枚の形式、MOV/MP4の再生情報、日英4条件と完了の映像抜き出しを確認した。

[変更範囲の確認](../../output/version31-combined-safari-2026-10-24/scope-verification.json)・[npmのログ](../../output/version31-combined-safari-2026-10-24/npm-test.log)・[pnpmのログ](../../output/version31-combined-safari-2026-10-24/pnpm-test.log)。ビルド時から既存のtracked差分と`src/main.js`が変わっていないこと、ブランチがVersion3.1であることを確認した。
