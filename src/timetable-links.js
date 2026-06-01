const TODAY = getJapanDate();
const ONE_DAY = 24 * 60 * 60 * 1000;

const RAILWAYS = [
  {
    id: 'osaka-monorail',
    name: '大阪モノレール',
    accent: '#0072bc',
    note: '公式駅時刻表ページを開きます。方面・曜日は公式ページ側で確認してください。',
    stations: [
      {
        id: 'unobe',
        name: '宇野辺',
        directions: [
          {
            id: 'osaka-airport',
            name: '上り 大阪空港方面',
            mode: 'monorail',
            url: 'https://www.osaka-monorail.co.jp/station/r18_unobe/timetable/'
          },
          {
            id: 'kadomashi',
            name: '下り 門真市方面',
            mode: 'monorail',
            url: 'https://www.osaka-monorail.co.jp/station/r18_unobe/timetable/'
          }
        ]
      },
      {
        id: 'minami-ibaraki',
        name: '南茨木',
        directions: [
          {
            id: 'osaka-airport',
            name: '上り 大阪空港方面',
            mode: 'monorail',
            url: 'https://www.osaka-monorail.co.jp/station/r19_minami_iba/timetable/'
          },
          {
            id: 'kadomashi',
            name: '下り 門真市方面',
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
    accent: '#7b3f2a',
    note: '南茨木駅の公式時刻表ページを、方面と曜日種別ごとに開きます。',
    stations: [
      {
        id: 'minami-ibaraki',
        name: '南茨木',
        directions: [
          {
            id: 'osaka',
            name: '大阪梅田・天下茶屋方面',
            mode: 'dayType',
            urls: {
              weekday: 'https://www.hankyu.co.jp/station/html/HK-68_ky_1_w.html',
              holiday: 'https://www.hankyu.co.jp/station/html/HK-68_ky_1_h.html'
            }
          },
          {
            id: 'kyoto',
            name: '京都河原町方面',
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
    accent: '#0068b7',
    note: 'JR西日本公式時刻表を、表示日つきで開きます。',
    stations: [
      {
        id: 'ibaraki',
        name: '茨木',
        directions: [
          {
            id: 'kyoto',
            name: '京都方面',
            mode: 'date',
            timetableId: '2791011001'
          },
          {
            id: 'osaka-kobe',
            name: '大阪・神戸方面',
            mode: 'date',
            timetableId: '2791011002'
          }
        ]
      }
    ]
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
  cardGrid: document.querySelector('[data-official-card-grid]')
};

function initTimetableLinks() {
  if (!elements.form) return;

  elements.dateInput.value = formatDateValue(TODAY);
  populateRailways();
  renderOfficialCards();
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
  elements.generatedLink.textContent = url || '選択してください';
  elements.help.textContent = direction.mode === 'monorail' ? monorailHelpText(direction) : railway.note;
}

function renderOfficialCards() {
  elements.cardGrid.innerHTML = RAILWAYS.flatMap((railway) =>
    railway.stations.map((station) => renderOfficialCard(railway, station))
  ).join('');
}

function renderOfficialCard(railway, station) {
  const rows = station.directions
    .map((direction) => {
      const links = resolveDirectionLinks(direction);
      return `
        <div class="timetable-official-row">
          <div>
            <span>${escapeHtml(direction.name)}</span>
            <small>${escapeHtml(linkModeLabel(direction.mode))}</small>
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
      <p class="timetable-railway">${escapeHtml(railway.name)}</p>
      <h3>${escapeHtml(station.name)}駅</h3>
      <div class="timetable-official-rows">${rows}</div>
    </article>
  `;
}

function resolveDirectionLinks(direction) {
  if (direction.mode === 'dayType') {
    return [
      { label: '平日', url: direction.urls.weekday },
      { label: '土曜・休日', url: direction.urls.holiday }
    ];
  }

  if (direction.mode === 'monorail') {
    return [
      { label: '平日', url: monorailUrl(direction.url, 'weekday') },
      { label: '休日', url: monorailUrl(direction.url, 'holiday') }
    ];
  }

  if (direction.mode === 'date') {
    const today = formatDateCompact(TODAY);
    const tomorrow = formatDateCompact(new Date(TODAY.getTime() + ONE_DAY));
    return [
      { label: '今日', url: jrUrl(direction.timetableId, today) },
      { label: '明日', url: jrUrl(direction.timetableId, tomorrow) }
    ];
  }

  return [{ label: '公式ページ', url: direction.url }];
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
  if (mode === 'dayType') return '曜日種別を選んで公式ページへ';
  if (mode === 'monorail') return '曜日種別を選び、公式ページ内の該当列を確認';
  if (mode === 'date') return '表示日つきで公式ページへ';
  return '公式駅時刻表ページへ';
}

function monorailHelpText(direction) {
  const dayType = elements.dayType.value === 'holiday' ? '休日用（土・日・祝日）' : '平日用（月〜金）';
  return `大阪モノレール公式ページ内で「${dayType}」タブを開き、「${direction.name}」列を確認してください。`;
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
