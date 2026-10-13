const TODAY = getJapanDate();
const ONE_DAY = 24 * 60 * 60 * 1000;
const PAGE_LANG = getPageLanguage();

const LABELS = {
  ja: {
    stationSuffix: '駅',
    weekday: '平日',
    holiday: '休日',
    saturdayHoliday: '土曜・休日',
    today: '本日',
    tomorrow: '翌日',
    modeDayType: '曜日種別を選んで公式ページへ',
    modeMonorail: '曜日種別を選び、公式ページ内の該当列を確認',
    modeDate: '表示日つきで公式ページへ',
    officialPage: '公式ページ',
    serviceStatusEyebrow: 'Service status',
    serviceStatusHeading: '運行情報を確認',
    shuttleEyebrow: 'Shuttle bus',
    shuttleHeading: 'シャトルバス時刻表',
    shuttleNextDeparture: '次の発車',
    shuttleCountdown: '発車まで',
    shuttleTimetablePdf: '時刻表PDF',
    shuttleSchedulePdf: '運行日PDF',
    shuttleNoService: '運行期間外',
    shuttleDeparting: 'まもなく発車',
    countdown: (days, hours, minutes) => {
      if (days > 0) return `あと${days}日${hours}時間`;
      if (hours > 0) return `あと${hours}時間${minutes}分`;
      return `あと${minutes}分`;
    },
    timetableFor: (station, direction, label) => `${station} ${direction} ${label}の時刻表`,
    newTab: '（新しいタブで開く）',
    openServiceStatus: '公式運行情報',
    openOfficialX: '公式X',
    selectPrompt: '選択してください',
    monorailWeekday: '平日用（月〜金）',
    monorailHoliday: '休日用（土・日・祝日）',
    monorailHelp: (dayType, direction) =>
      `大阪モノレール公式ページ内で「${dayType}」タブを開き、「${direction}」列を確認してください。`
  },
  en: {
    stationSuffix: ' Station',
    weekday: 'Weekday',
    holiday: 'Weekend/Holiday',
    saturdayHoliday: 'Saturday/Holiday',
    today: 'Today',
    tomorrow: 'Tomorrow',
    modeDayType: 'Open the official page by day type',
    modeMonorail: 'Choose a day type and check the matching column on the official page',
    modeDate: 'Open the official page with a display date',
    officialPage: 'Official page',
    serviceStatusEyebrow: 'Service status',
    serviceStatusHeading: 'Service Status',
    shuttleEyebrow: 'Shuttle bus',
    shuttleHeading: 'Shuttle Bus Timetable',
    shuttleNextDeparture: 'Next departure',
    shuttleCountdown: 'Until departure',
    shuttleTimetablePdf: 'Timetable PDF',
    shuttleSchedulePdf: 'Service schedule PDF',
    shuttleNoService: 'Outside service period',
    shuttleDeparting: 'Departing now',
    countdown: (days, hours, minutes) => {
      if (days > 0) return `in ${days} d ${hours} h`;
      if (hours > 0) return `in ${hours} h ${minutes} min`;
      return `in ${minutes} min`;
    },
    timetableFor: (station, direction, label) => `${station}, ${direction}: ${label} timetable`,
    newTab: ' (opens in a new tab)',
    openServiceStatus: 'Official status',
    openOfficialX: 'Official X',
    selectPrompt: 'Select an option',
    monorailWeekday: 'weekday',
    monorailHoliday: 'weekend/holiday',
    monorailHelp: (dayType, direction) =>
      `On the Osaka Monorail official page, open the ${dayType} tab and check the ${direction} column.`
  }
};

