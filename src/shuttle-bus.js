// シャトルバス（OIC → BKC・衣笠）の時刻表カード。
// 日本語の /timetable/ と、英語の /en/timetable/（リンク集）が同じ表示を使う。
// 運行日と発車時刻は、立命館大学の「シャトルバス運行表」「運行日」のPDF（下の timetableUrl / scheduleUrl）の内容。
// 学期が替わったら operationDateRanges と departures を書き換える。

const ONE_DAY = 24 * 60 * 60 * 1000;

const SHUTTLE_BUS = {
  sourceUrl: 'https://www.ritsumei.ac.jp/infostudents/shuttlebus/',
  timetableUrl: 'https://www.ritsumei.ac.jp/file.jsp?id=650649',
  scheduleUrl: 'https://www.ritsumei.ac.jp/file.jsp?id=650650',
  // 2026年9月28日から、乗車には事前の予約と PayPay の決済が必要（LINE のミニアプリ）。
  // 予約は公式 LINE アカウント（チラシの QR コードの URL）から、手順は利用者向けマニュアルに載っている。
  reservationUrl: 'https://lin.ee/pZeDOcd',
  manualUrl: 'https://www.ritsumei.ac.jp/file.jsp?id=705941',
  // 運行日（土日を除く平日のうち、この期間にあたる日）。
  operationDateRanges: [
    ['2026-04-01', '2026-04-30'],
    ['2026-05-01', '2026-05-01'],
    ['2026-05-07', '2026-05-29'],
    ['2026-06-01', '2026-06-30'],
    ['2026-07-01', '2026-07-15'],
    ['2026-09-28', '2026-09-30'],
    ['2026-10-01', '2026-10-30'],
    ['2026-11-02', '2026-11-30'],
    ['2026-12-01', '2026-12-25']
  ],
  routes: [
    {
      id: 'bkc',
      destination: 'びわこ・くさつキャンパス',
      destinationEn: 'Biwako-Kusatsu Campus',
      shortName: 'BKC',
      departures: ['15:05', '16:50', '18:35', '20:10']
    },
    {
      id: 'kinugasa',
      destination: '衣笠キャンパス',
      destinationEn: 'Kinugasa Campus',
      shortName: 'KIC',
      departures: ['15:00', '16:45', '18:30', '20:05']
    }
  ]
};

const LABELS = {
  ja: {
    heading: 'シャトルバス時刻表',
    nextDeparture: '次の発車',
    reserve: 'LINEで予約',
    manual: '予約マニュアル',
    officialPage: '公式ページ',
    timetablePdf: '時刻表PDF',
    schedulePdf: '運行日PDF',
    noService: '運行期間外',
    departing: 'まもなく発車',
    today: '本日',
    tomorrow: '翌日',
    countdown: (days, hours, minutes) => {
      if (days > 0) return `あと${days}日${hours}時間`;
      if (hours > 0) return `あと${hours}時間${minutes}分`;
      return `あと${minutes}分`;
    }
  },
  en: {
    heading: 'Shuttle Bus Timetable',
    nextDeparture: 'Next departure',
    reserve: 'Reserve on LINE',
    manual: 'Reservation manual',
    officialPage: 'Official page',
    timetablePdf: 'Timetable PDF',
    schedulePdf: 'Service schedule PDF',
    noService: 'Outside service period',
    departing: 'Departing now',
    today: 'Today',
    tomorrow: 'Tomorrow',
    countdown: (days, hours, minutes) => {
      if (days > 0) return `in ${days} d ${hours} h`;
      if (hours > 0) return `in ${hours} h ${minutes} min`;
      return `in ${minutes} min`;
    }
  }
};

