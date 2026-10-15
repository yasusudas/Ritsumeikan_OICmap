// 「本日のキッチンカー」のデータ提供モジュール（OICランチストリートの営業カレンダー）。
//
// NomNom! が現在運用されていないため、関西移動販売車組合（(株)メルカート）の
// 「9-10 OICランチストリート」のカレンダー（2026-09-28〜2026-10-31）から店舗を取り出して
// 代用する。出店場所は2か所（赤: 空のプラザ、青: TERRACE GATE前）、時間はどちらも 10:30〜15:30。
// 月が替わったら、新しいカレンダーの内容を SCHEDULE に足す。
// NomNom! へ戻すときは food-trucks.js の FOOD_TRUCKS_SOURCE を 'nomnom' にする。

export const LUNCH_STREET_REFRESH_INTERVAL_SECONDS = 30 * 60;

export const LUNCH_STREET_HOURS = { start: '10:30', end: '15:30' };
export const LUNCH_STREET_PERIOD = { from: '2026-09-28', to: '2026-10-31' };

// 空のプラザは、日替わりの車両（A〜J）に加えて、毎日のお店（a〜d）が並ぶ。
// 火・金の一部の日は c（洋食 Dining KIYO）が出ない。
const DAILY = ['キッチン花子', 'デリカショップ モリガキ', '洋食 Dining KIYO', 'OIC FOOD PARK'];
const DAILY_NO_C = DAILY.filter((name) => name !== '洋食 Dining KIYO');

const PLAZA = {
  '2026-09-28': ['とっとのレシピ', 'RBDkitchen', ...DAILY],
  '2026-09-29': DAILY_NO_C,
  '2026-09-30': ['キッチンカーアド', 'からあげ専門 みこし', ...DAILY],
  '2026-10-01': ['TencYo食堂', 'ヤドカリkitchen', ...DAILY],
  '2026-10-02': ['とっとのレシピ', 'RBDkitchen', ...DAILY_NO_C],
  '2026-10-05': ['とっとのレシピ', 'RBDkitchen', ...DAILY],
  '2026-10-06': ['ポブズカー', ...DAILY_NO_C],
  '2026-10-07': ['キッチンカーアド', 'RUI食堂', ...DAILY],
  '2026-10-08': ['からあげ専門 みこし', 'TencYo食堂', ...DAILY],
  '2026-10-09': ['とっとのレシピ', 'RBDkitchen', ...DAILY_NO_C],
  '2026-10-12': ['RBDkitchen', 'Eeden cafe'],
  '2026-10-13': DAILY_NO_C,
  '2026-10-14': ['キッチンカーアド', 'RUI食堂', ...DAILY],
  '2026-10-15': ['からあげ専門 みこし', 'TencYo食堂', ...DAILY],
  '2026-10-16': ['とっとのレシピ', 'RBDkitchen', ...DAILY_NO_C],
  '2026-10-19': ['RBDkitchen', 'Eeden cafe', ...DAILY],
  '2026-10-20': ['PureWalkCafe', ...DAILY_NO_C],
  '2026-10-21': ['キッチンカーアド', 'RUI食堂', ...DAILY],
  '2026-10-22': ['TencYo食堂', 'ヤドカリkitchen', ...DAILY],
  '2026-10-23': ['RBDkitchen', ...DAILY_NO_C],
  '2026-10-26': ['とっとのレシピ', 'RBDkitchen', ...DAILY],
  '2026-10-27': ['ポブズカー', ...DAILY_NO_C],
  '2026-10-28': ['キッチンカーアド', 'RUI食堂', ...DAILY],
  '2026-10-29': ['TencYo食堂', 'ヤドカリkitchen', ...DAILY],
  '2026-10-30': ['とっとのレシピ', 'RBDkitchen', ...DAILY_NO_C],
};

