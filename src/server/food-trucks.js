// 「本日のキッチンカー」データ提供モジュール。
//
// データソースは NomNom!(https://nomnom-eats.com/)のバックエンド。
// 同サイトは Firebase Firestore(project: kichen-car-app)を使っており、
// トップページは schedules コレクションを「その日(JST)」で絞り込み、各 schedule が
// 参照する kitchens ドキュメントを join して「本日のキッチンカー」を表示している。
// ブラウザは WebChannel(realtime listen)を使うが、同じ公開データは Firestore の
// REST(:runQuery / ドキュメント取得)からも読める。ここではそれを利用する。
//
// API キーは NomNom! のクライアント JS に埋め込まれている公開キーで、秘密情報ではない
// (Firebase Web SDK の仕様。アクセス制御は先方の Firestore セキュリティルールで担保)。

export const FOOD_TRUCKS_REFRESH_INTERVAL_SECONDS = 30 * 60;

const FIREBASE_PROJECT = 'kichen-car-app';
const FIREBASE_API_KEY = 'AIzaSyBnVIM_Wm_7hL0MPargey7uzsJiCH_qCeQ';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
const NOMNOM_SHOP_BASE = 'https://nomnom-eats.com/shop';
const FETCH_TIMEOUT_MS = 12_000;

export async function getFoodTrucksPayload() {
  const generatedAt = new Date();
  const { start, end, dateLabel } = jstDayWindow(generatedAt);

  // 1) 本日(JST)の schedules を取得
  const schedules = await runQuery({
    from: [{ collectionId: 'schedules' }],
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [dateFilter('GREATER_THAN_OR_EQUAL', start), dateFilter('LESS_THAN', end)],
      },
    },
    orderBy: [{ field: { fieldPath: 'date' }, direction: 'ASCENDING' }],
  });

  // 2) 各 schedule の kitchenId を kitchens ドキュメントに join(同一IDはキャッシュ)
  const kitchenCache = new Map();
  const trucks = [];
  for (const doc of schedules) {
    const schedule = docFields(doc);
    const kitchenId = schedule.kitchenId;
    if (!kitchenId) continue;
    if (!kitchenCache.has(kitchenId)) {
      kitchenCache.set(kitchenId, await fetchKitchen(kitchenId));
    }
    const kitchen = kitchenCache.get(kitchenId) || {};
    trucks.push({
      kitchenId,
      name: kitchen.name || '名称未設定',
      type: kitchen.type || '',
      dish: kitchen.dish || '',
      spot: schedule.spotId || '',
      image: kitchen.image || '',
      sourceUrl: `${NOMNOM_SHOP_BASE}/${kitchenId}`,
    });
  }

  return {
    generatedAt: generatedAt.toISOString(),
    date: dateLabel,
    refreshIntervalSeconds: FOOD_TRUCKS_REFRESH_INTERVAL_SECONDS,
    nextUpdateAt: new Date(generatedAt.getTime() + FOOD_TRUCKS_REFRESH_INTERVAL_SECONDS * 1000).toISOString(),
    count: trucks.length,
    trucks,
    source: { name: 'NomNom!', url: 'https://nomnom-eats.com/' },
  };
}

// 対象日(JST)の [00:00, 翌00:00) を UTC で表した区間と、YYYY-MM-DD ラベルを返す。
function jstDayWindow(now) {
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const d = jst.getUTCDate();
  const start = new Date(Date.UTC(y, m, d) - 9 * 3600 * 1000); // JST 00:00 を UTC で
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  const dateLabel = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { start, end, dateLabel };
}

function dateFilter(op, when) {
  return { fieldFilter: { field: { fieldPath: 'date' }, op, value: { timestampValue: when.toISOString() } } };
}

async function runQuery(structuredQuery) {
  const response = await fetchWithTimeout(`${FIRESTORE_BASE}:runQuery?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).filter((row) => row.document).map((row) => row.document);
}

async function fetchKitchen(kitchenId) {
  try {
    const response = await fetchWithTimeout(
      `${FIRESTORE_BASE}/kitchens/${encodeURIComponent(kitchenId)}?key=${FIREBASE_API_KEY}`
    );
    return docFields(await response.json());
  } catch {
    return {};
  }
}

// Firestore の型付き値 {stringValue:"x"} → "x"
function fieldValue(value) {
  if (value == null || typeof value !== 'object') return undefined;
  return Object.values(value)[0];
}

function docFields(doc) {
  return Object.fromEntries(Object.entries(doc?.fields || {}).map(([key, value]) => [key, fieldValue(value)]));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
