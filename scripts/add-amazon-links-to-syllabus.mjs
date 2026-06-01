import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const OUTPUT_DIR = path.resolve("data/syllabus");
const SUMMARY_FILE = path.join(OUTPUT_DIR, "_summary.json");
const CACHE_FILE = path.join(OUTPUT_DIR, "_amazon_link_cache.json");
const ISBN_LOOKUP_CACHE_FILE = path.join(OUTPUT_DIR, "_isbn_lookup_cache.json");
const AUDIT_FILE = path.join(OUTPUT_DIR, "_amazon_link_audit.json");
const MISSING_REPORT_FILE = path.join(OUTPUT_DIR, "_amazon_link_missing.md");
const MISSING_REPORT_JSON_FILE = path.join(OUTPUT_DIR, "_amazon_link_missing.json");
const MISSING_BY_PERIOD_REPORT_FILE = path.join(OUTPUT_DIR, "_amazon_link_missing_by_period.md");
const MISSING_BY_PERIOD_JSON_FILE = path.join(OUTPUT_DIR, "_amazon_link_missing_by_period.json");
const AMAZON_BASE = "https://www.amazon.co.jp";
const NDL_OPENSEARCH = "https://ndlsearch.ndl.go.jp/api/opensearch";
const DELIMITER = "\n---\n";
const RESOLVER_VERSION = 9;
const LINK_ALLOWED_STATUSES = new Set([
  "isbn_link",
  "bibliography_isbn_link",
  "amazon_search_isbn_verified",
  "provided_amazon_link",
]);
const DAY_ORDER = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日"];

