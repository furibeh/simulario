// Checks the Pagefind index after `pnpm build` (CI step "Search index").
// There must be one index per locale, and each must hold every page of that locale except
// the ones kept out on purpose (404 and the search page itself): no more, no fewer.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dist = "dist";
const locales = ["es", "en"];
const notIndexed = new Set(["404.html", "search.html"]);

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith(".html") && !notIndexed.has(entry.name) ? [path] : [];
  });
}

const errors = [];
if (!existsSync(join(dist, "pagefind", "pagefind.js")))
  errors.push("dist/pagefind/pagefind.js is missing");

const entryPath = join(dist, "pagefind", "pagefind-entry.json");
let languages = {};
if (existsSync(entryPath)) languages = JSON.parse(readFileSync(entryPath, "utf8")).languages;
else errors.push("dist/pagefind/pagefind-entry.json is missing");

const found = Object.keys(languages).sort();
if (found.join() !== [...locales].sort().join()) {
  errors.push(`indexes for [${found}], expected [${locales}]`);
}
for (const locale of locales) {
  const expected =
    htmlFiles(join(dist, locale)).length + (existsSync(join(dist, `${locale}.html`)) ? 1 : 0);
  const indexed = languages[locale]?.page_count ?? 0;
  if (indexed !== expected)
    errors.push(`${locale}: ${indexed} pages indexed, expected ${expected}`);
  else console.log(`${locale}: ${indexed} pages indexed`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`Search index: ${error}`);
  process.exit(1);
}
