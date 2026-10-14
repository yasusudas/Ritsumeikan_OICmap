// Shared data, geometry and calendar rules. No DOM or network side effects.
export const FOOD_RETRY_MS = 60_000;
export const FOOD_GESTURE_DISTANCE = 8;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function japaneseDate(now = new Date()) {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

export function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function validateFoodPlaces(payload, entries) {
  const fail = (message) => {
    throw new Error(`Food data: ${message}`);
  };
  if (
    payload?.version !== 1 ||
    !Array.isArray(payload.places) ||
    payload.places.length !== 8
  )
    fail('expected eight places');
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const ids = new Set(),
    orders = new Set();
  const localized = (value) =>
    value &&
    ['ja', 'en'].every(
      (lang) => typeof value[lang] === 'string' && value[lang].trim(),
    );
  for (const place of payload.places) {
    const entry = byId.get(place.entryId);
    if (
      entry?.floorId !== '1F' ||
      !entry?.polygons?.length ||
      ids.has(place.entryId)
    )
      fail(`unknown/duplicate entry ${place.entryId}`);
    ids.add(place.entryId);
    if (
      !Number.isInteger(place.order) ||
      place.order < 1 ||
      place.order > 8 ||
      orders.has(place.order)
    )
      fail('invalid order');
    orders.add(place.order);
    for (const key of ['name', 'building', 'summary'])
      if (!localized(place[key])) fail(`${place.entryId}: ${key}`);
    if (
      place.name.ja !== entry.label ||
      place.name.en !== (entry.labelEn || entry.label)
    )
      fail('name differs from search');
    if (place.summary.ja.length > 60 || place.summary.en.length > 140)
      fail('summary too long');
    for (const lang of ['ja', 'en']) {
      if (
        !Array.isArray(place.shortLabel?.[lang]) ||
        !place.shortLabel[lang].length ||
        place.shortLabel[lang].length > 3
      )
        fail('short label');
      const anchor = place.anchor?.[lang];
      if (
        ![anchor?.xRatio, anchor?.yRatio].every(
          (v) => Number.isFinite(v) && v >= 0 && v <= 1,
        )
      )
        fail('anchor');
      const offset = place.areaOffset?.[lang];
      if (![offset?.xRatio, offset?.yRatio].every(Number.isFinite))
        fail('area offset');
      if (
        !entry.polygons.some((p) =>
          containsPoint(
            {
              x: anchor.xRatio - offset.xRatio,
              y: anchor.yRatio - offset.yRatio,
            },
            p,
          ),
        )
      )
        fail('anchor outside area');
    }
    if (
      !place.mark ||
      !/^\/food-marks\/[\w-]+-fallback\.svg$/.test(place.mark.fallbackSrc)
    )
      fail('image mark and fallback required');
    if (
      place.mark &&
      (!/^\/food-marks\/[\w-]+\.(?:svg|png)$/.test(place.mark.src) ||
        !DATE.test(place.mark.createdAt) ||
        !DATE.test(place.mark.guidelineCheckedAt) ||
        (place.mark.guidelineUrl !== null &&
          !isHttpUrl(place.mark.guidelineUrl)))
    )
      fail('mark metadata');
    if (!isHttpUrl(place.links?.official)) fail('official link');
    for (const url of Object.values(place.links))
      if (url !== null && !isHttpUrl(url)) fail('link');
    if (
      !place.sources?.length ||
      place.sources.some(
        (s) =>
          !isHttpUrl(s.url) ||
          !DATE.test(s.checkedAt) ||
          !s.title ||
          !s.fields?.length,
      )
    )
      fail('sources');
    if (!place.services?.length) fail('services');
    const serviceIds = new Set();
    for (const service of place.services) {
      if (
        !service.id ||
        serviceIds.has(service.id) ||
        !localized(service.name) ||
        !Array.isArray(service.hours)
      )
        fail('service');
      serviceIds.add(service.id);
      if (
        service.coopScheduleName &&
        (typeof service.coopScheduleName !== 'string' || service.hours.length)
      )
        fail('mixed hours sources');
      for (const key of ['eatIn', 'takeaway', 'outsideFood', 'publicAccess']) {
        if (!['yes', 'no', 'unknown'].includes(service.usage?.[key]))
          fail('usage');
        if (
          service.usageNotes?.[key] !== null &&
          !localized(service.usageNotes?.[key])
        )
          fail('usage notes');
      }
      for (const version of service.hours) {
        if (
          !['regular', 'temporary'].includes(version.kind) ||
          !localized(version.text) ||
          !isHttpUrl(version.sourceUrl) ||
          !DATE.test(version.checkedAt)
        )
          fail('hours version');
        for (const key of ['validFrom', 'validThrough'])
          if (version[key] !== null && !DATE.test(version[key]))
            fail('hours date');
        if (
          version.validFrom &&
          version.validThrough &&
          version.validFrom > version.validThrough
        )
          fail('reversed period');
      }
      for (let i = 0; i < service.hours.length; i++)
        for (let j = i + 1; j < service.hours.length; j++) {
          const a = service.hours[i],
            b = service.hours[j];
          if (
            a.kind === b.kind &&
            (a.validFrom || '') <= (b.validThrough || '9999-12-31') &&
            (b.validFrom || '') <= (a.validThrough || '9999-12-31')
          )
            fail('overlapping hours versions');
        }
    }
  }
  return payload.places.slice().sort((a, b) => a.order - b.order);
}

export function containsPoint(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.yRatio > point.y !== b.yRatio > point.y &&
      point.x <
        ((b.xRatio - a.xRatio) * (point.y - a.yRatio)) / (b.yRatio - a.yRatio) +
          a.xRatio
    )
      inside = !inside;
  }
  return inside;
}