const RAILWAYS = [
  {
    id: 'osaka-monorail',
    name: '大阪モノレール',
    nameEn: 'Osaka Monorail',
    accent: '#0072bc',
    note: '公式駅時刻表ページを開きます。方面・曜日は公式ページ側で確認してください。',
    stations: [
      {
        id: 'unobe',
        name: '宇野辺',
        nameEn: 'Unobe',
        directions: [
          {
            id: 'osaka-airport',
            name: '大阪空港方面',
            nameEn: 'Toward Osaka Airport',
            mode: 'monorail',
            url: 'https://www.osaka-monorail.co.jp/station/r18_unobe/timetable/'
          },
          {
            id: 'kadomashi',
            name: '門真市方面',
            nameEn: 'Toward Kadomashi',
            mode: 'monorail',
            url: 'https://www.osaka-monorail.co.jp/station/r18_unobe/timetable/'
          }
        ]
      },
      {
        id: 'minami-ibaraki',
        name: '南茨木',
        nameEn: 'Minami-ibaraki',
        directions: [
          {
            id: 'osaka-airport',
            name: '大阪空港方面',
            nameEn: 'Toward Osaka Airport',
            mode: 'monorail',
            url: 'https://www.osaka-monorail.co.jp/station/r19_minami_iba/timetable/'
          },
          {
            id: 'kadomashi',
            name: '門真市方面',
            nameEn: 'Toward Kadomashi',
            mode: 'monorail',
            url: 'https://www.osaka-monorail.co.jp/station/r19_minami_iba/timetable/'
          }
        ]
      }
    ]
  },
  {
    id: 'hankyu',
    name: '阪急電鉄',
    nameEn: 'Hankyu Railway',
    accent: '#7b3f2a',
    note: '南茨木駅の公式時刻表ページを、方面と曜日種別ごとに開きます。',
    stations: [
      {
        id: 'minami-ibaraki',
        name: '南茨木',
        nameEn: 'Minami-ibaraki',
        directions: [
          {
            id: 'osaka',
            name: '大阪梅田・天下茶屋方面',
            nameEn: 'Toward Osaka-umeda / Tengachaya',
            mode: 'dayType',
            urls: {
              weekday: 'https://www.hankyu.co.jp/station/html/HK-68_ky_1_w.html',
              holiday: 'https://www.hankyu.co.jp/station/html/HK-68_ky_1_h.html'
            }
          },
          {
            id: 'kyoto',
            name: '京都河原町方面',
            nameEn: 'Toward Kyoto-kawaramachi',
            mode: 'dayType',
            urls: {
              weekday: 'https://www.hankyu.co.jp/station/html/HK-68_ky_2_w.html',
              holiday: 'https://www.hankyu.co.jp/station/html/HK-68_ky_2_h.html'
            }
          }
        ]
      }
    ]
  },
  {
    id: 'jr-west',
    name: 'JR西日本',
    nameEn: 'JR West',
    accent: '#0068b7',
    note: 'JR西日本公式時刻表を、表示日つきで開きます。',
    stations: [
      {
        id: 'ibaraki',
        name: '茨木',
        nameEn: 'Ibaraki',
        directions: [
          {
            id: 'kyoto',
            name: '京都方面',
            nameEn: 'Toward Kyoto',
            mode: 'date',
            timetableId: '2791011001'
          },
          {
            id: 'osaka-kobe',
            name: '大阪・神戸方面',
            nameEn: 'Toward Osaka / Kobe',
            mode: 'date',
            timetableId: '2791011002'
          }
        ]
      }
    ]
  }
];

const OFFICIAL_CARD_ORDER = [
  ['osaka-monorail', 'unobe'],
  ['osaka-monorail', 'minami-ibaraki'],
  ['jr-west', 'ibaraki'],
  ['hankyu', 'minami-ibaraki']
];

