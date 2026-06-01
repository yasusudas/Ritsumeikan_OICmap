import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const BASE_URL = "https://syllabus.ritsumei.ac.jp";
const SEARCH_PAGE = `${BASE_URL}/syllabus/s/?language=ja`;
const AURA_ENDPOINT = `${BASE_URL}/syllabus/s/sfsites/aura`;
const DEFAULT_OUTPUT_DIR = path.resolve("syllabus");
const DEFAULT_YEAR = "2026";
const MAX_SEARCH_LIMIT = 501;

const DAYS = [
  { value: "月", file: "月曜日" },
  { value: "火", file: "火曜日" },
  { value: "水", file: "水曜日" },
  { value: "木", file: "木曜日" },
  { value: "金", file: "金曜日" },
  { value: "土", file: "土曜日" },
  { value: "日", file: "日曜日" },
];
const PERIODS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

const COLUMNS = [
  "授業科目名",
  "学部･研究科",
  "年度",
  "学期",
  "開講曜日･時限",
  "キャンパス",
  "全担当教員",
  "教科書_書名",
  "教科書_著者",
  "教科書_出版社",
  "教科書_ISBNコード",
  "教科書_備考欄",
  "参考書_書名",
  "参考書_著者",
  "参考書_出版社",
  "参考書_ISBNコード",
  "参考書_備考欄",
];

const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(args.out ?? DEFAULT_OUTPUT_DIR);
const year = String(args.year ?? DEFAULT_YEAR);
const delayMs = Number(args.delayMs ?? 180);
const batchSize = Number(args.batchSize ?? 10);
const splitBatchSize = Number(args.splitBatchSize ?? 10);
const splitRecordBatchSize = Number(args.splitRecordBatchSize ?? 6);
const countOnly = Boolean(args.countOnly);

let auraRequestCounter = 0;
let actionCounter = 1;
const cookieJar = new Map();

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