export function selectHoursVersions(hours, date = japaneseDate()) {
  const active = hours.filter(
    (h) =>
      (!h.validFrom || h.validFrom <= date) &&
      (!h.validThrough || h.validThrough >= date),
  );
  return active.sort(
    (a, b) => Number(b.kind === 'temporary') - Number(a.kind === 'temporary'),
  );
}

export function calendarDay(payload, name, now = new Date()) {
  if (
    !payload ||
    !Number.isFinite(Date.parse(payload.nextUpdateAt)) ||
    Date.parse(payload.nextUpdateAt) <= now.getTime()
  )
    return null;
  return (
    payload.stores
      ?.find((s) => s.name === name)
      ?.days?.find((day) => day.date === japaneseDate(now)) || null
  );
}

export function rectanglesOverlap(a, b, gap = 4) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

// Keep all eight pins at their true anchor; scale to separate neighboring icons.
export function placeFoodMarkers(points, mapWidth = 1190.55) {
  const sizes = new Map(
    points.map((p) => [
      p.id,
      Math.min(
        40,
        mapWidth * 0.035,
        ...points
          .filter((q) => q.id !== p.id)
          .map((q) => Math.hypot(p.x - q.x, p.y - q.y) * 0.8),
      ),
    ]),
  );
  const hit = 48;
  const clip = (polygon, nx, ny, d) => {
    const out = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const da = a.x * nx + a.y * ny - d,
        db = b.x * nx + b.y * ny - d;
      if (da <= 0) out.push(a);
      if (da <= 0 !== db <= 0) {
        const ratio = da / (da - db);
        out.push({
          x: a.x + (b.x - a.x) * ratio,
          y: a.y + (b.y - a.y) * ratio,
        });
      }
    }
    return out;
  };
  return {
    markers: points
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((p) => {
        const size = sizes.get(p.id),
          tail = size * 0.15;
        const center = { x: p.x, y: p.y - tail - size / 2 };
        let polygon = [
          { x: 0, y: 0 },
          { x: hit, y: 0 },
          { x: hit, y: hit },
          { x: 0, y: hit },
        ];
        // Split overlapping hit targets along the bisectors of their icon centres.
        for (const q of points) {
          if (q.id === p.id) continue;
          const qSize = sizes.get(q.id),
            qCenter = { x: q.x, y: q.y - qSize * 0.65 };
          const nx = qCenter.x - center.x,
            ny = qCenter.y - center.y;
          const midX = (center.x + qCenter.x) / 2 - (p.x - hit / 2);
          const midY = (center.y + qCenter.y) / 2 - (p.y - hit);
          polygon = clip(polygon, nx, ny, nx * midX + ny * midY);
        }
        return {
          ...p,
          size,
          hit,
          tail,
          clip: polygon
            .map((v) => `${v.x.toFixed(3)}px ${v.y.toFixed(3)}px`)
            .join(','),
        };
      }),
  };
}

// One request per page, deadline-based freshness, bounded retries and injected clock for tests.
export class CoopHoursClient {
  constructor({
    fetchImpl = (...args) => fetch(...args),
    now = () => new Date(),
    changed = () => {},
  } = {}) {
    Object.assign(this, {
      fetchImpl,
      now,
      changed,
      payload: null,
      pending: null,
      retryAt: 0,
      error: null,
    });
  }
  async refresh() {
    if (this.pending) return this.pending;
    if (this.now().getTime() < this.retryAt) return null;
    this.pending = (async () => {
      try {
        const response = await this.fetchImpl('/api/coop-hours', {
          cache: 'no-cache',
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error('Hours unavailable');
        const payload = await response.json();
        if (
          !Array.isArray(payload.stores) ||
          payload.stores.some((s) => !s.name || !Array.isArray(s.days)) ||
          !Array.isArray(payload.months) ||
          !isHttpUrl(payload.source?.url) ||
          !Number.isFinite(Date.parse(payload.nextUpdateAt)) ||
          Date.parse(payload.nextUpdateAt) <= this.now().getTime()
        )
          throw new Error('Hours expired');
        this.payload = payload;
        this.error = null;
        this.retryAt = 0;
        return payload;
      } catch (error) {
        console.warn('Food hours could not be refreshed:', error.message);
        this.payload = null;
        this.error = error;
        this.retryAt = this.now().getTime() + FOOD_RETRY_MS;
        return null;
      } finally {
        this.pending = null;
        this.changed();
      }
    })();
    return this.pending;
  }
  needsRefresh() {
    return (
      !this.payload ||
      Date.parse(this.payload.nextUpdateAt) <= this.now().getTime()
    );
  }
  nextCheck() {
    const date = new Date(this.now().getTime() + 9 * 3_600_000);
    date.setUTCHours(24, 0, 0, 0);
    const midnight = date.getTime() - 9 * 3_600_000;
    return Math.max(
      1,
      Math.min(
        midnight,
        this.retryAt ||
          Date.parse(this.payload?.nextUpdateAt) ||
          this.now().getTime(),
      ) - this.now().getTime(),
    );
  }
}
