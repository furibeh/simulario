import { describe, expect, it } from "vitest";
import { withoutDrafts } from "./drafts";

const catalog = {
  paths: [
    { id: "operating-systems", data: { draft: false } },
    { id: "databases", data: { draft: true } },
  ],
  modules: [
    { id: "deadlock", data: { path: { id: "operating-systems" } } },
    { id: "isolation", data: { path: { id: "databases" } } },
  ],
  lessons: [
    { id: "es/deadlock", data: { module: { id: "deadlock" } } },
    { id: "es/isolation-anomalies", data: { module: { id: "isolation" } } },
  ],
};

describe("draft paths", () => {
  it("leave production builds with their modules and lessons", () => {
    const shown = withoutDrafts(catalog, false);
    expect(shown.paths.map((p) => p.id)).toEqual(["operating-systems"]);
    expect(shown.modules.map((m) => m.id)).toEqual(["deadlock"]);
    expect(shown.lessons.map((l) => l.id)).toEqual(["es/deadlock"]);
  });

  it("stay in development builds", () => {
    expect(withoutDrafts(catalog, true)).toEqual(catalog);
  });
});
