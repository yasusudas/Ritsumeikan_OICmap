// 食事の店ではない施設の、地図上の領域と案内カード（ピンは出さない）。
// 領域の形は public/manual-search-index.json の同じ entryId の polygons（床図の図形をなぞったもの）。
// ホバーと選択は食事の店の領域と同じ緑で示し、クリックで案内カードを開く（food-guide-viewer.js）。

export const FACILITY_PLACES = [
  {
    // D棟 1F の ATM。床図の ATM アイコンの下の灰色の四角（ja/1F.svg の 575.4–583.3 × 298.9–307.5）。
    entryId: 'manual-1F-1792118400000-atmd01',
    kind: 'atm',
    icon: '/iconsvg/atm.svg',
    name: { ja: 'ATM', en: 'ATM' },
    building: { ja: 'D棟', en: 'Building D' },
    summary: {
      ja: '取扱金融機関と利用時間は確認中です。',
      en: 'The bank and opening hours are being checked.',
    },
  },
  {
    // セブン-イレブン（A棟 1F）の店内の ATM。囲む四角がないので、床図の ATM アイコンの丸
    // （ja/1F.svg の中心 707.3, 472.5、半径 4.05）を32角形にした。
    entryId: 'manual-1F-1792118400000-atm7e1',
    kind: 'atm',
    icon: '/iconsvg/atm.svg',
    name: { ja: 'ATM', en: 'ATM' },
    building: { ja: 'A棟', en: 'Building A' },
    summary: {
      ja: 'セブン-イレブンの店内にあります。取扱金融機関と利用時間は確認中です。',
      en: 'Inside 7-Eleven. The bank and opening hours are being checked.',
    },
  },
];

// The middle of a facility's first area, used to keep it in view when its card opens.
export function facilityAnchor(entry) {
  const polygon = entry?.polygons?.[0];
  if (!polygon?.length) return null;
  const xs = polygon.map((point) => point.xRatio);
  const ys = polygon.map((point) => point.yRatio);
  return {
    xRatio: (Math.min(...xs) + Math.max(...xs)) / 2,
    yRatio: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}