async function main() {
  await mkdir(outputDir, { recursive: true });

  const context = await loadAuraContext();
  if (args.settingsOnly) {
    const [faculties, operatingRecords] = await Promise.all([
      getSyllabusSearchSettingsRecords(context),
      getSyllabusOperatingRecords(context),
    ]);
    console.log(JSON.stringify({ faculties, operatingRecords }, null, 2));
    return;
  }

  const combos = selectedCombos();
  const splitFaculties = countOnly || args.faculty
    ? []
    : await getSyllabusSearchSettingsRecords(context);
  const detailCache = new Map();
  const summary = {
    source: SEARCH_PAGE,
    year,
    generatedAt: new Date().toISOString(),
    outputDir,
    countOnly,
    files: [],
    splits: [],
    warnings: [],
  };

  console.log(`対象: ${combos.length}コマ / 年度: ${year}`);

  for (const combo of combos) {
    const prefix = `${combo.day.file}_${combo.period}限`;
    const action = searchAction(combo.day.value, combo.period);
    const count = await getSyllabusRecordCount(context, action);
    await sleep(delayMs);

    if (countOnly) {
      console.log(`${prefix}: ${count}件`);
      summary.files.push({ file: null, day: combo.day.value, period: combo.period, count });
      continue;
    }

    const records = await getCompleteSyllabusRecords(context, action, count, splitFaculties, summary, prefix);
    await sleep(delayMs);
    const details = await fetchMissingDetails(context, records, detailCache);
    const rows = records.map((record) => toCsvRow(record, details.get(record.Id)));
    const file = path.join(outputDir, `${prefix}.xlsx`);
    await writeXlsx(file, prefix, [COLUMNS, ...rows]);

    console.log(`${prefix}: ${rows.length}/${count}件 -> ${file}`);
    summary.files.push({
      file,
      day: combo.day.value,
      period: combo.period,
      count,
      written: rows.length,
    });
  }

  await writeFile(path.join(outputDir, "_summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`完了: ${outputDir}`);
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [rawKey, rawValue] = arg.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    parsed[key] = rawValue ?? true;
  }
  return parsed;
}

function selectedCombos() {
  if (args.combo) {
    return String(args.combo)
      .split(",")
      .map((entry) => {
        const [dayValue, period] = entry.split(":");
        const day = DAYS.find((candidate) => candidate.value === dayValue);
        if (!day || !PERIODS.includes(period)) {
          throw new Error(`--combo は 月:1 の形式で指定してください: ${entry}`);
        }
        return { day, period };
      });
  }

  const dayValues = args.days ? String(args.days).split(",") : DAYS.map((day) => day.value);
  const periods = args.periods ? String(args.periods).split(",") : PERIODS;
  return DAYS.filter((day) => dayValues.includes(day.value)).flatMap((day) =>
    periods.map((period) => {
      if (!PERIODS.includes(period)) {
        throw new Error(`時限は 1〜9 で指定してください: ${period}`);
      }
      return { day, period };
    }),
  );
}

async function loadAuraContext() {
  const response = await fetchWithRetry(SEARCH_PAGE, {
    headers: commonHeaders(SEARCH_PAGE),
  });
  updateCookies(response);

  if (!response.ok) {
    throw new Error(`検索ページを取得できませんでした: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const matches = [...html.matchAll(/\/syllabus\/s\/sfsites\/l\/([^"']+)\/(?:inline|bootstrap|resources)\.js/g)];
  const bootstrapContext = matches
    .map((match) => JSON.parse(decodeURIComponent(match[1])))
    .find((candidate) => candidate.fwuid && candidate.loaded?.["APPLICATION@markup://siteforce:communityApp"]);
  if (!bootstrapContext) {
    throw new Error("検索ページから Aura context を抽出できませんでした。");
  }

  const loadedApp = bootstrapContext.loaded?.["APPLICATION@markup://siteforce:communityApp"];
  if (!bootstrapContext.fwuid || !loadedApp) {
    throw new Error("Aura context に fwuid または loaded application がありません。");
  }

  return {
    mode: "PROD",
    fwuid: bootstrapContext.fwuid,
    app: "siteforce:communityApp",
    loaded: {
      "APPLICATION@markup://siteforce:communityApp": loadedApp,
    },
    dn: [],
    globals: {},
    uad: true,
  };
}

function searchAction(day, period, overrides = {}) {
  return {
    lang: "ja",
    keyword: null,
    faculty: overrides.faculty ?? args.faculty ?? null,
    year,
    term: overrides.term ?? (args.term ? String(args.term).split(",") : null),
    week: [day],
    period: [period],
    professionalCareer: null,
    limits: MAX_SEARCH_LIMIT,
  };
}

async function getSyllabusRecordCount(context, action) {
  const [result] = await callApex(context, [
    apexAction("R_SyllabusPublicPageController", "getSyllabusRecordCount", action),
  ]);
  return Number(result ?? 0);
}

async function getSyllabusSearchSettingsRecords(context) {
  const [result] = await callApex(context, [
    apexAction("R_SyllabusPublicPageController", "getSyllabusSearchSettingsRecords", {}),
  ]);
  return result ?? {};
}

async function getSyllabusOperatingRecords(context) {
  const [result] = await callApex(context, [
    apexAction("R_SyllabusPublicPageController", "getSyllabusOperatingRecords", {}),
  ]);
  return result ?? {};
}

async function getSyllabusRecords(context, action) {
  const [result] = await callApex(context, [
    apexAction("R_SyllabusPublicPageController", "getSyllabusRecords", action),
  ]);
  return Array.isArray(result) ? result : [];
}

async function getCompleteSyllabusRecords(context, baseAction, expectedCount, splitFaculties, summary, prefix) {
  if (expectedCount <= MAX_SEARCH_LIMIT || args.faculty) {
    return getSyllabusRecords(context, baseAction);
  }

  const recordsById = new Map();
  const splitStats = [];
  const splitEntries = splitFaculties
    .map((faculty) => {
      const facultyCode = faculty.R_CollegeCode__c;
      return facultyCode
        ? { faculty, facultyCode, action: { ...baseAction, faculty: facultyCode } }
        : null;
    })
    .filter(Boolean);

  const countResults = await callApexInBatches(
    context,
    splitEntries.map((entry) =>
      apexAction("R_SyllabusPublicPageController", "getSyllabusRecordCount", entry.action),
    ),
    splitBatchSize,
  );

  const activeEntries = splitEntries
    .map((entry, index) => ({ ...entry, count: Number(countResults[index] ?? 0) }))
    .filter((entry) => entry.count > 0);

  for (const entry of activeEntries) {
    if (entry.count > MAX_SEARCH_LIMIT) {
      summary.warnings.push(
        `${prefix}: ${entry.faculty.R_CollegeNameFull__c} だけで ${entry.count} 件あり、APIの単回取得上限 ${MAX_SEARCH_LIMIT} 件を超えています。`,
      );
    }
  }

  const recordResults = await callApexInBatches(
    context,
    activeEntries.map((entry) =>
      apexAction("R_SyllabusPublicPageController", "getSyllabusRecords", entry.action),
    ),
    splitRecordBatchSize,
  );

  for (let index = 0; index < activeEntries.length; index += 1) {
    const entry = activeEntries[index];
    const records = Array.isArray(recordResults[index]) ? recordResults[index] : [];
    for (const record of records) {
      if (record?.Id) recordsById.set(record.Id, record);
    }
    splitStats.push({
      faculty: entry.faculty.R_CollegeNameFull__c,
      facultyCode: entry.facultyCode,
      count: entry.count,
      written: records.length,
    });
  }

  if (recordsById.size < expectedCount) {
    const fallbackRecords = await getSyllabusRecords(context, baseAction);
    await sleep(delayMs);
    for (const record of fallbackRecords) {
      if (record?.Id) recordsById.set(record.Id, record);
    }
  }

  if (recordsById.size < expectedCount) {
    summary.warnings.push(
      `${prefix}: 分割取得後も ${recordsById.size}/${expectedCount} 件です。API上限外の未取得がある可能性があります。`,
    );
  }

  summary.splits.push({
    day: baseAction.week?.[0],
    period: baseAction.period?.[0],
    count: expectedCount,
    collected: recordsById.size,
    split: splitStats,
  });

  return [...recordsById.values()];
}

async function callApexInBatches(context, actions, size) {
  const results = [];
  for (let index = 0; index < actions.length; index += size) {
    const batch = actions.slice(index, index + size);
    results.push(...(await callApex(context, batch)));
    await sleep(delayMs);
  }
  return results;
}

async function fetchMissingDetails(context, records, detailCache) {
  const missing = [];
  for (const record of records) {
    if (record?.Id && !detailCache.has(record.Id)) {
      missing.push(record);
    }
  }

  for (let index = 0; index < missing.length; index += batchSize) {
    const batch = missing.slice(index, index + batchSize);
    const actions = batch.flatMap((record) => [
      apexAction("R_SyllabusDetailPageController", "getSyllabusRecord", {
        recordId: record.Id,
        recordTypeDeveloperName: "R_Syllabus",
      }),
      apexAction("R_SyllabusDetailPageController", "getSyllabusRelatedRecords", {
        recordId: record.Id,
      }),
    ]);
    const results = await callApex(context, actions);

    for (let resultIndex = 0; resultIndex < batch.length; resultIndex += 1) {
      const detailRecord = results[resultIndex * 2] ?? {};
      const relatedRecords = results[resultIndex * 2 + 1] ?? {};
      detailCache.set(batch[resultIndex].Id, { detailRecord, relatedRecords });
    }

    await sleep(delayMs);
  }

  return detailCache;
}

function apexAction(classname, method, action) {
  const id = `${actionCounter};a`;
  actionCounter += 1;
  return {
    id,
    descriptor: "aura://ApexActionController/ACTION$execute",
    callingDescriptor: "UNKNOWN",
    params: {
      namespace: "",
      classname,
      method,
      params: { action },
      cacheable: false,
      isContinuation: false,
    },
  };
}

async function callApex(context, actions) {
  const params = new URLSearchParams();
  params.set("message", JSON.stringify({ actions }));
  params.set("aura.context", JSON.stringify(context));
  params.set("aura.pageURI", "/syllabus/s/?language=ja");
  params.set("aura.token", "null");

  const url = `${AURA_ENDPOINT}?r=${auraRequestCounter}&aura.ApexAction.execute=${actions.length}`;
  auraRequestCounter += 1;
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      ...commonHeaders(SEARCH_PAGE),
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: BASE_URL,
      cookie: cookieHeader(),
    },
    body: params.toString(),
  });
  updateCookies(response);

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Apex API error: ${response.status} ${response.statusText}\n${body.slice(0, 500)}`);
  }

  const json = parseAuraJson(body);
  if (!Array.isArray(json.actions)) {
    throw new Error(`Apex API のレスポンス形式が想定外です: ${body.slice(0, 500)}`);
  }

  return json.actions.map((action) => {
    const state = action.state;
    if (state && state !== "SUCCESS") {
      throw new Error(`Apex action failed (${state}): ${JSON.stringify(action.error || action)}`);
    }
    return action.returnValue?.returnValue?.result;
  });
}

function parseAuraJson(body) {
  const trimmed = body.trim();
  const jsonText = trimmed.startsWith("for(;;);") ? trimmed.slice("for(;;);".length) : trimmed;
  return JSON.parse(jsonText);
}

async function fetchWithRetry(url, options = {}, retries = 4) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (![429, 500, 502, 503, 504].includes(response.status)) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    const waitMs = 750 * 2 ** attempt;
    await sleep(waitMs);
  }
  throw lastError;
}