const BASE_COLUMNS = [
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

const LINKED_COLUMNS = [
  "授業科目名",
  "学部･研究科",
  "年度",
  "学期",
  "開講曜日･時限",
  "キャンパス",
  "全担当教員",
  "教科書_書名",
  "教科書_Amazonリンク",
  "教科書_著者",
  "教科書_出版社",
  "教科書_ISBNコード",
  "教科書_備考欄",
  "参考書_書名",
  "参考書_Amazonリンク",
  "参考書_著者",
  "参考書_出版社",
  "参考書_ISBNコード",
  "参考書_備考欄",
];

const args = parseArgs(process.argv.slice(2));
const delayMs = Number(args.delayMs ?? 750);
const ndlDelayMs = Number(args.ndlDelayMs ?? 100);
const maxSearches = Number(args.maxSearches ?? Number.POSITIVE_INFINITY);
const allowAmazonSearch = Boolean(args.allowAmazonSearch) && maxSearches > 0;
const fetchTimeoutMs = Number(args.fetchTimeoutMs ?? 15000);
const ndlConcurrency = Math.max(1, Number(args.ndlConcurrency ?? (maxSearches === 0 ? 8 : 1)));
const verifyIsbnNdl = Boolean(args.verifyIsbnNdl);

let searchCount = 0;
let isbnLookupCache = {};

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

async function main() {
  const files = await targetFiles();
  const cache = await loadJson(CACHE_FILE, {});
  sanitizeCache(cache);
  isbnLookupCache = await loadJson(ISBN_LOOKUP_CACHE_FILE, {});
  const audit = {
    generatedAt: new Date().toISOString(),
    resolverVersion: RESOLVER_VERSION,
    files: [],
    warnings: [],
  };
  const missingRows = [];

  console.log(`対象xlsx: ${files.length}件`);

  for (const file of files) {
    const rows = readWorkbookRows(file);
    const header = rows[0] ?? [];
    const baseRows = rows.map((row) => normalizeRowByHeader(row, header));
    const fileBooks = collectBooks(baseRows);
    if (!args.reuseCache) await resolveBooks(fileBooks, cache, path.basename(file));

    const linkedRows = baseRows.map((row, rowIndex) => {
      if (rowIndex === 0) return LINKED_COLUMNS;
      return buildLinkedRow(row, cache);
    });

    await writeWorkbook(file, path.basename(file, ".xlsx"), linkedRows);
    const stats = fileStats(file, baseRows, linkedRows, cache);
    audit.files.push(stats);
    missingRows.push(...missingEntriesForFile(file, baseRows, cache));
    console.log(`${path.basename(file)}: books=${stats.books} linked=${stats.linked} missing=${stats.missing}`);
    await writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    await writeFile(ISBN_LOOKUP_CACHE_FILE, `${JSON.stringify(isbnLookupCache, null, 2)}\n`, "utf8");
  }

  audit.missingRows = missingRows.length;
  await writeFile(AUDIT_FILE, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  await writeMissingReport(missingRows, audit);
  console.log(`完了: ${OUTPUT_DIR}`);
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

async function targetFiles() {
  const all = (await readdir(OUTPUT_DIR))
    .filter((file) => file.endsWith(".xlsx") && !file.startsWith("~$"))
    .sort();
  const only = args.only ? new Set(String(args.only).split(",")) : null;
  const skip = args.skip ? new Set(String(args.skip).split(",")) : new Set();
  return all
    .filter((file) => !only || only.has(file))
    .filter((file) => !skip.has(file))
    .map((file) => path.join(OUTPUT_DIR, file));
}

async function loadJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function readWorkbookRows(file) {
  const xml = execFileSync("unzip", ["-p", file, "xl/worksheets/sheet1.xml"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = [];
  for (const rowMatch of xml.matchAll(/<x:row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/x:row>/g)) {
    const rowIndex = Number(rowMatch[1]) - 1;
    const row = [];
    for (const cellMatch of rowMatch[2].matchAll(/<x:c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/x:c>)/g)) {
      const coordinate = cellMatch[1].match(/\br="([A-Z]+)(\d+)"/);
      if (!coordinate) continue;
      const column = columnLabelToIndex(coordinate[1]);
      const body = cellMatch[2] ?? "";
      const valueMatch = body.match(/<x:v>([\s\S]*?)<\/x:v>/);
      row[column] = valueMatch ? xmlUnescape(valueMatch[1]) : "";
    }
    rows[rowIndex] = row;
  }
  return rows.map((row) => row ?? []);
}

function normalizeRowByHeader(row, header) {
  const amazonColumns = new Set(
    header
      .map((value, index) => String(value).includes("Amazonリンク") ? index : -1)
      .filter((index) => index >= 0),
  );
  const width = Math.max(header.length, row.length, LINKED_COLUMNS.length);
  const values = [];
  for (let index = 0; index < width && values.length < BASE_COLUMNS.length; index += 1) {
    if (!amazonColumns.has(index)) values.push(row[index] ?? "");
  }
  return values;
}

function collectBooks(rows) {
  const books = new Map();
  for (const row of rows.slice(1)) {
    for (const book of rowBooks(row, 7)) books.set(bookKey(book), book);
    for (const book of rowBooks(row, 12)) books.set(bookKey(book), book);
  }
  return [...books.values()];
}

function rowBooks(row, titleIndex) {
  const titles = splitCell(row[titleIndex]);
  const authors = splitCell(row[titleIndex + 1]);
  const publishers = splitCell(row[titleIndex + 2]);
  const isbns = splitCell(row[titleIndex + 3]);
  const notes = splitCell(row[titleIndex + 4]);
  const books = [];
  for (let index = 0; index < titles.length; index += 1) {
    const book = {
      title: titles[index] ?? "",
      author: authors[index] ?? "",
      publisher: publishers[index] ?? "",
      isbn: isbns[index] ?? "",
      note: notes[index] ?? notes[0] ?? "",
    };
    book.existingAmazonLink = extractAmazonDpLink([
      book.title,
      book.author,
      book.publisher,
      book.isbn,
      book.note,
    ].join("\n"));
    if (book.title || book.isbn) books.push(book);
  }
  return books;
}

async function resolveBooks(books, cache, fileLabel) {
  let resolved = 0;
  const pendingBooks = books.filter((book) => {
    const key = bookKey(book);
    return !cache[key] || shouldRetryCached(cache[key], book);
  });

  if (maxSearches === 0 && ndlConcurrency > 1) {
    for (let index = 0; index < pendingBooks.length; index += ndlConcurrency) {
      const batch = pendingBooks.slice(index, index + ndlConcurrency);
      const results = await Promise.all(
        batch.map(async (book) => {
          const entry = await resolveBook(book, cache[bookKey(book)]);
          return { book, entry };
        }),
      );

      for (const { book, entry } of results) {
        cache[bookKey(book)] = entry;
      }
      resolved += results.length;
      if (resolved % 50 === 0 || resolved === pendingBooks.length) {
        console.log(`${fileLabel}: searched ${resolved}/${pendingBooks.length}`);
      }
      await writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
      await writeFile(ISBN_LOOKUP_CACHE_FILE, `${JSON.stringify(isbnLookupCache, null, 2)}\n`, "utf8");
      if (results.some(({ entry }) => entry.didBibliographySearch)) await sleep(ndlDelayMs);
    }
    return;
  }

  for (const book of pendingBooks) {
    const key = bookKey(book);
    cache[key] = await resolveBook(book, cache[key]);
    resolved += 1;
    if (resolved % 10 === 0 || resolved === pendingBooks.length) {
      console.log(`${fileLabel}: searched ${resolved}/${pendingBooks.length}`);
    }
    await writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    await writeFile(ISBN_LOOKUP_CACHE_FILE, `${JSON.stringify(isbnLookupCache, null, 2)}\n`, "utf8");
    if (cache[key].didSearch) await sleep(delayMs);
    else if (cache[key].didBibliographySearch) await sleep(ndlDelayMs);
  }
}

function shouldRetryCached(entry, book) {
  if (book.existingAmazonLink && entry?.link !== book.existingAmazonLink) return true;
  if (entry?.status === "matched") return true;
  if (verifyIsbnNdl && entry?.status === "isbn_link" && !entry.ndlChecked) return true;
  if (verifyIsbnNdl && entry?.status === "isbn_mismatch") return true;
  if ((entry?.resolverVersion ?? 0) < RESOLVER_VERSION && needsCurrentResolverRules(entry)) return true;
  if (!entry?.link && entry.status === "not_searched") return true;
  if ((entry.status === "blocked" || entry.status === "fetch_error") && args.retryErrors) return true;
  if (entry.status === "not_found" && entry.didSearch && args.retryTerminal) return true;
  if (entry.status === "not_found" && !entry.ndlChecked && args.retryTerminal) return true;
  if (
    (entry.status === "amazon_search_isbn_unverified" || entry.status === "amazon_search_unverified")
    && args.retryTerminal
  ) return true;
  if (entry.status === "skipped" && entry.reason === "non_retail_text" && !isLikelyNonRetailText(book.title)) return true;
  return false;
}

function needsCurrentResolverRules(entry) {
  if (!entry?.status) return true;
  if (entry.status === "bibliography_unverified") return true;
  if (entry.status === "amazon_search_isbn_unverified" || entry.status === "amazon_search_unverified") return true;
  if (entry.status === "bibliography_isbn_link" && isWeakBibliographyTitle(entry.book?.title)) return true;
  return false;
}

async function resolveBook(book, cachedEntry = null) {
  if (book.existingAmazonLink) {
    return {
      link: book.existingAmazonLink,
      status: "provided_amazon_link",
      reason: "amazon_url_present_in_syllabus",
      asin: book.existingAmazonLink.match(/\/dp\/([A-Z0-9]{10})/)?.[1] ?? "",
      resolverVersion: RESOLVER_VERSION,
      book,
    };
  }

  if (isLikelyNonRetailText(book.title)) {
    return { link: "", status: "skipped", reason: "non_retail_text", resolverVersion: RESOLVER_VERSION, book };
  }

  const isbn = bestIsbn(book.isbn);
  if (isbn?.isbn10 && !args.verifyIsbn) {
    if (verifyIsbnNdl) {
      const verification = await verifyIsbnWithBibliography(book, isbn);
      if (verification.status === "mismatch") {
        const bibliographyResult = await resolveBookByBibliography(book);
        if (bibliographyResult.entry) return bibliographyResult.entry;
        return {
          link: "",
          status: "isbn_mismatch",
          reason: "ndl_isbn_title_mismatch",
          ndlChecked: true,
          didBibliographySearch: true,
          isbnVerification: verification,
          resolverVersion: RESOLVER_VERSION,
          book,
        };
      }
    }

    return {
      link: `${AMAZON_BASE}/dp/${isbn.isbn10}`,
      status: "isbn_link",
      reason: "isbn10_as_amazon_book_asin",
      asin: isbn.isbn10,
      ndlChecked: verifyIsbnNdl,
      resolverVersion: RESOLVER_VERSION,
      book,
    };
  }

  const skipCachedBibliographyMiss = maxSearches > 0
    && cachedEntry?.ndlChecked
    && ["not_searched", "not_found"].includes(cachedEntry.status);
  const bibliographyResult = skipCachedBibliographyMiss
    ? { entry: null, attempted: true }
    : await resolveBookByBibliography(book);
  if (bibliographyResult.entry) return bibliographyResult.entry;

  if (!allowAmazonSearch || searchCount >= maxSearches) {
    return {
      link: "",
      status: "not_searched",
      reason: "max_searches_reached",
      ndlChecked: bibliographyResult.attempted,
      didBibliographySearch: bibliographyResult.attempted,
      resolverVersion: RESOLVER_VERSION,
      book,
    };
  }

  const query = isbn?.isbn13 ?? isbn?.isbn10 ?? [book.title, book.author, book.publisher].filter(Boolean).join(" ");
  if (!query) return { link: "", status: "skipped", reason: "empty_query", resolverVersion: RESOLVER_VERSION, book };

  searchCount += 1;
  let html = "";
  try {
    html = await fetchAmazonSearch(query);
  } catch (error) {
    return {
      link: "",
      status: "fetch_error",
      reason: error?.name === "AbortError" ? "timeout" : "request_failed",
      query,
      didSearch: true,
      resolverVersion: RESOLVER_VERSION,
      book,
    };
  }
  if (isCaptchaPage(html)) {
    return {
      link: "",
      status: "blocked",
      reason: "amazon_captcha_or_robot_check",
      query,
      ndlChecked: bibliographyResult.attempted,
      didSearch: true,
      resolverVersion: RESOLVER_VERSION,
      book,
    };
  }

  const candidates = parseSearchCandidates(html);
  const best = await chooseCandidate(book, isbn, candidates);
  if (!best) {
    return {
      link: "",
      status: "not_found",
      query,
      ndlChecked: bibliographyResult.attempted,
      candidates: candidates.slice(0, 5),
      didSearch: true,
      resolverVersion: RESOLVER_VERSION,
      book,
    };
  }

  return {
    link: `${AMAZON_BASE}/dp/${best.asin}`,
    status: best.verifiedByIsbn ? "amazon_search_isbn_verified" : "matched",
    reason: best.verifiedByIsbn ? "amazon_search_candidate_verified_by_ndl_isbn" : "amazon_search_match",
    query,
    asin: best.asin,
    score: best.score,
    matchedTitle: best.title,
    isbnVerification: best.isbnVerification,
    ndlChecked: bibliographyResult.attempted,
    didSearch: true,
    resolverVersion: RESOLVER_VERSION,
    book,
  };
}

async function resolveBookByBibliography(book) {
  if (args.noNdl) return { entry: null, attempted: false };
  if (!book.title || looksLikeCourseMaterialTitle(book.title)) return { entry: null, attempted: false };

  let attempted = false;
  let best = null;
  for (const queryTitle of bibliographyTitleQueries(book.title)) {
    attempted = true;
    let xml = "";
    try {
      const url = `${NDL_OPENSEARCH}?cnt=12&title=${encodeURIComponent(queryTitle)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "accept": "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
            "user-agent": "Codex local syllabus enrichment (educational use)",
          },
        });
        xml = await response.text();
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      continue;
    }

    const candidate = chooseBibliographyCandidate(book, parseBibliographyCandidates(xml));
    if (!best || (candidate?.score ?? 0) > best.score) best = candidate;
    if (best?.score >= 0.92) break;
  }
  if (!best?.isbn?.isbn10) return { entry: null, attempted };

  return {
    entry: {
      link: `${AMAZON_BASE}/dp/${best.isbn.isbn10}`,
      status: "bibliography_isbn_link",
      reason: "ndl_title_match_to_isbn10_as_amazon_book_asin",
      asin: best.isbn.isbn10,
      matchedTitle: best.title,
      matchedAuthor: best.author,
      matchedPublisher: best.publisher,
      score: best.score,
      ndlChecked: true,
      didBibliographySearch: true,
      resolverVersion: RESOLVER_VERSION,
      book,
    },
    attempted,
  };
}

async function verifyIsbnWithBibliography(book, isbn) {
  const candidates = await getBibliographyCandidatesByIsbn(isbn);
  if (!candidates.length) {
    return { status: "no_hit", candidates: [] };
  }

  let best = null;
  for (const candidate of candidates) {
    const score = scoreIsbnBibliographyCandidate(book, candidate);
    if (!best || score > best.score) best = { ...candidate, score };
  }

  if (best && best.score >= 0.58) {
    return {
      status: "matched",
      score: best.score,
      title: best.title,
      author: best.author,
      publisher: best.publisher,
    };
  }

  return {
    status: "mismatch",
    score: best?.score ?? 0,
    title: best?.title ?? "",
    author: best?.author ?? "",
    publisher: best?.publisher ?? "",
  };
}

function scoreIsbnBibliographyCandidate(book, candidate) {
  const strictScore = scoreBibliographyCandidate(book, candidate);
  if (strictScore >= 0.58) return strictScore;
  if (hasConflictingTitleMarkers(book.title, candidate.title)) return 0;

  const wanted = normalizeComparable(book.title);
  const got = normalizeComparable(candidate.title);
  if (!wanted || !got || wanted.length <= 1) return 0;

  const wantedCore = normalizeTitleCore(book.title);
  const gotCore = normalizeTitleCore(candidate.title);
  const titleScore = Math.max(similarity(wanted, got), similarity(wantedCore, gotCore));
  const sourceAuthor = normalizeIdentity(book.author);
  const candidateAuthor = normalizeIdentity(candidate.author);
  const sourcePublisher = normalizePublisher(book.publisher);
  const candidatePublisher = normalizePublisher(candidate.publisher);
  const authorScore = fieldSimilarity(sourceAuthor, candidateAuthor);
  const publisherScore = fieldSimilarity(sourcePublisher, candidatePublisher);
  const titleContains = wantedCore.length >= 3
    && (gotCore.includes(wantedCore) || wantedCore.includes(gotCore));
  const bothFieldsConflict = sourceAuthor
    && candidateAuthor
    && sourcePublisher
    && candidatePublisher
    && authorScore < 0.22
    && publisherScore < 0.35;

  if (bothFieldsConflict && !titleContains) return 0;
  if (titleContains && !bothFieldsConflict) return Math.max(0.58, Math.min(1, titleScore + 0.18));
  if (titleScore >= 0.5 && authorScore >= 0.5 && publisherScore >= 0.7) return 0.72;
  if (titleScore >= 0.25 && authorScore >= 0.75 && publisherScore >= 0.8) return 0.62;
  return 0;
}

async function getBibliographyCandidatesByIsbn(isbn) {
  const cacheKey = isbn.isbn13 || isbn.isbn10;
  if (Array.isArray(isbnLookupCache[cacheKey])) {
    return isbnLookupCache[cacheKey];
  }

  const candidatesByKey = new Map();
  for (const query of [isbn.isbn13, isbn.isbn10].filter(Boolean)) {
    let xml = "";
    try {
      const url = `${NDL_OPENSEARCH}?cnt=8&isbn=${encodeURIComponent(query)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "accept": "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
            "user-agent": "Codex local syllabus enrichment (educational use)",
          },
        });
        xml = await response.text();
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      continue;
    }

    for (const candidate of parseBibliographyCandidates(xml)) {
      const key = [candidate.title, candidate.author, candidate.publisher, candidate.isbn?.isbn10].join("\u001f");
      candidatesByKey.set(key, candidate);
    }
  }

  const candidates = [...candidatesByKey.values()];
  isbnLookupCache[cacheKey] = candidates;
  return candidates;
}

function parseBibliographyCandidates(xml) {
  const candidates = [];
  for (const match of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = match[1];
    if (!/<category>\s*図書\s*<\/category>/.test(item)) continue;
    const identifiers = [
      ...[...item.matchAll(/<dc:identifier\b[^>]*xsi:type="dcndl:ISBN"[^>]*>([\s\S]*?)<\/dc:identifier>/g)]
        .map((isbnMatch) => cleanXmlText(isbnMatch[1])),
      ...tagTexts(item, "isbn"),
      cleanXmlText(firstTagText(item, "description")),
    ];
    const isbn = identifiers.map(bestIsbn).find(Boolean);
    if (!isbn) continue;
    const title = firstTagText(item, "dc:title") || firstTagText(item, "title");
    const author = tagTexts(item, "dc:creator").join(" ");
    const publisher = firstTagText(item, "dc:publisher");
    candidates.push({
      title,
      author,
      publisher,
      isbn,
      text: [title, author, publisher].filter(Boolean).join(" "),
    });
  }
  return candidates;
}

function chooseBibliographyCandidate(book, candidates) {
  let best = null;
  for (const candidate of candidates) {
    const score = scoreBibliographyCandidate(book, candidate);
    if (!best || score > best.score) best = { ...candidate, score };
  }
  return best && best.score >= 0.82 ? best : null;
}

async function fetchAmazonSearch(query) {
  const url = `${AMAZON_BASE}/s?k=${encodeURIComponent(query)}&i=stripbooks`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept-language": "ja,en-US;q=0.9,en;q=0.8",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      },
    });
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseSearchCandidates(html) {
  const candidates = [];
  const blocks = html.split(/data-component-type="s-search-result"/g).slice(1);
  for (const block of blocks) {
    const asin = attr(block, "data-asin") || dpAsin(block);
    if (!asin) continue;
    const title = titleFromBlock(block);
    const text = stripTags(block);
    candidates.push({
      asin,
      title,
      text,
    });
  }
  return dedupeByAsin(candidates).slice(0, 12);
}

async function chooseCandidate(book, isbn, candidates) {
  const isbn10 = isbn?.isbn10;
  if (isbn10) {
    const exact = candidates.find((candidate) => candidate.asin === isbn10);
    if (exact) return { ...exact, score: 1 };
  }

  for (const candidate of candidates) {
    if (!isValidIsbn10(candidate.asin)) continue;
    const candidateIsbn = { isbn10: candidate.asin, isbn13: isbn10To13(candidate.asin) };
    const isbnVerification = await verifyIsbnWithBibliography(book, candidateIsbn);
    if (!isSafeAmazonSearchIsbnMatch(book, candidate, isbnVerification)) continue;
    return {
      ...candidate,
      score: scoreCandidate(book, candidate, candidateIsbn),
      verifiedByIsbn: true,
      isbnVerification,
    };
  }

  return null;
}

function scoreCandidate(book, candidate, isbn) {
  const wanted = normalizeComparable(book.title);
  const got = normalizeComparable(candidate.title);
  const text = normalizeComparable(candidate.text);
  if (!wanted || !got) return 0;

  let score = similarity(wanted, got);
  if (got.includes(wanted) || wanted.includes(got)) score = Math.max(score, 0.9);

  const author = normalizeComparable(book.author);
  if (author && text.includes(author.slice(0, Math.min(author.length, 8)))) score += 0.08;
  const publisher = normalizeComparable(book.publisher);
  if (publisher && text.includes(publisher.slice(0, Math.min(publisher.length, 8)))) score += 0.04;
  if (isbn?.isbn10 && candidate.text.includes(isbn.isbn10)) score += 0.15;
  return Math.min(score, 1);
}

function scoreBibliographyCandidate(book, candidate) {
  const wanted = normalizeComparable(book.title);
  const got = normalizeComparable(candidate.title);
  if (!wanted || !got) return 0;

  const wantedCore = normalizeTitleCore(book.title);
  const gotCore = normalizeTitleCore(candidate.title);
  if (!requiredTitleTokensMatch(book.title, candidate.title)) return 0;
  let titleScore = Math.max(similarity(wanted, got), similarity(wantedCore, gotCore));
  if (wanted === got || (wantedCore && wantedCore === gotCore)) titleScore = 1;
  else if (wanted.length >= 8 && (got.includes(wanted) || wanted.includes(got))) {
    titleScore = Math.max(titleScore, 0.88);
  } else if (wantedCore.length >= 6 && (gotCore.includes(wantedCore) || wantedCore.includes(gotCore))) {
    titleScore = Math.max(titleScore, 0.9);
  }

  if (titleScore < 0.74) return 0;

  const sourceAuthor = normalizeIdentity(book.author);
  const candidateAuthor = normalizeIdentity(candidate.author);
  const sourcePublisher = normalizePublisher(book.publisher);
  const candidatePublisher = normalizePublisher(candidate.publisher);
  const authorScore = fieldSimilarity(sourceAuthor, candidateAuthor);
  const publisherScore = fieldSimilarity(sourcePublisher, candidatePublisher);

  if (isWeakBibliographyTitle(book.title)) {
    if (titleScore < 0.98) return 0;
    if (!sourceAuthor && !sourcePublisher) return 0;
    if (sourceAuthor && (!candidateAuthor || authorScore < 0.35)) return 0;
    if (sourcePublisher && (!candidatePublisher || publisherScore < 0.45)) return 0;
  }

  const strongTitlePublisherMatch = titleScore >= 0.82 && publisherScore >= 0.45;
  const strongTitleAuthorMatch = titleScore >= 0.86 && authorScore >= 0.35;

  if (sourceAuthor && candidateAuthor && authorScore < 0.22 && titleScore < 0.96 && !strongTitlePublisherMatch) {
    return 0;
  }
  if (sourcePublisher && candidatePublisher && publisherScore < 0.35 && titleScore < 0.96 && !strongTitleAuthorMatch) {
    return 0;
  }
  if (
    sourceAuthor &&
    candidateAuthor &&
    sourcePublisher &&
    candidatePublisher &&
    authorScore < 0.22 &&
    publisherScore < 0.35
  ) {
    return 0;
  }

  let score = titleScore;
  if (sourceAuthor && candidateAuthor) score += authorScore >= 0.35 ? 0.08 : -0.12;
  if (sourcePublisher && candidatePublisher) score += publisherScore >= 0.45 ? 0.06 : -0.12;
  return Math.max(0, Math.min(score, 1));
}

function requiredTitleTokensMatch(sourceTitle, candidateTitle) {
  const sourceTokens = significantTitleTokens(sourceTitle);
  if (!sourceTokens.length) return true;
  const candidateTokens = new Set(significantTitleTokens(candidateTitle));
  return sourceTokens.every((token) => candidateTokens.has(token));
}

function significantTitleTokens(value) {
  const normalized = normalizeText(value).normalize("NFKC").toLowerCase();
  const tokens = [];
  for (const match of normalized.matchAll(/\b(level|book|vol(?:ume)?|part)\.?\s*([0-9]+)\b/g)) {
    tokens.push(`${match[1]}${match[2]}`);
  }
  for (const match of normalized.matchAll(/(?:第\s*)?([0-9]+)\s*(?:巻|分冊|冊)/g)) {
    tokens.push(`vol${match[1]}`);
  }
  for (const match of normalized.matchAll(/((?:[0-9]+\s*[・･,，、\/~〜\-]?\s*)+)\s*級/g)) {
    const grades = match[1].match(/[0-9]+/g) ?? [];
    for (const grade of grades) tokens.push(`grade${grade}`);
  }
  const trailingLevel = normalized.match(/\b([a-z][a-z\s]+)\s+([1-9])\s*$/);
  if (trailingLevel && !/\b(?:edition|ed\.?|版)\b/i.test(normalized)) {
    tokens.push(`level${trailingLevel[2]}`);
  }
  return tokens;
}

function hasConflictingTitleMarkers(sourceTitle, candidateTitle) {
  const source = groupedTitleMarkers(sourceTitle);
  const candidate = groupedTitleMarkers(candidateTitle);
  for (const [kind, sourceValues] of source) {
    const candidateValues = candidate.get(kind);
    if (!candidateValues?.size) continue;
    for (const value of sourceValues) {
      if (candidateValues.has(value)) return false;
    }
    return true;
  }
  return false;
}

function groupedTitleMarkers(value) {
  const groups = new Map();
  for (const token of significantTitleTokens(value)) {
    const match = token.match(/^([a-z]+)([0-9]+)$/);
    if (!match) continue;
    const kind = match[1].startsWith("vol") ? "vol" : match[1];
    if (!groups.has(kind)) groups.set(kind, new Set());
    groups.get(kind).add(match[2]);
  }
  return groups;
}

function fieldSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right || left.includes(right) || right.includes(left)) return 1;
  return similarity(left, right);
}

