# 地図の拡大縮小・描画性能の検証

[全検証を内容別にまとめたドキュメント](SUMMARY.md)

| ドキュメント | 検証内容 |
|---|---|
| [svgo-safari-comparison-2026-10-20.md](svgo-safari-comparison-2026-10-20.md) | SVGOによるSVG軽量化 |
| [mask-filter-safari-comparison-2026-10-20.md](mask-filter-safari-comparison-2026-10-20.md) | 1Fのmask/filter置換 |
| [leaflet-tiles-safari-comparison-2026-10-21.md](leaflet-tiles-safari-comparison-2026-10-21.md) | Leafletタイル化・操作の全面移行 |
| [scale-only-safari-comparison-2026-10-21.md](scale-only-safari-comparison-2026-10-21.md) | transformのみ・描き直し頻度・1/4低下原因・最終入力140ms |
| [max-zoom-safari-comparison-2026-10-21.md](max-zoom-safari-comparison-2026-10-21.md) | 最大ズーム上限の調整 |
| [svg-viewport-safari-comparison-2026-10-21.md](svg-viewport-safari-comparison-2026-10-21.md) | SVG要素の画面外非表示 |
| [canvas-block-comparison-2026-10-23.md](canvas-block-comparison-2026-10-23.md) | 元SVGとCanvas＋ブロック読み込み。実Safari・Firefox、Chromeは未完了。電力は未計測 |

各文書に改善なしDevとの比較、測定条件、画質・操作確認、制限事項を記録しています。測定画面寸法・入力列が異なる試験間でFPSを直接順位付けしないでください。結果の採用状況は各文書を参照してください。

生データ・画像はリポジトリ直下の`output/`、再実行用コードは[scripts/benchmarks/README.md](../../scripts/benchmarks/README.md)にあります。`output/`はローカル成果物のため、文書を外部共有する際は必要な画像・データの同梱が必要です。