const TERRACE = {
  '2026-09-29': ['ARAPSUN'],
  '2026-10-01': ['kyoto ケバブ屋 MOTO-3'],
  '2026-10-02': ['京タコス'],
  '2026-10-05': ['Eeden cafe'],
  '2026-10-06': ['ARAPSUN'],
  '2026-10-07': ['からあげ専門 みこし'],
  '2026-10-08': ['kyoto ケバブ屋 MOTO-3', 'オリンピア食堂'],
  '2026-10-09': ['京タコス'],
  '2026-10-13': ['ARAPSUN'],
  '2026-10-14': ['からあげ専門 みこし'],
  '2026-10-15': ['kyoto ケバブ屋 MOTO-3'],
  '2026-10-16': ['京タコス'],
  '2026-10-20': ['ARAPSUN'],
  '2026-10-21': ['からあげ専門 みこし'],
  '2026-10-22': ['kyoto ケバブ屋 MOTO-3'],
  '2026-10-23': ['京タコス'],
  '2026-10-27': ['ARAPSUN'],
  '2026-10-28': ['からあげ専門 みこし'],
  '2026-10-30': ['京タコス'],
};

// 店舗の写真（カレンダーの各店舗の写真を切り抜いたもの。public/lunch-street/）。
// 同じ店が両方のカレンダーにあるとき（みこし、Eeden cafe）は、大きい方の写真を使う。
const IMAGES = {
  'とっとのレシピ': 'tottono-recipe',
  RBDkitchen: 'rbdkitchen',
  'キッチンカーアド': 'kitchencar-ado',
  'からあげ専門 みこし': 'karaage-mikoshi',
  'TencYo食堂': 'tencyo-shokudo',
  'ヤドカリkitchen': 'yadokari-kitchen',
  'ポブズカー': 'pobuzu-car',
  'RUI食堂': 'rui-shokudo',
  'Eeden cafe': 'eeden-cafe',
  PureWalkCafe: 'purewalkcafe',
  'キッチン花子': 'kitchen-hanako',
  'デリカショップ モリガキ': 'delica-morigaki',
  '洋食 Dining KIYO': 'yoshoku-dining-kiyo',
  'OIC FOOD PARK': 'oic-food-park',
  ARAPSUN: 'arapsun',
  'kyoto ケバブ屋 MOTO-3': 'kyoto-kebab-moto3',
  '京タコス': 'kyo-tacos',
  'オリンピア食堂': 'olympia-shokudo',
};

export function lunchStreetImage(name) {
  return IMAGES[name] ? `/lunch-street/${IMAGES[name]}.webp` : '';
}

// 表示順は空のプラザ → TERRACE GATE前。spot は食事ページの出店場所ラベルのキー。
export const LUNCH_STREET_SCHEDULE = [
  { spot: 'plaza', days: PLAZA },
  { spot: 'terrace', days: TERRACE },
];

export const LUNCH_STREET_SOURCE = {
  name: 'OICランチストリート 営業カレンダー（関西移動販売車組合・メルカート）',
  url: '',
};

// JST の YYYY-MM-DD。
export function japanDateLabel(now) {
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`;
}

// food-trucks.js の NomNom! 版と同じ形（trucks / date / source …）に、カレンダー固有の
// hours と outOfPeriod を足して返す。
export function getLunchStreetPayload(now = new Date()) {
  const date = japanDateLabel(now);
  const trucks = [];
  for (const { spot, days } of LUNCH_STREET_SCHEDULE) {
    for (const name of days[date] ?? []) {
      trucks.push({
        kitchenId: `lunch-street:${spot}:${name}`,
        name,
        type: '',
        dish: '',
        spot,
        image: lunchStreetImage(name),
        sourceUrl: '',
      });
    }
  }
  return {
    generatedAt: now.toISOString(),
    date,
    refreshIntervalSeconds: LUNCH_STREET_REFRESH_INTERVAL_SECONDS,
    nextUpdateAt: new Date(now.getTime() + LUNCH_STREET_REFRESH_INTERVAL_SECONDS * 1000).toISOString(),
    count: trucks.length,
    trucks,
    hours: LUNCH_STREET_HOURS,
    outOfPeriod: date < LUNCH_STREET_PERIOD.from || date > LUNCH_STREET_PERIOD.to,
    period: LUNCH_STREET_PERIOD,
    source: LUNCH_STREET_SOURCE,
  };
}