function normalizeIdentity(value) {
  return normalizeComparable(value)
    .replace(/\d{4}/g, "")
    .replace(/(編著|共著|編者|著者|監修|編集|訳者|編|著|訳|ほか|他|etal|and|with)/g, "");
}

function normalizePublisher(value) {
  return normalizeComparable(value)
    .replace(/(株式会社|有限会社|一般社団法人|公益社団法人|出版|出版社|書店|press|publisher|publishing)/g, "");
}

function normalizeTitleCore(value) {
  return normalizeComparable(
    normalizeText(value)
      .replace(/^[第だい]?\s*[0-9０-９一二三四五六七八九十]+\s*版\s*/i, "")
      .replace(/[（(][^)）]*(?:版|edition|ed\.)[^)）]*[)）]/gi, "")
      .replace(/[:：].*$/, "")
      .replace(/[―–—-].*$/, ""),
  );
}

function isWeakBibliographyTitle(value) {
  const normalized = normalizeComparable(value);
  if (normalized.length <= 4) return true;
  return /^(同上|none|リファレンスブック|安全マニュアル|見える化|ロボット工学|リーダーシップ論|行政法入門|eu法|中学校学習指導要領|高等学校学習指導要領)$/.test(
    normalized,
  );
}

function sanitizeCache(cache) {
  for (const entry of Object.values(cache)) {
    if (entry?.status === "matched") {
      delete entry.asin;
      delete entry.candidates;
      entry.link = "";
      entry.status = "amazon_search_unverified";
      entry.reason = "amazon_search_match_not_trusted_after_fact_check";
      entry.resolverVersion = RESOLVER_VERSION;
      continue;
    }
    if (entry?.status === "amazon_search_isbn_verified") {
      const candidate = {
        asin: entry.asin ?? entry.link?.match(/\/dp\/([A-Z0-9]{10})/)?.[1] ?? "",
        title: entry.matchedTitle ?? "",
        text: [entry.matchedTitle, entry.matchedAuthor, entry.matchedPublisher].filter(Boolean).join(" "),
      };
      if (entry.book && isSafeAmazonSearchIsbnMatch(entry.book, candidate, entry.isbnVerification ?? {})) {
        continue;
      }
      delete entry.asin;
      entry.link = "";
      entry.status = "amazon_search_isbn_unverified";
      entry.reason = "amazon_search_isbn_match_failed_current_safety_rules";
      entry.resolverVersion = RESOLVER_VERSION;
      continue;
    }
    if (entry?.status === "bibliography_unverified") {
      delete entry.asin;
      delete entry.removedLink;
      entry.link = "";
      continue;
    }
    if (!entry?.link || entry.status !== "bibliography_isbn_link") continue;
    const candidate = {
      title: entry.matchedTitle ?? "",
      author: entry.matchedAuthor ?? "",
      publisher: entry.matchedPublisher ?? "",
    };
    if (scoreBibliographyCandidate(entry.book ?? {}, candidate) >= 0.82) continue;
    entry.link = "";
    delete entry.asin;
    delete entry.removedLink;
    entry.status = "bibliography_unverified";
    entry.reason = "bibliography_match_failed_current_safety_rules";
    entry.resolverVersion = RESOLVER_VERSION;
  }
}

