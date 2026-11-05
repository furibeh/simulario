import { describe, expect, it } from "vitest";
import {
  groupResults,
  isSearchShortcut,
  parseExcerpt,
  resultCountKey,
  resultHref,
  type SearchHit,
  toHit,
} from "./search";

describe("resultHref", () => {
  it("drops the .html the file build adds", () => {
    expect(resultHref("/es.html")).toBe("/es");
    expect(resultHref("/en/databases.html")).toBe("/en/databases");
    expect(resultHref("/es/operating-systems/cpu-scheduling.html")).toBe(
      "/es/operating-systems/cpu-scheduling",
    );
  });

  it("keeps the hash and the query", () => {
    expect(resultHref("/es/databases/mvcc-snapshots.html#explain")).toBe(
      "/es/databases/mvcc-snapshots#explain",
    );
    expect(resultHref("/en/about.html?x=1#team")).toBe("/en/about?x=1#team");
  });

  it("leaves clean URLs alone", () => {
    expect(resultHref("/en/operating-systems/paging")).toBe("/en/operating-systems/paging");
  });
});

describe("parseExcerpt", () => {
  it("splits plain and marked runs", () => {
    expect(parseExcerpt("una <mark>instantánea</mark> fija las <mark>versiones</mark>.")).toEqual([
      { text: "una ", marked: false },
      { text: "instantánea", marked: true },
      { text: " fija las ", marked: false },
      { text: "versiones", marked: true },
      { text: ".", marked: false },
    ]);
  });

  it("joins adjacent marks into one run", () => {
    expect(parseExcerpt("<mark>write</mark><mark> skew</mark> here")).toEqual([
      { text: "write skew", marked: true },
      { text: " here", marked: false },
    ]);
  });

  it("decodes only the brackets Pagefind escapes", () => {
    expect(parseExcerpt("std::atomic&lt;<mark>int</mark>&gt; &amp; more")).toEqual([
      { text: "std::atomic<", marked: false },
      { text: "int", marked: true },
      { text: "> &amp; more", marked: false },
    ]);
  });

  it("marks the rest when a <mark> is never closed", () => {
    expect(parseExcerpt("a <mark>b c")).toEqual([
      { text: "a ", marked: false },
      { text: "b c", marked: true },
    ]);
  });

  it("returns nothing for an empty excerpt", () => {
    expect(parseExcerpt("")).toEqual([]);
  });
});

describe("toHit", () => {
  it("reads the URL, title, path and module", () => {
    expect(
      toHit({
        url: "/en/databases/mvcc-snapshots.html",
        excerpt: "<mark>snapshot</mark>",
        meta: {
          title: "MVCC and snapshots",
          path_id: "databases",
          path: "Databases",
          module: "Module 7: MVCC and snapshots",
        },
      }),
    ).toEqual({
      href: "/en/databases/mvcc-snapshots",
      title: "MVCC and snapshots",
      pathId: "databases",
      pathTitle: "Databases",
      module: "Module 7: MVCC and snapshots",
      excerpt: [{ text: "snapshot", marked: true }],
    });
  });

  it("rejects data without a URL or title", () => {
    expect(toHit(null)).toBeUndefined();
    expect(toHit({ url: "/es.html", meta: {} })).toBeUndefined();
    expect(toHit({ meta: { title: "Simulario" } })).toBeUndefined();
  });
});

function hit(href: string, pathId?: string): SearchHit {
  return { href, title: href, pathId, pathTitle: pathId, excerpt: [] };
}

describe("groupResults", () => {
  it("groups by path in order of each group's best hit, keeping the rank inside", () => {
    const groups = groupResults(
      [
        hit("/es/databases/mvcc-snapshots", "databases"),
        hit("/es/operating-systems/deadlock", "operating-systems"),
        hit("/es/about"),
        hit("/es/databases/two-phase-locking", "databases"),
      ],
      "es",
    );
    expect(groups.map((g) => [g.pathId, g.hits.map((h) => h.href)])).toEqual([
      ["databases", ["/es/databases/mvcc-snapshots", "/es/databases/two-phase-locking"]],
      ["operating-systems", ["/es/operating-systems/deadlock"]],
      [undefined, ["/es/about"]],
    ]);
  });

  it("drops hits from another locale", () => {
    const groups = groupResults(
      [hit("/en/databases", "databases"), hit("/es"), hit("/esx/a"), hit("/es#paths")],
      "es",
    );
    expect(groups.map((g) => g.hits.map((h) => h.href))).toEqual([["/es", "/es#paths"]]);
  });

  it("returns no groups for no hits", () => {
    expect(groupResults([], "en")).toEqual([]);
  });
});

describe("resultCountKey", () => {
  it("picks none, one or other", () => {
    expect(resultCountKey(0, "es")).toBe("search.count.none");
    expect(resultCountKey(1, "es")).toBe("search.count.one");
    expect(resultCountKey(1, "en")).toBe("search.count.one");
    expect(resultCountKey(2, "en")).toBe("search.count.other");
    expect(resultCountKey(15, "es")).toBe("search.count.other");
  });
});

describe("isSearchShortcut", () => {
  const keys = { key: "/", ctrlKey: false, metaKey: false, altKey: false };

  it("opens with / outside fields, whatever Shift does", () => {
    expect(isSearchShortcut(keys, false)).toBe(true);
    // A real KeyboardEvent also carries shiftKey ("/" is Shift+7 on Spanish keyboards).
    const shifted = { ...keys, shiftKey: true };
    expect(isSearchShortcut(shifted, false)).toBe(true);
  });

  it("ignores / inside a field or with Ctrl, ⌘ or Alt", () => {
    expect(isSearchShortcut(keys, true)).toBe(false);
    expect(isSearchShortcut({ ...keys, ctrlKey: true }, false)).toBe(false);
    expect(isSearchShortcut({ ...keys, metaKey: true }, false)).toBe(false);
    expect(isSearchShortcut({ ...keys, altKey: true }, false)).toBe(false);
  });

  it("opens with Ctrl+K or ⌘K anywhere", () => {
    const k = { ...keys, key: "k" };
    expect(isSearchShortcut({ ...k, ctrlKey: true }, true)).toBe(true);
    expect(isSearchShortcut({ ...k, metaKey: true }, false)).toBe(true);
    expect(isSearchShortcut({ ...k, key: "K", ctrlKey: true }, false)).toBe(true);
  });

  it("ignores K alone, with both Ctrl and ⌘, or with Alt", () => {
    const k = { ...keys, key: "k" };
    expect(isSearchShortcut(k, false)).toBe(false);
    expect(isSearchShortcut({ ...k, ctrlKey: true, metaKey: true }, false)).toBe(false);
    expect(isSearchShortcut({ ...k, ctrlKey: true, altKey: true }, false)).toBe(false);
  });
});
