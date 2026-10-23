"""Summarize raw real-Safari measurements; Pillow is optional for comparison sheets."""
import json
import statistics
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else "output/svgo-safari-2026-10-20")
performance = json.loads((root / "performance.json").read_text())
visual = json.loads((root / "visual.json").read_text())
assets = json.loads((root / "assets.json").read_text())
assert len(performance["trials"]) == 32, "Expected all 32 trials"
assert all(t["hiddenFrames"] == 0 for t in performance["trials"]), "Background trial: rerun"
assert len(visual["comparisons"]) == 54, "Expected all 54 appearance comparisons"
summary = {"cases": [], "appearance": [], "errors": performance["errors"]}
lines = ["# Safari / SVGO raw-data summary", "", "FPS is the median of four trials; ranges retain every trial, including stalls.", "",
         "| Language | Floor | Variant | FPS median | FPS range | p95 ms median | >25ms frames | Maximum ms |",
         "|---|---|---|---:|---|---:|---:|---:|"]
for language, floor in [("ja", "1F"), ("en", "1F"), ("ja", "5F"), ("en", "5F")]:
    for variant in ["baseline", "svgo"]:
        trials = [t for t in performance["trials"] if (t["language"], t["floor"], t["variant"]) == (language, floor, variant)]
        fps = [t["zoom"]["fps"] for t in trials]
        row = {"language": language, "floor": floor, "variant": variant, "trials": len(trials),
               "fpsMedian": statistics.median(fps), "fpsRange": [min(fps), max(fps)],
               "p95MsMedian": statistics.median(t["zoom"]["p95Ms"] for t in trials),
               "maxMs": max(t["zoom"]["maxMs"] for t in trials),
               "over25msPercent": sum(t["zoom"]["over25ms"] for t in trials) / sum(t["zoom"]["frames"] for t in trials) * 100,
               "panFpsMedian": statistics.median(t["pan"]["fps"] for t in trials),
               "settleMaxMs": max(t["settle"]["maxMs"] for t in trials)}
        summary["cases"].append(row)
        lines.append(f"| {language} | {floor} | {variant} | {row['fpsMedian']:.2f} | {min(fps):.2f}–{max(fps):.2f} | {row['p95MsMedian']:.1f} | {row['over25msPercent']:.2f}% | {row['maxMs']:.0f} |")
lines += ["", "## SVG bytes", "", "| Language | Floor | Before | After | Reduction | Gzip before | Gzip after |", "|---|---|---:|---:|---:|---:|---:|"]
for a in assets["images"]:
    lines.append(f"| {a['language']} | {a['floor']} | {a['beforeBytes']} | {a['afterBytes']} | {100*(1-a['afterBytes']/a['beforeBytes']):.2f}% | {a['beforeGzip']} | {a['afterGzip']} |")
lines += ["", "## Pixel differences", "", "Changed means any RGB-channel difference; >32 means a channel difference exceeding 32/255. These are descriptive thresholds, not a perceptual pass criterion.", "",
          "| Scale | Largest changed-pixel share | Largest share >32/255 | Largest mean absolute RGB difference |", "|---|---:|---:|---:|"]
for scale in [1, 4, 10]:
    comparisons = [c for c in visual["comparisons"] if c["scale"] == scale]
    row = {"scale": scale, "maxChangedPercent": max(c["changedPercent"] for c in comparisons),
           "maxOver32Percent": max(c["over32"] / c["totalPixels"] * 100 for c in comparisons),
           "maxMeanChannelDelta": max(c["meanChannelDelta"] for c in comparisons)}
    summary["appearance"].append(row)
    lines.append(f"| {scale}x | {row['maxChangedPercent']:.6f}% | {row['maxOver32Percent']:.6f}% | {row['maxMeanChannelDelta']:.6f}/255 |")
(root / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
(root / "summary.md").write_text("\n".join(lines) + "\n")

try:
    from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat
except ImportError:
    print("Saved summary.json / summary.md. Install Pillow for image comparison sheets.")
    sys.exit(0)

font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 22) if Path("/System/Library/Fonts/Supplemental/Arial.ttf").exists() else ImageFont.load_default(size=22)
small = ImageFont.load_default(size=17)
rows = []
for language, floor, scale in [("en", "2F", 1), ("ja", "2F", 1), ("en", "1F-viewer", 10), ("ja", "1F-viewer", 10)]:
    stem = f"visual-{language}-{floor}-{scale}x"
    a = Image.open(root / (stem + "-before.png")).convert("RGB")
    b = Image.open(root / (stem + "-after.png")).convert("RGB")
    if scale == 1:
        diff = ImageChops.difference(a, b).convert("L")
        _, x, y = max((ImageStat.Stat(diff.crop((x, y, x + 64, y + 64))).sum[0], x, y)
                      for y in range(0, a.height - 64, 32) for x in range(0, a.width - 64, 32))
        box = (max(0, x - 16), max(0, y - 16), min(a.width, x + 112), min(a.height, y + 96))
        a = a.crop(box).resize((576, 504), Image.Resampling.NEAREST)
        b = b.crop(box).resize((576, 504), Image.Resampling.NEAREST)
        label = f"{language.upper()} {floor}: worst-difference area, enlarged pixels"
    else:
        # The AC office label sits left of the ROI centre; keep the whole label legible.
        box = (150, 350, 726, 854)
        a, b = a.crop(box), b.crop(box)
        label = f"{language.upper()} 1F viewer: 10x room detail, 1:1 pixels"
    rows.append((label, a, b))
sheet = Image.new("RGB", (1200, 580 * len(rows) + 56), "#edf1f4")
draw = ImageDraw.Draw(sheet)
draw.text((18, 12), "Actual Safari 27.0.1 SVG rendering | SVGO 4.1.0, precision 5", font=font, fill="#162330")
for index, (label, a, b) in enumerate(rows):
    y = 56 + index * 580
    draw.text((18, y), label, font=small, fill="#162330")
    draw.text((18, y + 25), "Original", font=small, fill="#333")
    draw.text((618, y + 25), "SVGO", font=small, fill="#333")
    sheet.paste(a, (18, y + 56)); sheet.paste(b, (618, y + 56))
sheet.save(root / "appearance-comparison.png")
for page in range(3):
    sheet = Image.new("RGB", (1200, 2080), "#edf1f4"); draw = ImageDraw.Draw(sheet)
    for index, item in enumerate(assets["images"][page * 6:page * 6 + 6]):
        y = index * 344
        draw.text((12, y), f"{item['language'].upper()} {item['floor']} | original / SVGO", font=small, fill="#162330")
        for col, suffix in enumerate(["before", "after"]):
            picture = Image.open(root / f"visual-{item['language']}-{item['floor']}-1x-{suffix}.png").convert("RGB")
            picture.thumbnail((570, 314), Image.Resampling.LANCZOS)
            sheet.paste(picture, (12 + col * 600, y + 27))
    sheet.save(root / f"appearance-overview-{page + 1}.png")
print("Saved summaries, appearance-comparison.png and three whole-sheet comparison pages.")
