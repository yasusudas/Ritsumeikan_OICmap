"""Summarize the isolated 1F mask/filter experiment; retain every trial."""
import json
import statistics
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else "output/mask-filter-safari-2026-10-20")
performance = json.loads((root / "performance.json").read_text())
visual = json.loads((root / "visual.json").read_text())
assets = json.loads((root / "assets.json").read_text())
assert len(performance["trials"]) == 16
assert len(visual["comparisons"]) == 16
assert all(t["hiddenFrames"] == 0 and t["viewport"] == [960, 800] and t["environment"]["dpr"] == 1 for t in performance["trials"])
summary = {"cases": [], "appearance": visual["comparisons"], "errors": performance["errors"]}
lines = ["# 1F mask/filter / Safari raw-data summary", "", "Every trial is retained. FPS and p95 are medians of four trials.", "",
         "| Language | Variant | FPS median | FPS range | p95 ms median | >25ms frames | Maximum ms | Settle maximum ms |",
         "|---|---|---:|---|---:|---:|---:|---:|"]
for language in ["ja", "en"]:
    for variant in ["baseline", "no-effects"]:
        trials = [t for t in performance["trials"] if t["language"] == language and t["variant"] == variant]
        fps = [t["zoom"]["fps"] for t in trials]
        row = {"language": language, "variant": variant, "trials": len(trials), "fpsMedian": statistics.median(fps),
               "fpsRange": [min(fps), max(fps)], "p95MsMedian": statistics.median(t["zoom"]["p95Ms"] for t in trials),
               "maxMs": max(t["zoom"]["maxMs"] for t in trials),
               "over25msPercent": 100 * sum(t["zoom"]["over25ms"] for t in trials) / sum(t["zoom"]["frames"] for t in trials),
               "panFpsMedian": statistics.median(t["pan"]["fps"] for t in trials),
               "settleMaxMs": max(t["settle"]["maxMs"] for t in trials)}
        summary["cases"].append(row)
        lines.append(f"| {language} | {variant} | {row['fpsMedian']:.2f} | {min(fps):.2f}–{max(fps):.2f} | {row['p95MsMedian']:.1f} | {row['over25msPercent']:.2f}% | {row['maxMs']:.0f} | {row['settleMaxMs']:.0f} |")
lines += ["", "## Visual differences", "", "| Language | Floor | View | Changed pixels | Total pixels | Maximum channel difference | Pixels >8/255 |", "|---|---|---|---:|---:|---:|---:|"]
for c in visual["comparisons"]:
    lines.append(f"| {c['language']} | {c['floor']} | {c['view']} | {c['changedPixels']} | {c['totalPixels']} | {c['maxChannelDelta']} | {c['over8']} |")
(root / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
(root / "summary.md").write_text("\n".join(lines) + "\n")

try:
    from PIL import Image, ImageDraw, ImageChops, ImageFont
except ImportError:
    print("Saved summaries; install Pillow for comparison PNGs.")
    sys.exit(0)
font = ImageFont.load_default(size=20)
sheet = Image.new("RGB", (1200, 900), "#edf1f4")
draw = ImageDraw.Draw(sheet)
draw.text((16, 10), "Real Safari: original / without mask & filter (same opacity)", font=font, fill="#17212b")
for index, language in enumerate(["ja", "en"]):
    y = 48 + index * 420
    draw.text((16, y), f"{language.upper()} 1F: formerly masked badge, 10x rendering", font=font, fill="#17212b")
    for col, suffix in enumerate(["before", "after"]):
        picture = Image.open(root / f"visual-{language}-1F-viewer-mask-detail-{suffix}.png").convert("RGB")
        picture = picture.crop((212, 68, 788, 404))
        draw.text((16 + col * 600, y + 30), "Original" if col == 0 else "No mask/filter", font=font, fill="#17212b")
        sheet.paste(picture, (16 + col * 600, y + 62))
sheet.save(root / "appearance-badge-comparison.png")
sheet = Image.new("RGB", (1200, 980), "#edf1f4")
draw = ImageDraw.Draw(sheet)
for index, language in enumerate(["ja", "en"]):
    y = index * 490
    draw.text((16, y + 8), f"{language.upper()} 1F: original / no mask & filter", font=font, fill="#17212b")
    for col, suffix in enumerate(["before", "after"]):
        picture = Image.open(root / f"visual-{language}-1F-viewer-1x-{suffix}.png").convert("RGB")
        picture.thumbnail((576, 440), Image.Resampling.LANCZOS)
        sheet.paste(picture, (16 + col * 600, y + 42))
sheet.save(root / "appearance-overview.png")
# Locate every changed pixel on the complete sheet, without a perceptual threshold.
bounds = {}
for language in ["ja", "en"]:
    a = Image.open(root / f"visual-{language}-1F-viewer-1x-before.png").convert("RGB")
    b = Image.open(root / f"visual-{language}-1F-viewer-1x-after.png").convert("RGB")
    bounds[language] = ImageChops.difference(a, b).getbbox()
(root / "difference-bounds.json").write_text(json.dumps(bounds, indent=2) + "\n")
print("Saved summary files, badge comparison, overview and full-sheet difference bounds.")