function commonHeaders(referer) {
  return {
    accept: "*/*",
    "accept-language": "ja,en-US;q=0.9,en;q=0.8",
    referer,
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 CodexRitsumeiSyllabusExport/1.0",
  };
}

function updateCookies(response) {
  const setCookieHeaders = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : splitSetCookie(response.headers.get("set-cookie"));

  for (const header of setCookieHeaders) {
    const cookie = header.split(";", 1)[0];
    const separator = cookie.indexOf("=");
    if (separator > 0) {
      cookieJar.set(cookie.slice(0, separator), cookie.slice(separator + 1));
    }
  }
}

function splitSetCookie(header) {
  if (!header) return [];
  return header.split(/,(?=[^;,]+=)/);
}

function cookieHeader() {
  return [...cookieJar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function toCsvRow(record, detail) {
  const detailRecord = detail?.detailRecord ?? {};
  const relatedRecords = detail?.relatedRecords ?? {};
  const texts = sortBooks(relatedRecords.R_SyllabusText);
  const references = sortBooks(relatedRecords.R_SyllabusReference);

  return [
    detailRecord.R_SlCourseName__c ?? record.R_SlCourseName__c ?? "",
    detailRecord.R_SlDepartmentId__c ?? record.R_SlDepartmentId__c ?? "",
    detailRecord.R_SlYear__c ?? year,
    detailRecord.R_SlTermName__c ?? detailRecord.R_SlCourseOpenPeriodName__c ?? record.R_SlCourseOpenPeriodName__c ?? "",
    detailRecord.R_SlWeekDayPeriod__c ?? record.R_SlWeekDayPeriod__c ?? "",
    detailRecord.R_SlCampusInfo__c ?? record.R_SlCampusInfo__c ?? "",
    detailRecord.R_SlPersonalName__c ?? record.R_SlPersonalName__c ?? "",
    joinBookField(texts, "R_SlSfBookTitle__c"),
    joinBookField(texts, "R_SlSfAuthor__c"),
    joinBookField(texts, "R_SlSfPublisher__c"),
    joinBookField(texts, "R_SlSfISBNCode__c"),
    joinBookField(texts, "R_SlSfBookNotes__c", detailRecord.R_SlSfTextBooksNote__c),
    joinBookField(references, "R_SlSfBookTitle__c"),
    joinBookField(references, "R_SlSfAuthor__c"),
    joinBookField(references, "R_SlSfPublisher__c"),
    joinBookField(references, "R_SlSfISBNCode__c"),
    joinBookField(references, "R_SlSfBookNotes__c", detailRecord.R_SlSfReferenceBooksNote__c),
  ];
}

function sortBooks(books) {
  return [...(Array.isArray(books) ? books : [])].sort((left, right) => {
    return Number(left.R_SlSfDisplayOrder__c ?? 0) - Number(right.R_SlSfDisplayOrder__c ?? 0);
  });
}

async function writeXlsx(file, sheetName, rows) {
  const workbook = Workbook.create();
  const sheet = workbook.worksheets.add(safeSheetName(sheetName));
  const rowCount = rows.length;
  const columnCount = COLUMNS.length;
  const usedRange = sheet.getRangeByIndexes(0, 0, rowCount, columnCount);
  usedRange.values = rows;
  usedRange.format.wrapText = true;
  usedRange.format.verticalAlignment = "top";

  const header = sheet.getRangeByIndexes(0, 0, 1, columnCount);
  header.format.font = { bold: true, color: "#FFFFFF" };
  header.format.fill = "#1F4E78";
  header.format.wrapText = false;
  header.format.rowHeightPx = 28;

  const widths = [220, 140, 80, 100, 110, 100, 180, 230, 180, 160, 130, 340, 230, 180, 160, 130, 340];
  for (let column = 0; column < columnCount; column += 1) {
    sheet.getRangeByIndexes(0, column, rowCount, 1).format.columnWidthPx = widths[column] ?? 140;
  }

  sheet.freezePanes.freezeRows(1);
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(file);
}

function safeSheetName(name) {
  return String(name).replace(/[:\\/?*\[\]]/g, "_").slice(0, 31) || "Sheet1";
}

function joinBookField(books, field, noteFallback = "") {
  const values = books
    .map((book) => normalizeText(book[field]))
    .filter(Boolean);
  if (field === "R_SlSfBookNotes__c" && normalizeText(noteFallback)) {
    values.push(normalizeText(noteFallback));
  }
  return values.join("\n---\n");
}

function normalizeText(value) {
  if (value == null) return "";
  return String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .trim();
}

function toCsv(rows) {
  return `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

function csvEscape(value) {
  const text = normalizeText(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