function isSafeAmazonSearchIsbnMatch(book, candidate, isbnVerification) {
  if (isbnVerification.status !== "matched" || (isbnVerification.score ?? 0) < 0.94) return false;
  if (!editionCompatible(book.title, candidate.title)) return false;
  if (!editionCompatible(book.title, isbnVerification.title)) return false;

  const candidateText = [candidate.title, candidate.text].filter(Boolean).join(" ");
  const amazonScore = scoreCandidate(book, { title: candidate.title, text: candidateText }, null);
  if (amazonScore < 0.72) return false;

  const sourceTitle = normalizeTitleCore(book.title);
  const amazonTitle = normalizeTitleCore(candidate.title);
  const verifiedTitle = normalizeTitleCore(isbnVerification.title);
  const titleOverlap = sourceTitle.length >= 5
    && (amazonTitle.includes(sourceTitle) || sourceTitle.includes(amazonTitle) || verifiedTitle.includes(sourceTitle) || sourceTitle.includes(verifiedTitle));
  if (!titleOverlap && (isbnVerification.score ?? 0) < 0.98) return false;

  return true;
}

function editionCompatible(source, candidate) {
  const sourceEdition = editionMarker(source);
  const candidateEdition = editionMarker(candidate);
  return !sourceEdition || !candidateEdition || sourceEdition === candidateEdition;
}