const SERVICE_STATUS_LINKS = [
  {
    id: 'hankyu-kyoto',
    railway: '阪急電鉄',
    railwayEn: 'Hankyu Railway',
    line: '阪急京都線',
    lineEn: 'Hankyu Kyoto Line',
    accent: '#7b3f2a',
    statusUrl: 'https://www.hankyu.co.jp/railinfo/',
    xUrl: null
  },
  {
    id: 'osaka-monorail',
    railway: '大阪モノレール',
    railwayEn: 'Osaka Monorail',
    line: '大阪モノレール',
    lineEn: 'Osaka Monorail',
    accent: '#0072bc',
    statusUrl: 'https://www.osaka-monorail.co.jp/',
    xUrl: 'https://twitter.com/OsakaMonorail'
  },
  {
    id: 'jr-kyoto',
    railway: 'JR西日本',
    railwayEn: 'JR West',
    line: 'JR京都線',
    lineEn: 'JR Kyoto Line',
    accent: '#0068b7',
    statusUrl: 'https://trafficinfo.westjr.co.jp/kinki.html',
    xUrl: 'https://twitter.com/jrwest_kinki_a'
  }
];

const SHUTTLE_BUS = {
  accent: '#991c27',
  sourceUrl: 'https://www.ritsumei.ac.jp/infostudents/shuttlebus/',
  timetableUrl: 'https://www.ritsumei.ac.jp/file.jsp?id=650649',
  scheduleUrl: 'https://www.ritsumei.ac.jp/file.jsp?id=650650',
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

const elements = {
  form: document.querySelector('[data-timetable-link-form]'),
  railway: document.querySelector('[data-railway-select]'),
  station: document.querySelector('[data-station-select]'),
  direction: document.querySelector('[data-direction-select]'),
  dayTypeField: document.querySelector('[data-day-type-field]'),
  dayType: document.querySelector('[data-day-type-select]'),
  dateField: document.querySelector('[data-date-field]'),
  dateInput: document.querySelector('[data-date-input]'),
  generatedLink: document.querySelector('[data-generated-link]'),
  help: document.querySelector('[data-link-help]'),
  cardGrid: document.querySelector('[data-official-card-grid]'),
  shuttleBus: document.querySelector('[data-shuttle-bus-card]'),
  serviceStatus: document.querySelector('[data-service-status-card]')
};

let shuttleBusTimer = null;

function initTimetableLinks() {
  if (elements.cardGrid) {
    renderOfficialCards();
  }

  if (elements.shuttleBus) {
    renderShuttleBusCard();
  }

  if (elements.serviceStatus) {
    renderServiceStatusCard();
  }

  if (!elements.form) return;

  elements.dateInput.value = formatDateValue(TODAY);
  populateRailways();
  updateStationOptions();
  updateGeneratedLink();

  elements.railway.addEventListener('change', () => {
    updateStationOptions();
    updateGeneratedLink();
  });
  elements.station.addEventListener('change', () => {
    updateDirectionOptions();
    updateGeneratedLink();
  });
  elements.direction.addEventListener('change', updateGeneratedLink);
  elements.dayType.addEventListener('change', updateGeneratedLink);
  elements.dateInput.addEventListener('change', updateGeneratedLink);
  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const url = resolveSelectedUrl();
    if (!url) return;

    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      elements.generatedLink.focus();
    }
  });
}

function populateRailways() {
  elements.railway.innerHTML = RAILWAYS.map((railway) => optionHtml(railway.id, railway.name)).join('');
}

function updateStationOptions() {
  const railway = getSelectedRailway();
  elements.station.innerHTML = railway.stations.map((station) => optionHtml(station.id, station.name)).join('');
  updateDirectionOptions();
}

function updateDirectionOptions() {
  const station = getSelectedStation();
  elements.direction.innerHTML = station.directions
    .map((direction) => optionHtml(direction.id, direction.name))
    .join('');
  updateFieldVisibility();
}

function updateFieldVisibility() {
  const direction = getSelectedDirection();
  const usesDayType = direction.mode === 'dayType' || direction.mode === 'monorail';
  const usesDate = direction.mode === 'date';

  elements.dayTypeField.hidden = !usesDayType;
  elements.dateField.hidden = !usesDate;
  elements.dayType.disabled = !usesDayType;
  elements.dateInput.disabled = !usesDate;
}

