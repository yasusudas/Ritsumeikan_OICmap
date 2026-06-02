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
    serviceStatusHeading: '運行情報を確認',
    openServiceStatus: '公式運行情報を開く',
    openOfficialX: '公式Xを開く',
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
    serviceStatusHeading: 'Service Status',
    openServiceStatus: 'Open official status',
    openOfficialX: 'Open official X',
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
            name: '上り 大阪空港方面',
            nameEn: 'Up toward Osaka Airport',
            mode: 'monorail',
            url: 'https://www.osaka-monorail.co.jp/station/r18_unobe/timetable/'
          },
          {
            id: 'kadomashi',
            name: '下り 門真市方面',
            nameEn: 'Down toward Kadomashi',
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
            name: '上り 大阪空港方面',
            nameEn: 'Up toward Osaka Airport',
            mode: 'monorail',
            url: 'https://www.osaka-monorail.co.jp/station/r19_minami_iba/timetable/'
          },
          {
            id: 'kadomashi',
            name: '下り 門真市方面',
            nameEn: 'Down toward Kadomashi',
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
  serviceStatus: document.querySelector('[data-service-status-card]')
};

function initTimetableLinks() {
  if (elements.cardGrid) {
    renderOfficialCards();
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
  const rows = station.directions
    .map((direction) => {
      const links = resolveDirectionLinks(direction);
      return `
        <div class="timetable-official-row">
          <div>
            <span>${escapeHtml(localizeName(direction))}</span>
          </div>
          <div class="timetable-official-actions">
            ${links
              .map(
                (link) => `
                  <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
                    ${escapeHtml(link.label)}
                  </a>
                `
              )
              .join('')}
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <article class="timetable-official-card" style="--timetable-railway-color: ${escapeHtml(railway.accent)};">
      <p class="timetable-railway">${escapeHtml(localizeName(railway))}</p>
      <h3>${escapeHtml(localizeName(station))}${escapeHtml(t('stationSuffix'))}</h3>
      <div class="timetable-official-rows">${rows}</div>
    </article>
  `;
}

function renderServiceStatusCard() {
  const rows = SERVICE_STATUS_LINKS.map((item) => {
    const statusLink = `<a href="${escapeHtml(item.statusUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('openServiceStatus'))}</a>`;
    const xLink = item.xUrl
      ? `<a href="${escapeHtml(item.xUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('openOfficialX'))}</a>`
      : '';
    const actionLinks = item.xUrl ? `${xLink}${statusLink}` : statusLink;

    return `
      <div class="timetable-service-status-row" style="--timetable-railway-color: ${escapeHtml(item.accent)};">
        <div>
          <p>${escapeHtml(localizeLine(item, 'railway'))}</p>
          <h3>${escapeHtml(localizeLine(item, 'line'))}</h3>
        </div>
        <div class="timetable-official-actions">
          ${actionLinks}
        </div>
      </div>
    `;
  }).join('');

  elements.serviceStatus.innerHTML = `
    <section class="timetable-service-status-card" aria-labelledby="service-status-title">
      <div class="timetable-service-status-head">
        <h2 id="service-status-title">${escapeHtml(t('serviceStatusHeading'))}</h2>
      </div>
      <div class="timetable-service-status-rows">${rows}</div>
    </section>
  `;
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

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateCompact(date) {
  return formatDateValue(date).replaceAll('-', '');
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
