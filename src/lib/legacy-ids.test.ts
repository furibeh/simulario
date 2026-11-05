import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { locales } from "../i18n/config";
import { legacyLessonIds, legacyPageIds, legacyPathIds } from "./legacy-ids";

const rules = readFileSync(new URL("../../public/_redirects", import.meta.url), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

describe("redirects for renamed ids", () => {
  it("send every old URL to its new one with a 301, in both languages", () => {
    const expected: string[] = [];
    for (const [oldPath, newPath] of Object.entries(legacyPathIds)) {
      for (const lang of locales) expected.push(`/${lang}/${oldPath} /${lang}/${newPath} 301`);
      for (const [oldLesson, newLesson] of Object.entries(legacyLessonIds)) {
        for (const lang of locales) {
          expected.push(`/${lang}/${oldPath}/${oldLesson} /${lang}/${newPath}/${newLesson} 301`);
        }
      }
    }
    for (const [oldPage, newPage] of Object.entries(legacyPageIds)) {
      for (const lang of locales) expected.push(`/${lang}/${oldPage} /${lang}/${newPage} 301`);
    }
    expect([...rules].sort()).toEqual([...expected].sort());
  });
});