// element: 空の <section class="section timetable-shuttle" aria-labelledby="shuttle-bus-title">。
export function mountShuttleBusCard(element, { lang = 'ja' } = {}) {
  if (!element) return;
  const labels = LABELS[lang] || LABELS.ja;
  const useEnglish = lang === 'en';

  const rows = SHUTTLE_BUS.routes.map((route) => `
    <article class="timetable-shuttle-route" data-shuttle-route="${escapeHtml(route.id)}" aria-labelledby="shuttle-route-${escapeHtml(route.id)}">
      <p class="timetable-shuttle-path">OIC → ${escapeHtml(route.shortName)}</p>
      <h3 id="shuttle-route-${escapeHtml(route.id)}" class="timetable-shuttle-destination">${escapeHtml(useEnglish ? route.destinationEn : route.destination)}</h3>
      <p class="timetable-shuttle-label">${escapeHtml(labels.nextDeparture)}</p>
      <p class="timetable-shuttle-next">
        <span class="timetable-shuttle-day" data-shuttle-day="${escapeHtml(route.id)}"></span>
        <time class="timetable-shuttle-time" data-shuttle-next="${escapeHtml(route.id)}">--:--</time>
      </p>
      <p class="timetable-shuttle-countdown" data-shuttle-countdown="${escapeHtml(route.id)}"></p>
    </article>
  `).join('');

  element.innerHTML = `
    <div class="section-head">
      <h2 id="shuttle-bus-title" class="section-title">${escapeHtml(labels.heading)}</h2>
    </div>
    <div class="section-body">
      <div class="timetable-shuttle-routes">${rows}</div>
      <p class="timetable-shuttle-links">
        ${renderExternalLink(SHUTTLE_BUS.reservationUrl, labels.reserve, 'timetable-line-link')}
        ${renderExternalLink(SHUTTLE_BUS.manualUrl, labels.manual)}
        ${renderExternalLink(SHUTTLE_BUS.sourceUrl, labels.officialPage)}
        ${renderExternalLink(SHUTTLE_BUS.timetableUrl, labels.timetablePdf)}
        ${renderExternalLink(SHUTTLE_BUS.scheduleUrl, labels.schedulePdf)}
      </p>
    </div>
  `;

  const update = () => updateDepartures(element, labels);
  update();
  window.setInterval(update, 1000);
}

function updateDepartures(element, labels) {
  const now = getJapanNow();

  SHUTTLE_BUS.routes.forEach((route) => {
    const next = getNextDeparture(route, now);
    const routeElement = element.querySelector(`[data-shuttle-route="${route.id}"]`);
    const dayElement = element.querySelector(`[data-shuttle-day="${route.id}"]`);
    const nextElement = element.querySelector(`[data-shuttle-next="${route.id}"]`);
    const countdownElement = element.querySelector(`[data-shuttle-countdown="${route.id}"]`);

    routeElement?.classList.toggle('is-out-of-service', !next);

    if (!next) {
      setText(dayElement, '');
      setText(nextElement, labels.noService);
      nextElement?.removeAttribute('datetime');
      setText(countdownElement, '');
      return;
    }

    setText(dayElement, formatDayLabel(next.date, now, labels));
    setText(nextElement, formatTimeValue(next.date));
    nextElement?.setAttribute('datetime', `${formatDateValue(next.date)}T${formatTimeValue(next.date)}`);
    setText(countdownElement, formatCountdown(next.date.getTime() - now.getTime(), labels));
  });
}

// テスト用: routeId の次の発車を返す。now は端末の時計のまま読む（日本時間の壁時計）。
export function nextShuttleDeparture(routeId, now) {
  const route = SHUTTLE_BUS.routes.find((item) => item.id === routeId);
  return route ? getNextDeparture(route, now)?.date ?? null : null;
}

function getNextDeparture(route, now) {
  const today = startOfDay(now);

  for (let offset = 0; offset < 370; offset += 1) {
    const operationDate = new Date(today.getTime() + offset * ONE_DAY);
    if (!isOperationDate(operationDate)) continue;

    for (const time of route.departures) {
      const candidate = buildDateTime(operationDate, time);
      if (candidate.getTime() >= now.getTime()) {
        return { date: candidate, time };
      }
    }
  }

  return null;
}

function isOperationDate(date) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;

  const value = formatDateValue(date);
  return SHUTTLE_BUS.operationDateRanges.some(([start, end]) => value >= start && value <= end);
}

function buildDateTime(date, time) {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDayLabel(date, now, labels) {
  const today = startOfDay(now).getTime();
  const departureDay = startOfDay(date).getTime();

  if (departureDay === today) return labels.today;
  if (departureDay === today + ONE_DAY) return labels.tomorrow;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// Minute precision is enough here: the departure time is the primary figure.
function formatCountdown(milliseconds, labels) {
  const totalMinutes = Math.ceil(Math.max(0, milliseconds) / 60000);
  if (totalMinutes < 1) return labels.departing;

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return labels.countdown(days, hours, minutes);
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeValue(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// 日本時間の「いま」を、端末のタイムゾーンに関係なくそのまま読める Date にして返す。
function getJapanNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(
    Number(value.year),
    Number(value.month) - 1,
    Number(value.day),
    Number(value.hour),
    Number(value.minute),
    Number(value.second)
  );
}

function setText(element, value) {
  if (element && element.textContent !== value) {
    element.textContent = value;
  }
}

function renderExternalLink(url, label, className = 'timetable-quiet-link') {
  return `<a class="${className} external" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => (
    {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]
  ));
}