function editionMarker(value) {
  const normalized = normalizeText(value).normalize("NFKC");
  const match = normalized.match(/(?:第\s*)?([0-9]+)\s*版|([0-9]+)(?:st|nd|rd|th)\s+ed(?:ition)?/i);
  return match ? String(match[1] ?? match[2]) : "";
}

function buildLinkedRow(row, cache) {
  const textLinks = linksForBooks(rowBooks(row, 7), cache);
  const referenceLinks = linksForBooks(rowBooks(row, 12), cache);
  const cleanedRow = row.map((value) => stripAmazonUrls(value));
  return [
    ...cleanedRow.slice(0, 8),
    textLinks,
    ...cleanedRow.slice(8, 12),
    cleanedRow[12] ?? "",
    referenceLinks,
    ...cleanedRow.slice(13, 17),
  ];
}

function stripAmazonUrls(value) {
  return normalizeText(value)
    .replace(/https:\/\/www\.amazon\.co\.jp\/(?:[^ \t\n]+\/)?(?:dp|gp\/product)\/[A-Z0-9]{10}\/?/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function linksForBooks(books, cache) {
  if (!books.length) return "";
  const links = books.map((book) => safeCacheLink(cache[bookKey(book)]));
  if (links.every((link) => !link)) return "";
  return links.join(DELIMITER);
}

function safeCacheLink(entry) {
  if (!entry?.link || !LINK_ALLOWED_STATUSES.has(entry.status)) return "";
  return entry.link;
}

function fileStats(file, baseRows, linkedRows, cache) {
  const books = [
    ...baseRows.slice(1).flatMap((row) => rowBooks(row, 7)),
    ...baseRows.slice(1).flatMap((row) => rowBooks(row, 12)),
  ];
  const linked = books.filter((book) => safeCacheLink(cache[bookKey(book)])).length;
  return {
    file,
    rows: linkedRows.length - 1,
    books: books.length,
    linked,
    missing: books.length - linked,
  };
}

function missingEntriesForFile(file, rows, cache) {
  const { day, period } = parseSyllabusFileName(file);
  const entries = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    for (const source of [
      { type: "教科書", titleIndex: 7 },
      { type: "参考書", titleIndex: 12 },
    ]) {
      for (const book of rowBooks(row, source.titleIndex)) {
        const cacheEntry = cache[bookKey(book)] ?? {};
        if (safeCacheLink(cacheEntry)) continue;
        entries.push({
          file: path.basename(file),
          day,
          period,
          rowNumber: rowIndex + 1,
          sourceType: source.type,
          course: row[0] ?? "",
          department: row[1] ?? "",
          title: book.title,
          author: book.author,
          publisher: book.publisher,
          isbn: book.isbn,
          status: cacheEntry.status ?? "uncached",
          reason: cacheEntry.reason ?? "",
        });
      }
    }
  }
  return entries;
}

function parseSyllabusFileName(file) {
  const match = path.basename(file, ".xlsx").match(/^(.+曜日)_(\d+)限$/);
  return {
    day: match?.[1] ?? "",
    period: match?.[2] ? `${match[2]}限` : "",
  };
}

async function writeMissingReport(rows, audit) {
  const sortedRows = [...rows].sort(compareMissingRows);
  const byPeriod = buildMissingByPeriod(sortedRows, audit);
  const summaryRows = byPeriod.periods.map((period) =>
    `| ${escapeMarkdownCell(period.day)} | ${escapeMarkdownCell(period.period)} | ${period.books} | ${period.linked} | ${period.missing} |`
  );
  const detailRows = sortedRows.map((row, index) =>
    [
      index + 1,
      row.day,
      row.period,
      row.sourceType,
      row.rowNumber,
      row.course,
      row.department,
      row.title,
      row.author,
      row.publisher,
      row.isbn,
      row.status,
      row.reason,
    ].map(escapeMarkdownCell).join(" | ")
  );

  const content = [
    "# Amazonリンク空欄一覧",
    "",
    `生成日時: ${audit.generatedAt}`,
    `resolverVersion: ${audit.resolverVersion}`,
    `空欄件数: ${rows.length}`,
    "",
    "## 曜日・時限別件数",
    "",
    "| 曜日 | 時限 | 書籍総数 | リンク確認済み | 空欄件数 |",
    "| --- | --- | ---: | ---: | ---: |",
    ...summaryRows,
    "",
    "## 明細",
    "",
    "| No | 曜日 | 時限 | 区分 | Excel行 | 授業科目名 | 学部･研究科 | 書名 | 著者 | 出版社 | ISBN/備考 | 状態 | 理由 |",
    "| ---: | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...detailRows.map((row) => `| ${row} |`),
    "",
  ].join("\n");

  await writeFile(MISSING_REPORT_FILE, content, "utf8");
  await writeFile(MISSING_REPORT_JSON_FILE, `${JSON.stringify(sortedRows, null, 2)}\n`, "utf8");
  await writeFile(MISSING_BY_PERIOD_JSON_FILE, `${JSON.stringify(byPeriod, null, 2)}\n`, "utf8");
  await writeFile(MISSING_BY_PERIOD_REPORT_FILE, missingByPeriodMarkdown(byPeriod), "utf8");
}

function buildMissingByPeriod(rows, audit) {
  const entriesByPeriod = new Map();
  for (const row of rows) {
    const key = periodKey(row.day, row.period);
    if (!entriesByPeriod.has(key)) entriesByPeriod.set(key, []);
    entriesByPeriod.get(key).push(row);
  }

  const periods = audit.files.map((fileStats) => {
    const { day, period } = parseSyllabusFileName(fileStats.file);
    const entries = entriesByPeriod.get(periodKey(day, period)) ?? [];
    return {
      day,
      period,
      file: path.basename(fileStats.file),
      rows: fileStats.rows,
      books: fileStats.books,
      linked: fileStats.linked,
      missing: fileStats.missing,
      entries,
    };
  }).sort(comparePeriods);

  return {
    generatedAt: audit.generatedAt,
    resolverVersion: audit.resolverVersion,
    totals: periods.reduce((total, period) => ({
      rows: total.rows + period.rows,
      books: total.books + period.books,
      linked: total.linked + period.linked,
      missing: total.missing + period.missing,
    }), { rows: 0, books: 0, linked: 0, missing: 0 }),
    periods,
  };
}

function missingByPeriodMarkdown(report) {
  const lines = [
    "# Amazonリンク空欄一覧（曜日・時限別）",
    "",
    `生成日時: ${report.generatedAt}`,
    `resolverVersion: ${report.resolverVersion}`,
    `書籍総数: ${report.totals.books}`,
    `リンク確認済み: ${report.totals.linked}`,
    `空欄件数: ${report.totals.missing}`,
    "",
    "## サマリー",
    "",
    "| 曜日 | 時限 | 書籍総数 | リンク確認済み | 空欄件数 |",
    "| --- | --- | ---: | ---: | ---: |",
    ...report.periods.map((period) =>
      `| ${escapeMarkdownCell(period.day)} | ${escapeMarkdownCell(period.period)} | ${period.books} | ${period.linked} | ${period.missing} |`
    ),
    "",
    "## 明細",
    "",
  ];

  for (const period of report.periods) {
    lines.push(`### ${period.day} ${period.period}`, "");
    lines.push(`書籍総数: ${period.books} / リンク確認済み: ${period.linked} / 空欄件数: ${period.missing}`, "");
    if (!period.entries.length) {
      lines.push("空欄なし", "");
      continue;
    }
    lines.push("| No | 区分 | Excel行 | 授業科目名 | 学部･研究科 | 書名 | 著者 | 出版社 | ISBN/備考 | 状態 | 理由 |");
    lines.push("| ---: | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |");
    period.entries.forEach((row, index) => {
      lines.push(`| ${[
        index + 1,
        row.sourceType,
        row.rowNumber,
        row.course,
        row.department,
        row.title,
        row.author,
        row.publisher,
        row.isbn,
        row.status,
        row.reason,
      ].map(escapeMarkdownCell).join(" | ")} |`);
    });
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function compareMissingRows(left, right) {
  return comparePeriods(left, right)
    || (left.rowNumber ?? 0) - (right.rowNumber ?? 0)
    || String(left.sourceType).localeCompare(String(right.sourceType), "ja")
    || String(left.title).localeCompare(String(right.title), "ja");
}

function comparePeriods(left, right) {
  return dayIndex(left.day) - dayIndex(right.day)
    || periodNumber(left.period) - periodNumber(right.period);
}

function dayIndex(day) {
  const index = DAY_ORDER.indexOf(day);
  return index === -1 ? DAY_ORDER.length : index;
}

function periodNumber(period) {
  return Number(String(period).match(/\d+/)?.[0] ?? 99);
}

function periodKey(day, period) {
  return `${day}_${period}`;
}

function escapeMarkdownCell(value) {
  return normalizeText(value)
    .replace(/\n/g, "<br>")
    .replace(/\|/g, "\\|");
}

function bibliographyTitleQueries(title) {
  const raw = normalizeText(title).split(DELIMITER)[0];
  const queries = new Set();
  const stripped = raw
    .replace(/[『』「」]/g, "")
    .replace(/[（(][^)）]*(?:版|edition|ed\.)[^)）]*[)）]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  for (const candidate of [
    stripped,
    stripped.replace(/[（(][^)）]+[)）]/g, "").trim(),
    stripped.replace(/[:：].*$/, "").trim(),
    stripped.replace(/[〈《<].*[>》〉]/g, "").trim(),
  ]) {
    if (candidate) queries.add(candidate);
  }

  return [...queries].slice(0, 4);
}

async function writeWorkbook(file, sheetName, rows) {
  const workbook = Workbook.create();
  const sheet = workbook.worksheets.add(safeSheetName(sheetName));
  const rowCount = rows.length;
  const columnCount = LINKED_COLUMNS.length;
  const range = sheet.getRangeByIndexes(0, 0, rowCount, columnCount);
  range.values = rows;
  range.format.wrapText = true;
  range.format.verticalAlignment = "top";

  const header = sheet.getRangeByIndexes(0, 0, 1, columnCount);
  header.format.font = { bold: true, color: "#FFFFFF" };
  header.format.fill = "#1F4E78";
  header.format.wrapText = false;
  header.format.rowHeightPx = 28;

  const widths = [220, 140, 80, 100, 110, 100, 180, 230, 260, 180, 160, 130, 340, 230, 260, 180, 160, 130, 340];
  for (let column = 0; column < columnCount; column += 1) {
    sheet.getRangeByIndexes(0, column, rowCount, 1).format.columnWidthPx = widths[column] ?? 140;
  }

  sheet.freezePanes.freezeRows(1);
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(file);
}

function attr(html, name) {
  const match = html.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? xmlUnescape(match[1]) : "";
}

function dpAsin(block) {
  const match = block.match(/\/dp\/([A-Z0-9]{10})(?:[/?"]|&)/);
  return match?.[1] ?? "";
}

function titleFromBlock(block) {
  const aria = block.match(/<h2\b[^>]*aria-label="([^"]+)"/i);
  if (aria) return xmlUnescape(aria[1]);
  const h2 = block.match(/<h2\b[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
  if (h2) return stripTags(h2[1]);
  const alt = block.match(/<img\b[^>]*alt="([^"]+)"/i);
  return alt ? xmlUnescape(alt[1]) : "";
}

function stripTags(html) {
  return xmlUnescape(String(html).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function firstTagText(xml, tagName) {
  return tagTexts(xml, tagName)[0] ?? "";
}

function tagTexts(xml, tagName) {
  const escapedName = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [];
  const pattern = new RegExp(`<${escapedName}\\b[^>]*>([\\s\\S]*?)<\\/${escapedName}>`, "g");
  for (const match of String(xml).matchAll(pattern)) matches.push(cleanXmlText(match[1]));
  return matches;
}

function cleanXmlText(value) {
  return xmlUnescape(String(value)
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function dedupeByAsin(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.asin)) return false;
    seen.add(candidate.asin);
    return true;
  });
}

function bestIsbn(value) {
  if (/^\s*\d+(?:\.\d+)?e[+-]?\d+\s*$/i.test(String(value ?? ""))) {
    return null;
  }
  const cleaned = String(value ?? "").replace(/\bISBN(?:-1[03])?\b/gi, "").replace(/\b1[03]\s*:/g, " ");
  const matches = cleaned.match(/[0-9Xx][0-9Xx\-\s]{8,25}[0-9Xx]/g) ?? [];
  for (const match of matches) {
    const compact = match.replace(/[^0-9Xx]/g, "").toUpperCase();
    if (compact.length === 13 && isValidIsbn13(compact)) {
      return { isbn13: compact, isbn10: compact.startsWith("978") ? isbn13To10(compact) : "" };
    }
    if (compact.length === 10 && isValidIsbn10(compact)) {
      return { isbn10: compact, isbn13: "" };
    }
  }
  const compact = cleaned.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (compact.length === 13 && isValidIsbn13(compact)) {
    return { isbn13: compact, isbn10: compact.startsWith("978") ? isbn13To10(compact) : "" };
  }
  if (compact.length === 10 && isValidIsbn10(compact)) {
    return { isbn10: compact, isbn13: "" };
  }
  return null;
}

function isbn13To10(isbn13) {
  const body = isbn13.slice(3, 12);
  let sum = 0;
  for (let index = 0; index < 9; index += 1) sum += Number(body[index]) * (10 - index);
  const check = (11 - (sum % 11)) % 11;
  return `${body}${check === 10 ? "X" : String(check)}`;
}

function isbn10To13(isbn10) {
  const body = `978${isbn10.slice(0, 9)}`;
  const sum = [...body].reduce((total, char, index) => {
    return total + Number(char) * (index % 2 === 0 ? 1 : 3);
  }, 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

function isValidIsbn10(isbn) {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  const sum = [...isbn].reduce((total, char, index) => {
    const value = char === "X" ? 10 : Number(char);
    return total + value * (10 - index);
  }, 0);
  return sum % 11 === 0;
}

function isValidIsbn13(isbn) {
  if (!/^\d{13}$/.test(isbn)) return false;
  const sum = [...isbn.slice(0, 12)].reduce((total, char, index) => {
    return total + Number(char) * (index % 2 === 0 ? 1 : 3);
  }, 0);
  return (10 - (sum % 10)) % 10 === Number(isbn[12]);
}

function isLikelyNonRetailText(title) {
  const text = normalizeText(title).toLowerCase().normalize("NFKC").replace(/\s+/g, "");
  if (!text) return true;
  return looksLikeCourseMaterialTitle(text);
}

function looksLikeCourseMaterialTitle(title) {
  const text = normalizeText(title).toLowerCase().normalize("NFKC").replace(/\s+/g, "");
  if (!text) return true;
  if ([
    "無",
    "なし",
    "無し",
    "特になし",
    "ありません",
    "不要",
    "指定なし",
    "該当なし",
    "notextbook",
    "none",
    "n/a",
  ].includes(text)) return true;

  return [
    /^購入不要/,
    /^授業(中|内|時|で)(に)?(指示|紹介|配布)/,
    /^必要に応じて(指示|紹介|配布)/,
    /^適宜(指示|紹介|配布)/,
    /^(プリント|レジュメ|資料|配布資料|講義資料|授業資料)(を)?(配布|使用|掲載|予定)?$/,
    /^(manaba|moodle|web|オンライン).*(配布|掲載|提示)/,
    /^(自作|教員作成).*(教材|資料|テキスト)?$/,
  ].some((pattern) => pattern.test(text));
}

function splitCell(value) {
  return normalizeText(value).split(DELIMITER).map((item) => item.trim()).filter(Boolean);
}

function bookKey(book) {
  return [book.title, book.author, book.publisher, book.isbn].map(normalizeText).join("\u001f");
}

function extractAmazonDpLink(value) {
  const match = String(value ?? "").match(/https:\/\/www\.amazon\.co\.jp\/(?:[^ \t\n]+\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  return match ? `https://www.amazon.co.jp/dp/${match[1].toUpperCase()}` : "";
}

function normalizeComparable(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[「」『』【】（）()［\]\[\]〈〉《》“”"'’‘.,，、。・:：;；\s\-_―—–~〜]/g, "")
    .replace(/第([0-9０-９]+)版/g, "$1版");
}

function similarity(left, right) {
  if (!left || !right) return 0;
  const leftChars = [...left];
  const rightChars = [...right];
  const previous = Array(rightChars.length + 1).fill(0);
  const current = Array(rightChars.length + 1).fill(0);
  for (let i = 1; i <= leftChars.length; i += 1) {
    for (let j = 1; j <= rightChars.length; j += 1) {
      current[j] = leftChars[i - 1] === rightChars[j - 1]
        ? previous[j - 1] + 1
        : Math.max(previous[j], current[j - 1]);
    }
    previous.splice(0, previous.length, ...current);
    current.fill(0);
  }
  return previous[rightChars.length] / Math.max(leftChars.length, rightChars.length);
}

function normalizeText(value) {
  if (value == null) return "";
  return String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .trim();
}

function isCaptchaPage(html) {
  return /opfcaptcha|Robot Check|ロボットではない|Enter the characters you see below|Type the characters you see in this image/i.test(html);
}

function columnLabelToIndex(label) {
  let index = 0;
  for (const char of label) index = index * 26 + char.charCodeAt(0) - 64;
  return index - 1;
}

function xmlUnescape(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function safeSheetName(name) {
  return String(name).replace(/[:\\/?*\[\]]/g, "_").slice(0, 31) || "Sheet1";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
