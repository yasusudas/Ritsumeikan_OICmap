// 食事の店ではない施設の、地図上の領域と案内カード（ピンは出さない）。
// 領域の形は public/manual-search-index.json の同じ entryId の polygons（床図の図形をなぞったもの）。
// ホバーと選択は食事の店の領域と同じ緑で示し、クリックで案内カードを開く（food-guide-viewer.js）。
//
// 取扱金融機関と取扱時間の出典（2026-10-16 に確認。/sources/ にも書いてある）:
// - 立命館大学 OIC フロアガイド（発行: 2024年3月 OIC地域連携課）18ページ「ATM取扱時間」
//   https://www.ritsumei.ac.jp/cias/file/about/floor_guide.pdf
//   C棟1F 京都中央信用金庫: 平日 8:00〜22:00・土曜 8:00〜20:00・日曜祝日 8:00〜20:00。
//   C棟1F 三井住友銀行: 平日 8:00〜22:00・土曜 8:00〜20:00・日曜祝日 休業。
//   AS棟1F セブン銀行（セブン-イレブン内）: 平日 8:00〜19:00・土曜と日曜祝日 8:00〜18:00。
//   （同じ表の2016年3月発行の版にはC棟1Fにイオン銀行もあったが、撤去されたので載せない。サイト運営者の指示。）
// - 三井住友銀行「店舗・ATM案内」の立命館大学大阪いばらきキャンパス出張所（C棟1階）が、三井住友銀行の
//   時間を裏づける。設置施設の休業日・時間帯によっては利用できないことがある。

export const FACILITY_TEXT = {
  institutions: { ja: '取扱金融機関', en: 'Banks' },
  hours: { ja: '営業時間', en: 'Hours' },
  note: {
    ja: '大学の休業日や、設置施設の営業時間によっては、利用できないことがあります。',
    en: 'It may be unavailable on university closure days or outside the opening hours of the facility it is in.',
  },
};

export const FACILITY_PLACES = [
  {
    // C棟 1F の ATM コーナー。床図の ATM アイコンの下の灰色の四角（ja/1F.svg の 575.4–583.3 × 298.9–307.5）。
    entryId: 'manual-1F-1792118400000-atmd01',
    kind: 'atm',
    icon: '/iconsvg/atm.svg',
    name: { ja: 'ATM', en: 'ATM' },
    building: { ja: 'C棟', en: 'Building C' },
    summary: {
      ja: '三井住友銀行・京都中央信用金庫のATMがあります。',
      en: 'ATMs of Sumitomo Mitsui Banking Corporation and Kyoto Chuo Shinkin Bank.',
    },
    institutions: [
      { ja: '三井住友銀行', en: 'Sumitomo Mitsui Banking Corporation' },
      { ja: '京都中央信用金庫', en: 'Kyoto Chuo Shinkin Bank' },
    ],
    hours: {
      // 日曜・祝日だけ銀行ごとに違うので、その下に1行ずつ（行頭の全角空白は字下げ）。
      ja: '平日 8:00–22:00\n土曜 8:00–20:00\n日曜・祝日\n\u3000三井住友銀行 休業\n\u3000京都中央信用金庫 8:00–20:00',
      en: 'Weekdays 8:00–22:00\nSaturday 8:00–20:00\nSunday and holidays\n\u3000Sumitomo Mitsui: closed\n\u3000Kyoto Chuo Shinkin: 8:00–20:00',
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
      ja: 'セブン-イレブン店内のセブン銀行ATMです。',
      en: 'The Seven Bank ATM inside 7-Eleven.',
    },
    institutions: [{ ja: 'セブン銀行ATM', en: 'Seven Bank ATM' }],
    hours: {
      ja: '平日 8:00–19:00\n土曜・日曜・祝日 8:00–18:00',
      en: 'Weekdays 8:00–19:00\nSaturday, Sunday and holidays 8:00–18:00',
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