function updateGeneratedLink() {
  updateFieldVisibility();
  const url = resolveSelectedUrl();
  const railway = getSelectedRailway();
  const direction = getSelectedDirection();
  elements.generatedLink.href = url || '#';
  elements.generatedLink.textContent = url || t('selectPrompt');
  elements.help.textContent = direction.mode === 'monorail' ? monorailHelpText(direction) : railway.note;
}

function renderOfficialCards() {
  elements.cardGrid.innerHTML = OFFICIAL_CARD_ORDER.map(([railwayId, stationId]) => {
    const railway = RAILWAYS.find((item) => item.id === railwayId);
    const station = railway?.stations.find((item) => item.id === stationId);
    return railway && station ? renderOfficialCard(railway, station) : '';
  }).join('');
}

function renderOfficialCard(railway, station) {
  const stationName = `${localizeName(station)}${t('stationSuffix')}`;
  const rows = station.directions
    .map((direction) => {
      const directionName = localizeName(direction);
      const links = resolveDirectionLinks(direction);
      return `
        <li class="timetable-direction">
          <span class="timetable-direction-name">${escapeHtml(directionName)}</span>
          <span class="timetable-direction-links">
            ${links
              .map(
                (link) => `
                  <a
                    class="btn btn-quiet timetable-day-link external"
                    href="${escapeHtml(link.url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="${escapeHtml(`${t('timetableFor')(stationName, directionName, link.label)}${t('newTab')}`)}"
                  >${escapeHtml(link.label)}</a>
                `
              )
              .join('')}
          </span>
        </li>
      `;
    })
    .join('');

  return `
    <li class="timetable-station">
      <div class="timetable-station-head">
        <h3 class="timetable-station-name">${escapeHtml(stationName)}</h3>
        ${renderRailwayLabel(localizeName(railway), railway.accent)}
      </div>
      <ul class="timetable-directions">${rows}</ul>
    </li>
  `;
}

function renderRailwayLabel(name, color) {
  return `
    <p class="timetable-railway">
      <span class="timetable-railway-mark" style="--railway-color: ${escapeHtml(color)};" aria-hidden="true"></span>${escapeHtml(name)}
    </p>
  `;
}

