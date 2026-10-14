# 食事案内デザイン確認用画像

- 日付: 2026-10-14
- 生成方式: imagegen組み込みツール。CLI/APIフォールバックは使用していない。
- 用途: [食事案内仕様書](../../../food-guide-spec.md)に基づくカードとロゴピンの見た目の確認。アプリ実装・本番素材ではない。

> 初期仕様の参考画像です。現在の1.5版では文字ピン・集合バッジ・案内線・公式ロゴを使用しません。現行実装用画像は `public/food-marks/` にあります。

## 最終画像

- [カード比較](cards-preview.png): PCの店舗カード、スマホの概要カード、スマホの詳細カード。
- [ロゴピン比較](pins-preview.png): スターバックス、セブン-イレブン、食堂の文字バッジ。通常・ホバー・選択中、概要吹き出し、集合ピンの例。

画像内の地図は概念的な描写であり、正確な店舗位置やピクセル寸法を示すものではない。実装時の位置・寸法・状態遷移は仕様書を正本とする。営業時間・利用条件は未確認表示を使った。参照した公式ロゴも、生成画像から本番素材として切り出さない。

## 参照

- 現行devサイトのPC・スマホ画面。
- [スターバックス公式サイト](https://www.starbucks.co.jp/)のロゴ画像。
- [セブン-イレブン公式サイト](https://www.sej.co.jp/)のヘッダーロゴ画像。

## カード初回生成プロンプト

```text
Use case: ui-mockup
Asset type: high fidelity design review board, preview only, not production assets.
Primary request: Create one beautifully readable landscape board showing the approved food information UI for the Japanese Ritsumeikan OIC campus map. Use the two screenshot references as the product context, not as literal device frames. Use the provided real Starbucks and Seven-Eleven artwork only as logo references; preserve their recognizable colors and shapes. This is a visual concept based on a written specification.
Input images in order: 1 desktop campus map screenshot (layout and real floor-map reference); 2 mobile screenshot (existing mobile header and toolbar reference); 3 official Starbucks logo (brand reference, no redesign); 4 official Seven-Eleven header artwork (brand reference, use its existing colored emblem, don't invent a replacement).
Composition: 2400x1600-style wide design board, white/light neutral background. Top understated title "OIC 食事案内 — カードデザイン". Three coordinated panels: left about 54% width a desktop browser viewport; middle about 22% a 390px mobile viewport in compact bottom-sheet state; right about 22% same mobile viewport in expanded details state. Use thin clean viewport boundaries, no photorealistic laptops, no tilted perspective. Labels above the panels exactly "PC：店舗カード", "スマホ：概要", "スマホ：詳細". Keep text large enough to read and avoid cramming.
Existing visual style: very clean Japanese university utility website, white canvas, black text, Noto Sans JP-style Japanese type, burgundy #991c27 for primary actions, light neutral gray #f4f4f2 for panels and pill controls, green #009e73 only for selected map location. Cards have NO shadows, NO gradients, NO blur. Cards are softly rounded pale-gray surfaces with generous white-space; controls inside are white pills, primary action burgundy. Only small map pins have soft shadows.
Desktop panel: recognizable existing white OIC map page header "立命館OICマップ", search field "教室名を検索", JA EN, floor tabs, facility icons. Real floor plan background based on image 1, preserving recognizable colored building groups. Add a few small white logo pins at food locations, including Starbucks emblem, Seven-Eleven emblem, and a distinct rounded text badge "OIC\n食堂". The selected OIC Cafeteria region is lightly tinted green (10% opacity) with a thin green outline, selected pin has a 3px green outer selection ring with a white gap. Keep pin small, around 40px at actual viewport scale. On right, inside the map and clear of existing controls, a 320px-wide pale-gray rounded NONMODAL store card. No dark overlay. Main content readable.
Desktop store card exact content and hierarchy:
top a small white rounded text badge "OIC\n食堂", full heading "OIC Cafeteria", a white circular close X button.
subline "C棟 1F · 生協食堂"
description "定食・麺・丼などを選べる生協食堂。"
section label "通常営業時間"
text "営業時間は公式情報でご確認ください"
section label "利用条件"
two compact rows "店内飲食：未確認" and "持ち帰り：未確認", optionally "一般利用：未確認" if space.
buttons in order "メニューを見る ↗", "最新の営業時間 ↗", "公式サイト ↗"; white pill surfaces, do not invent actual hours.
lower burgundy primary pill "地図で位置を確認", smaller plain text "食事一覧へ", source footer "情報元：立命館生協".
Mobile compact panel: preserve the mobile header and toolbar from image 2 but make the map region visible and readable using a modestly zoomed OIC floor-plan crop centered around the selected cafeteria. Map stays visible above the bottom sheet and is NOT dimmed. A bottom sheet fills roughly the lowest one third (about 280 CSS px), stretches edge-to-edge, top corners 24px, pale-gray surface. Small handle, same badge/name/close, "C棟 1F · 生協食堂", one-line description and short hours guidance. A large burgundy pill "詳しく見る". The selected green-ring pin stays visible above the sheet. Do not add a fake system browser status bar or bottom navigation.
Mobile detailed panel: same page and store, sheet extends up to just below toolbar, around 70% height, consistent pale gray and top rounded corners. Show same full information hierarchy as desktop in a single column, readable text, large white pill external link rows, burgundy "地図で位置を確認", visible "概要に戻す". Fixed heading and close, subtle small handle. No nested gray boxes, no separators between every line.
Constraints: one coherent UI system across three panels; logos and pins clearly feel clickable; exact Japanese labels; source map is background context and must not overpower readable cards. No photos of dishes, no prices, no ratings, no ordering, no route button, no favorites, no invented opening hours, no "営業中", no "空席", no giant pins. The mockup is not an authoritative map: do not invent new buildings or entrances. Small bottom board note exactly "デザイン確認用 · 店舗情報は未確認項目を含む".

```

## ロゴピン生成プロンプト

```text
Use case: ui-mockup
Asset type: food-map marker component design review board, raster preview only.
Primary request: Show the approved restaurant-logo pin system for the Ritsumeikan OIC Map in a crisp close-up component sheet. Faithfully visualize the specified white badges, tiny anchor tails, clickability, and distinct selected state. Use supplied official logo references rather than inventing new brand artwork. This is a design preview, not final official logo files.
Input images: 1 official Starbucks logo reference; 2 official Seven-Eleven header artwork reference (preserve the existing colored 7/Eleven emblem on its left; adjacent corporate Japanese wordmark need not be part of the emblem); 3 previous UI mockup, used only for overall color and typographic continuity. IMPORTANT: correct the cafeteria badge from the previous mockup: its white badge MUST be a horizontal rounded rectangle, never a circle, because it is a text badge.
Composition: high-resolution landscape design sheet approximately 2400x1600 proportions, white canvas, generous margins. Title exactly "OIC 食事案内 — ロゴピン". Main upper two thirds: three rows and three columns, spacious carefully aligned, components enlarged evenly about 3x for visual examination. Column labels exactly "通常", "ホバー", "選択中". Row labels exactly "スターバックス", "セブン-イレブン", "OIC Cafeteria". Use small restrained row labels, large attractive isolated pins. All selected states use green #009e73 ring outside the white badge with a clean white gap.
Pin geometry:
- Starbucks and Seven-Eleven rows: WHITE CIRCLE body diameter 40 units with a TINY downward triangular tail only 8 units wide and 6 units high; not a tall teardrop shape. Preserve 6-unit white padding around an approximately 28-unit brand image. Both brand emblems retain their original green / orange / red colors and their aspect ratios; don't make fake or new logos.
- OIC Cafeteria row: WHITE HORIZONTAL rounded rectangle body 52x40 units, corner radius 12 units, same tiny centered bottom tail 8x6. Two lines exact "OIC" then "食堂", black bold clear sans serif, no illustration or invented co-op logo. This text-badge shape is required in every column.
- Normal state thin #e2e2df edge, small soft shadow, ample whitespace.
- Hover state subtly lifted 2 units and 1.04 scale, still same shape. A small pointer cursor near one hovered component to communicate that it can be pressed; no arrows from everywhere.
- Selected state an OUTER green selection outline 3 units thick, separated from white badge by 2 units white space, same compact badge shape. Keep brand image itself unchanged. Slight soft pin shadow only. No solid green oversized backing disk.
Bottom third: TWO small practical examples side by side, pale-gray floor-plan context with a few muted rectangular rooms, not a geographic map.
Left label "ホバーの概要". Show a horizontally rounded OIC 食堂 pin, hovered, with a small pale-gray tooltip above it with exact three lines: "OIC Cafeteria", "生協食堂", "定食・麺・丼などを選べる生協食堂。". Tooltip has NO action buttons, NO shadows, NO gradient. The floor region under the pin has thin green outline with slight green tint, not an opaque green block.
Right label "近接する店舗". Show two compact white branded pins separated with short thin leader lines to their map anchors, and separately a white circular GROUP marker with a fork-and-spoon icon and clear count "3". Each marker has non-overlapping visual spacing. No leader line through a logo. Make the group shape visually different from a store logo.
One small footer line exactly "白い台座で操作対象を統一 · 選択中は緑で位置を示す".
Style: tasteful realistic web UI components, Noto Sans JP-like typography, flat white and pale gray foundation, no decorative illustrations, no physical pin mockups, no glossy metal, no photography, no gradients, no device hardware. ONLY marker badges use subtle shadow; tooltip and map context remain flat. Avoid badges that look like advertising stickers. Keep brand recognition and pressable silhouette as the main impression. Labels impeccably readable Japanese. No actual operating hours, no ratings, no prices, no route planning, no invented business facts.
```

## カード修正プロンプト

```text
Use case: precise-object-edit
Asset type: UI design board revision, preview only.
Input images: Image 1 is the EDIT TARGET, the OIC desktop and two mobile card design board. Image 2 is SUPPORTING component reference, the final logo pin sheet.
Primary request: Correct component styling in image 1 to match the approved specification and image 2.
Change only: every "OIC / 食堂" badge in the desktop map, mobile map, and card headings must be a white HORIZONTAL rounded rectangle (52:40 width-to-height, 12-unit corner radius), never a circle. On maps keep the short bottom triangular tail and selected green outer ring, exactly like the OIC Cafeteria row in image 2. In card headings use the same horizontal rectangular badge WITHOUT a tail. Also remove drop shadows and any gradients from the card surfaces and link-button surfaces; they must be flat pale gray cards and flat white buttons. Pin shadows may remain subtle.
Invariants: preserve the exact board composition, three panel sizes, existing maps, all logos, Japanese text and hierarchy, burgundy buttons, close buttons, green selected region, mobile sheet heights, header/toolbar, and footer. Keep all text intact and readable. No new content, no new rooms, no new business facts, no photos. Do not replace image 1 with a component sheet. Deliver the same card board with only the stated component-style corrections.
```
