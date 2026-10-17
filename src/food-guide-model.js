// Shared data, geometry and calendar rules. No DOM or network side effects.
export const FOOD_RETRY_MS = 60_000;
export const FOOD_STATUS_MS = 60_000;
export const FOOD_GESTURE_DISTANCE = 8;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

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
    !payload.places.length
  )
    fail('expected places');
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
    // A place inside another (OIC Café in OIC Cafeteria) has its own search
    // entry and pin but shares the other place's store area.
    const areaEntry = byId.get(place.areaEntryId ?? place.entryId);
    if (
      entry?.floorId !== '1F' ||
      areaEntry?.floorId !== '1F' ||
      !areaEntry?.polygons?.length ||
      ids.has(place.entryId)
    )
      fail(`unknown/duplicate entry ${place.entryId}`);
    ids.add(place.entryId);
    if (
      !Number.isInteger(place.order) ||
      place.order < 1 ||
      place.order > payload.places.length ||
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
    if (place.summary.ja.length > 80 || place.summary.en.length > 190)
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
        !areaEntry.polygons.some((p) =>
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
          !isHttpUrl(place.mark.guidelineUrl)) ||
        // optional share of the pin head the mark fills (default .72)
        (place.mark.size !== undefined &&
          !(typeof place.mark.size === 'number' && place.mark.size >= 0.5 && place.mark.size <= 0.95)))
    )
      fail('mark metadata');
    if (place.links?.official !== null && !isHttpUrl(place.links?.official)) fail('official link');
    for (const url of Object.values(place.links))
      if (url !== null && !isHttpUrl(url)) fail('link');
    if (
      !place.sources?.length ||
      place.sources.some(
        (s) =>
          (s.url !== null && !isHttpUrl(s.url)) ||
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
        if (!['yes', 'no', 'unknown', 'na'].includes(service.usage?.[key]))
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
          (version.sourceUrl !== null && !isHttpUrl(version.sourceUrl)) ||
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
      validateServiceStatus(service, fail);
    }
  }
  for (const place of payload.places)
    if (
      place.areaEntryId !== undefined &&
      !payload.places.some(
        (owner) => owner.entryId === place.areaEntryId && owner.areaEntryId === undefined,
      )
    )
      fail(`${place.entryId}: shared area must belong to another place`);
  for (const place of payload.places)
    if (place.todayTrucks !== undefined && !['plaza', 'terrace'].includes(place.todayTrucks))
      fail(`${place.entryId}: invalid todayTrucks`);
  const claimed = new Set();
  for (const place of payload.places) {
    if (place.areaPolygon === undefined) continue;
    const owner = payload.places.find((other) => other.entryId === place.areaEntryId);
    const count = owner ? byId.get(owner.entryId).polygons.length : 0;
    const key = `${place.areaEntryId}:${place.areaPolygon}`;
    if (!Number.isInteger(place.areaPolygon) || place.areaPolygon < 0 || place.areaPolygon >= count || claimed.has(key))
      fail(`${place.entryId}: invalid areaPolygon`);
    claimed.add(key);
  }
  if (!ids.has(payload.pinSizeReferenceEntryId)) fail('pin size reference');
  return payload.places.slice().sort((a, b) => a.order - b.order);
}