function renderExternalLink(url, label, className = 'timetable-quiet-link') {
  return `<a class="${className} external" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function renderSectionHead(id, eyebrow, title) {
  return `
    <div class="section-head">
      <p class="section-eyebrow">${escapeHtml(eyebrow)}</p>
      <h2 id="${escapeHtml(id)}" class="section-title">${escapeHtml(title)}</h2>
    </div>
  `;
}

function renderServiceStatusCard() {
  const rows = SERVICE_STATUS_LINKS.map((item) => {
    const links = [
      renderExternalLink(item.statusUrl, t('openServiceStatus')),
      item.xUrl ? renderExternalLink(item.xUrl, t('openOfficialX')) : ''
    ].join('');

    return `
      <li class="timetable-status-row">
        <div class="timetable-status-line">
          <span class="timetable-railway-mark" style="--railway-color: ${escapeHtml(item.accent)};" aria-hidden="true"></span>
          <div>
            <h3 class="timetable-status-line-name">${escapeHtml(localizeLine(item, 'line'))}</h3>
            ${
              localizeLine(item, 'line') === localizeLine(item, 'railway')
                ? ''
                : `<p class="timetable-status-railway">${escapeHtml(localizeLine(item, 'railway'))}</p>`
            }
          </div>
        </div>
        <div class="timetable-status-links">${links}</div>
      </li>
    `;
  }).join('');

  elements.serviceStatus.innerHTML = `
    ${renderSectionHead('service-status-title', t('serviceStatusEyebrow'), t('serviceStatusHeading'))}
    <div class="section-body">
      <ul class="rule-list timetable-status-list">${rows}</ul>
    </div>
  `;
}

function renderShuttleBusCard() {
  const rows = SHUTTLE_BUS.routes.map((route) => `
    <article class="timetable-shuttle-route" data-shuttle-route="${escapeHtml(route.id)}" aria-labelledby="shuttle-route-${escapeHtml(route.id)}">
      <p class="timetable-shuttle-path">OIC → ${escapeHtml(localizeShuttleRoute(route, 'shortName'))}</p>
      <h3 id="shuttle-route-${escapeHtml(route.id)}" class="timetable-shuttle-destination">${escapeHtml(localizeShuttleRoute(route, 'destination'))}</h3>
      <p class="timetable-shuttle-label">${escapeHtml(t('shuttleNextDeparture'))}</p>
      <p class="timetable-shuttle-next">
        <span class="timetable-shuttle-day" data-shuttle-day="${escapeHtml(route.id)}"></span>
        <time class="timetable-shuttle-time" data-shuttle-next="${escapeHtml(route.id)}">--:--</time>
      </p>
      <p class="timetable-shuttle-countdown" data-shuttle-countdown="${escapeHtml(route.id)}"></p>
    </article>
  `).join('');

  elements.shuttleBus.innerHTML = `
    ${renderSectionHead('shuttle-bus-title', t('shuttleEyebrow'), t('shuttleHeading'))}
    <div class="section-body">
      <div class="timetable-shuttle-routes">${rows}</div>
      <p class="timetable-shuttle-links">
        ${renderExternalLink(SHUTTLE_BUS.sourceUrl, t('officialPage'))}
        ${renderExternalLink(SHUTTLE_BUS.timetableUrl, t('shuttleTimetablePdf'))}
        ${renderExternalLink(SHUTTLE_BUS.scheduleUrl, t('shuttleSchedulePdf'))}
      </p>
    </div>
  `;

  updateShuttleBusDepartures();

  if (!shuttleBusTimer) {
    shuttleBusTimer = window.setInterval(updateShuttleBusDepartures, 1000);
  }
}

function updateShuttleBusDepartures() {
  if (!elements.shuttleBus) return;

  const now = getJapanNow();

  SHUTTLE_BUS.routes.forEach((route) => {
    const next = getNextShuttleDeparture(route, now);
    const routeElement = elements.shuttleBus.querySelector(`[data-shuttle-route="${route.id}"]`);
    const dayElement = elements.shuttleBus.querySelector(`[data-shuttle-day="${route.id}"]`);
    const nextElement = elements.shuttleBus.querySelector(`[data-shuttle-next="${route.id}"]`);
    const countdownElement = elements.shuttleBus.querySelector(`[data-shuttle-countdown="${route.id}"]`);

    routeElement?.classList.toggle('is-out-of-service', !next);

    if (!next) {
      setText(dayElement, '');
      setText(nextElement, t('shuttleNoService'));
      nextElement?.removeAttribute('datetime');
      setText(countdownElement, '');
      return;
    }

    setText(dayElement, formatShuttleDayLabel(next.date, now));
    setText(nextElement, formatTimeValue(next.date));
    nextElement?.setAttribute('datetime', `${formatDateValue(next.date)}T${formatTimeValue(next.date)}`);
    setText(countdownElement, formatCountdown(next.date.getTime() - now.getTime()));
  });
}

function setText(element, value) {
  if (element && element.textContent !== value) {
    element.textContent = value;
  }
}

function getNextShuttleDeparture(route, now) {
  const today = startOfDay(now);

  for (let offset = 0; offset < 370; offset += 1) {
    const operationDate = new Date(today.getTime() + offset * ONE_DAY);
    if (!isShuttleOperationDate(operationDate)) continue;

    for (const time of route.departures) {
      const candidate = buildDateTime(operationDate, time);
      if (candidate.getTime() >= now.getTime()) {
        return { date: candidate, time };
      }
    }
  }

  return null;
}

function isShuttleOperationDate(date) {
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

function formatShuttleDayLabel(date, now) {
  const today = startOfDay(now).getTime();
  const departureDay = startOfDay(date).getTime();

  if (departureDay === today) return t('today');
  if (departureDay === today + ONE_DAY) return t('tomorrow');
  return formatShuttleDate(date);
}

function formatShuttleDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// Minute precision is enough here: the departure time is the primary figure.
function formatCountdown(milliseconds) {
  const totalMinutes = Math.ceil(Math.max(0, milliseconds) / 60000);
  if (totalMinutes < 1) return t('shuttleDeparting');

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return t('countdown')(days, hours, minutes);
}

function resolveDirectionLinks(direction) {
  if (direction.mode === 'dayType') {
    return [
      { label: t('weekday'), url: direction.urls.weekday },
      { label: t('saturdayHoliday'), url: direction.urls.holiday }
    ];
  }

  if (direction.mode === 'monorail') {
    return [
      { label: t('weekday'), url: monorailUrl(direction.url, 'weekday') },
      { label: t('holiday'), url: monorailUrl(direction.url, 'holiday') }
    ];
  }

  if (direction.mode === 'date') {
    const today = formatDateCompact(TODAY);
    const tomorrow = formatDateCompact(new Date(TODAY.getTime() + ONE_DAY));
    return [
      { label: t('today'), url: jrUrl(direction.timetableId, today) },
      { label: t('tomorrow'), url: jrUrl(direction.timetableId, tomorrow) }
    ];
  }

  return [{ label: t('officialPage'), url: direction.url }];
}

function resolveSelectedUrl() {
  const direction = getSelectedDirection();
  if (direction.mode === 'dayType') {
    return direction.urls[elements.dayType.value] || direction.urls.weekday;
  }

  if (direction.mode === 'monorail') {
    return monorailUrl(direction.url, elements.dayType.value);
  }

  if (direction.mode === 'date') {
    const date = elements.dateInput.value || formatDateValue(TODAY);
    return jrUrl(direction.timetableId, date.replaceAll('-', ''));
  }

  return direction.url;
}

function jrUrl(timetableId, date) {
  return `https://timetable.jr-odekake.net/station-timetable/${encodeURIComponent(timetableId)}?date=${date}`;
}

