import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_SEARCH_DATA_URL, readCanonicalSearchData } from './search-data-runtime.mjs';
import { validateSearchData } from './search-data-validation.mjs';

const sourceArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const strictWarnings = process.argv.includes('--strict-warnings');
const sourceUrl = sourceArgument ? pathToFileURL(resolve(sourceArgument)) : DEFAULT_SEARCH_DATA_URL;

function printIssues(label, issues) {
  if (issues.length === 0) {
    return;
  }

  console.log(`${label} (${issues.length})`);
  issues.forEach((issue) => {
    console.log(`- [${issue.code}] ${issue.path}: ${issue.message}`);
  });
}

try {
  const payload = await readCanonicalSearchData(sourceUrl);
  const report = validateSearchData(payload);

  printIssues('警告', report.warnings);
  printIssues('エラー', report.errors);

  console.log(
    `検索データ: version ${report.stats.version}, entries ${report.stats.entries}, facilityRings ${report.stats.facilityRings}`
  );

  if (report.errors.length > 0 || (strictWarnings && report.warnings.length > 0)) {
    process.exitCode = 1;
  } else {
    console.log('検索データ検査: OK');
  }
} catch (error) {
  console.error(`検索データを検査できませんでした: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