function clockMinutes(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function intervalCovers(interval, minutes) {
  const start = clockMinutes(interval.start);
  const end = clockMinutes(interval.end);
  if (end > start) return minutes >= start && minutes < end;
  if (end < start) return minutes >= start;
  return false;
}

function overnightSpill(interval, minutes) {
  const start = clockMinutes(interval.start);
  const end = clockMinutes(interval.end);
  return end < start && minutes < end;
}

function jstParts(now) {
  const shifted = new Date(now.getTime() + 9 * 3_600_000);
  return {
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

function validateIntervals(intervals, fail) {
  if (!Array.isArray(intervals) || !intervals.length) fail('status intervals');
  for (const interval of intervals) {
    if (!CLOCK.test(interval?.start) || !CLOCK.test(interval?.end) || interval.start === interval.end)
      fail('status clock');
  }
}

function validateWeekly(weekly, fail) {
  if (!weekly || typeof weekly !== 'object' || Array.isArray(weekly)) fail('status weekly');
  for (const [day, intervals] of Object.entries(weekly)) {
    if (!WEEKDAYS.includes(day)) fail('status weekday');
    validateIntervals(intervals, fail);
  }
}

function validateServiceStatus(service, fail) {
  if (service.status === undefined) return;
  const status = service.status;
  if (!status || typeof status.assignee !== 'string' || !status.assignee.trim()) fail('status assignee');
  if (service.coopScheduleName) {
    if (status.weekly !== undefined) validateWeekly(status.weekly, fail);
  } else if (service.hours.some((version) => version.days)) {
    for (const version of service.hours) if (version.days) validateWeekly(version.days, fail);
    if (status.weekly !== undefined) validateWeekly(status.weekly, fail);
  } else {
    validateWeekly(status.weekly, fail);
  }
  if (!isHttpUrl(status.sourceUrl)) fail('status source');
  if (
    !status.updateProcedure ||
    typeof status.updateProcedure.ja !== 'string' ||
    !status.updateProcedure.ja.trim() ||
    typeof status.updateProcedure.en !== 'string' ||
    !status.updateProcedure.en.trim()
  )
    fail('status procedure');
  if (typeof status.exceptionsConfirmed !== 'boolean') fail('status confirmation');
  // null = no expiry (the shop's own notice is the source and nothing dated is known); anything else must be a date.
  if (status.expiresAt !== null && !Number.isFinite(Date.parse(status.expiresAt))) fail('status expiry');
  if (!Array.isArray(status.exceptions)) fail('status exceptions');
  for (const exception of status.exceptions) {
    if (!DATE.test(exception?.date)) fail('status exception date');
    if (exception.closed === true) continue;
    validateIntervals(exception.intervals, fail);
  }
}

function judgeIntervals(weekly, minutes, weekday) {
  const todayIntervals = weekly[WEEKDAYS[weekday]] || [];
  const previousIntervals = weekly[WEEKDAYS[(weekday + 6) % 7]] || [];
  return (
    todayIntervals.some((interval) => intervalCovers(interval, minutes)) ||
    previousIntervals.some((interval) => overnightSpill(interval, minutes))
  );
}

export function judgeFoodServiceStatus(service, { now = new Date(), fetchFailed = false, payload = null } = {}) {
  const status = service?.status;
  if (!status?.assignee?.trim() || !isHttpUrl(status.sourceUrl)) return { state: 'disabled' };
  if (
    !status.updateProcedure?.ja?.trim() ||
    !status.updateProcedure?.en?.trim() ||
    (status.expiresAt !== null && !Number.isFinite(Date.parse(status.expiresAt)))
  ) {
    return { state: 'disabled' };
  }
  const hasWeekly = status.weekly && Object.keys(status.weekly).length > 0;
  const hasVersionDays = (service.hours || []).some((version) => version.days);
  if (!service.coopScheduleName && !hasWeekly && !hasVersionDays) return { state: 'disabled' };
  if (
    fetchFailed ||
    status.exceptionsConfirmed !== true ||
    (status.expiresAt !== null && Date.parse(status.expiresAt) <= now.getTime())
  ) {
    return { state: 'unknown' };
  }
  const { minutes, weekday } = jstParts(now);
  if (service.coopScheduleName) {
    if (!payload) return { state: 'disabled' };
    const day = calendarDay(payload, service.coopScheduleName, now);
    if (!day) return { state: 'unknown' };
    if (day.closed) return { state: 'outside' };
    if (day.allDay) return { state: 'within' };
    const open = (day.periods || []).some((period) => intervalCovers(period, minutes));
    return { state: open ? 'within' : 'outside' };
  }
  const versions = selectHoursVersions(service.hours || [], japaneseDate(now));
  if (!versions.length) return { state: 'unknown' };
  const weekly = versions[0].days || status.weekly;
  if (!weekly) return { state: 'unknown' };
  const today = japaneseDate(now);
  const exception = (status.exceptions || []).find((item) => item.date === today);
  if (exception) {
    const open =
      exception.closed === true
        ? false
        : exception.intervals.some((interval) => intervalCovers(interval, minutes));
    return { state: open ? 'within' : 'outside' };
  }
  return { state: judgeIntervals(weekly, minutes, weekday) ? 'within' : 'outside' };
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

export function formatFoodCalendarDate(isoDate, lang) {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en' : 'ja', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${isoDate}T00:00:00+09:00`));
}

function translatedPeriod(label, translate) {
  const key = `food.period.${label}`;
  const value = translate(key);
  return value === key ? label : value;
}

const WEEKDAY_LINE = /^\s*(平日|月[〜～–-]金|Mon[–-]Fri|Weekdays?)/i;
const WEEKEND_LINE = /^\s*(土日祝|土日|土・日|Sat|Weekends?)/i;

const MONTHS_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// "12/29〜1/3休" / "Closed Dec 29–Jan 3." -> { from: 1229, to: 103 } (month * 100 + day).
function closureRange(line) {
  const ja = line.match(/^\s*(\d{1,2})\/(\d{1,2})\s*[〜～~–-]\s*(\d{1,2})\/(\d{1,2})\s*休/);
  if (ja) return { from: ja[1] * 100 + +ja[2], to: ja[3] * 100 + +ja[4] };
  const en = line.match(/Closed\s+([A-Za-z]{3})[a-z]*\.?\s*(\d{1,2})\s*[–-]\s*([A-Za-z]{3})[a-z]*\.?\s*(\d{1,2})/i);
  if (en && MONTHS_EN[en[1].toLowerCase()] && MONTHS_EN[en[3].toLowerCase()])
    return { from: MONTHS_EN[en[1].toLowerCase()] * 100 + +en[2], to: MONTHS_EN[en[3].toLowerCase()] * 100 + +en[4] };
  return null;
}

// A version's text is split into one item per line, at "; ", and between time ranges
// ("11:30–15:00（…）、17:00–21:00（…）"). Then, for the compact card:
// - a closure period ("12/29〜1/3休") is shown only while today falls in it, and then it is the only
//   line; on every other day it is left out;
// - lines for weekdays or for weekends/holidays are kept only if they apply today (Japan time: a
//   Saturday, a Sunday or a listed holiday counts as weekend);
// - any other line (a single time range, a note) is kept.
export function pickTodaysHours(text, service, now = new Date()) {
  const lines = String(text)
    .split(/\n|;\s+|、(?=\d{1,2}:\d{2})|,\s+(?=\d{1,2}:\d{2})|\.\s+(?=Closed)/)
    .map((line) => line.trim())
    .filter(Boolean);
  const today = japaneseDate(now);
  const [, month, day] = today.match(/-(\d{2})-(\d{2})$/).map(Number);
  const key = month * 100 + day;
  const closing = lines.filter((line) => closureRange(line));
  const inClosure = closing.filter((line) => {
    const { from, to } = closureRange(line);
    return from <= to ? key >= from && key <= to : key >= from || key <= to;
  });
  if (inClosure.length) return inClosure.join('\n');
  const open = lines.filter((line) => !closureRange(line));
  if (!open.some((line) => WEEKDAY_LINE.test(line) || WEEKEND_LINE.test(line))) return open.join('\n');
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const holiday = (service.status?.exceptions || []).some((item) => item.date === today && !item.closed);
  const weekend = weekday === 0 || weekday === 6 || holiday;
  return open
    .filter((line) => {
      if (WEEKDAY_LINE.test(line)) return !weekend;
      if (WEEKEND_LINE.test(line)) return weekend;
      return true;
    })
    .join('\n');
}

export function describeFoodServiceHours(
  service,
  {
    text,
    translate,
    lang = 'ja',
    payload = null,
    loading = false,
    compact = false,
    now = new Date(),
  } = {},
) {
  if (service.coopScheduleName) {
    const day = calendarDay(payload, service.coopScheduleName, now);
    if (!day) {
      return {
        kind: 'message',
        text: translate(loading ? 'food.hoursLoading' : 'food.hoursUnknown'),
      };
    }
    const periods = day.periods;
    let copy = day.closed
      ? translate('food.closedDay')
      : day.allDay
        ? translate('food.allDay')
        : periods
            .map((period) =>
              `${period.label ? translatedPeriod(period.label, translate) : ''} ${period.start}–${period.end}`.trim(),
            )
            .join('\n');
    if (!copy) copy = day.text;
    const month = payload.months?.find((item) => item.month === day.date.slice(0, 7));
    return {
      kind: 'coop',
      dateLabel: formatFoodCalendarDate(day.date, lang),
      text: copy,
      sourceUrl: month?.url || payload.source?.url || '',
    };
  }
  const versions = selectHoursVersions(service.hours, japaneseDate(now));
  if (!versions.length) {
    return { kind: 'message', text: translate('food.hoursUnknown') };
  }
  const shown = versions.slice(0, compact ? 1 : undefined);
  return {
    kind: 'versions',
    // a service open on changing days shows today's date above its hours
    dateLabel: service.showToday ? formatFoodCalendarDate(japaneseDate(now), lang) : null,
    versions: shown.map((version) => {
      const period = [version.validFrom, version.validThrough].filter(Boolean).join('〜');
      const title =
        version.kind === 'temporary'
          ? translate('food.temporary') + (period ? ` (${period})` : '')
          : versions.some((item) => item.kind === 'temporary')
            ? translate('food.regular')
            : period || '';
      const full = text(version.text);
      return {
        kind: version.kind,
        title,
        text: full,
        todayText: pickTodaysHours(full, service, now),
      };
    }),
  };
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

// Diameter of the map's round facility pictograms: 8.094 units of the
// 1190.55-unit floor viewBox. Zoomed in, pins grow to match them.
export const FOOD_PIN_MIN_DIAMETER_RATIO = 8.094 / 1190.55;

// Keep every pin at its true anchor; scale to separate neighboring icons,
// but never draw them smaller than the facility pictograms around them.
export function placeFoodMarkers(
  points,
  mapWidth = 1190.55,
  referenceId = null,
) {
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
  const commonSize = Math.max(
    sizes.get(referenceId) ?? Math.min(...sizes.values()),
    mapWidth * FOOD_PIN_MIN_DIAMETER_RATIO,
  );
  for (const point of points) sizes.set(point.id, commonSize);
  // 48px fits pins up to 40px; larger pins need room for the tail, ring and lift.
  const hit = commonSize > 40 ? Math.ceil(commonSize * 1.3 + 4) : 48;
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