function monorailUrl(url, dayType) {
  return `${url}${dayType === 'holiday' ? '#tab__02' : '#tab__01'}`;
}

function getSelectedRailway() {
  return RAILWAYS.find((railway) => railway.id === elements.railway.value) || RAILWAYS[0];
}

function getSelectedStation() {
  const railway = getSelectedRailway();
  return railway.stations.find((station) => station.id === elements.station.value) || railway.stations[0];
}

function getSelectedDirection() {
  const station = getSelectedStation();
  return station.directions.find((direction) => direction.id === elements.direction.value) || station.directions[0];
}

function optionHtml(value, label) {
  return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
}

function linkModeLabel(mode) {
  if (mode === 'dayType') return t('modeDayType');
  if (mode === 'monorail') return t('modeMonorail');
  if (mode === 'date') return t('modeDate');
  return t('officialPage');
}

function monorailHelpText(direction) {
  const dayType = elements.dayType.value === 'holiday' ? t('monorailHoliday') : t('monorailWeekday');
  return t('monorailHelp')(dayType, localizeName(direction));
}

function getPageLanguage() {
  return document.documentElement.lang === 'en' || window.location.pathname.startsWith('/en/')
    ? 'en'
    : 'ja';
}

function t(key) {
  return (LABELS[PAGE_LANG] || LABELS.ja)[key];
}

function localizeName(item) {
  return PAGE_LANG === 'en' && item.nameEn ? item.nameEn : item.name;
}

function localizeLine(item, key) {
  const englishKey = `${key}En`;
  return PAGE_LANG === 'en' && item[englishKey] ? item[englishKey] : item[key];
}

function localizeShuttleRoute(route, key) {
  if (key === 'destination') {
    return PAGE_LANG === 'en' && route.destinationEn ? route.destinationEn : route.destination;
  }

  return route[key];
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

function formatDateCompact(date) {
  return formatDateValue(date).replaceAll('-', '');
}

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

function getJapanDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Number(value.year), Number(value.month) - 1, Number(value.day));
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

initTimetableLinks();
