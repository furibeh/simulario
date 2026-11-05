import { describe, expect, it } from "vitest";
import {
  isCompleted,
  isUnlocked,
  markCompleted,
  markUnlocked,
  PROGRESS_KEY,
  readProgress,
} from "./progress";

function memory(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(PROGRESS_KEY, initial);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("progress", () => {
  it("starts empty", () => {
    expect(readProgress(memory())).toEqual({ v: 1, lessons: {} });
  });

  it("marks a lesson completed once and keeps the first date", () => {
    const storage = memory();
    markCompleted(storage, "cpu-scheduling", new Date("2026-11-02T10:00:00Z"));
    markCompleted(storage, "cpu-scheduling", new Date("2026-11-05T10:00:00Z"));
    const progress = readProgress(storage);
    expect(progress.lessons["cpu-scheduling"]?.completedAt).toBe("2026-11-02T10:00:00.000Z");
    expect(isCompleted(progress, "cpu-scheduling")).toBe(true);
    expect(isCompleted(progress, "otra")).toBe(false);
  });

  it("ignores corrupt or foreign data", () => {
    expect(readProgress(memory("not json"))).toEqual({ v: 1, lessons: {} });
    expect(readProgress(memory('{"v":2,"lessons":{}}'))).toEqual({ v: 1, lessons: {} });
    expect(readProgress(memory("null"))).toEqual({ v: 1, lessons: {} });
  });

  it("moves progress stored under an old Spanish lesson id to its new id", () => {
    const stored = {
      v: 1,
      lessons: {
        "planificador-cpu": { unlockedAt: "2026-11-02T09:00:00.000Z" },
        interbloqueo: { completedAt: "2026-11-03T10:00:00.000Z" },
        // Visited again after the rename, so both ids hold progress.
        paging: { unlockedAt: "2026-11-06T10:00:00.000Z" },
        paginacion: {
          unlockedAt: "2026-11-01T10:00:00.000Z",
          completedAt: "2026-11-01T11:00:00.000Z",
        },
      },
    };
    const progress = readProgress(memory(JSON.stringify(stored)));
    expect(progress.lessons).toEqual({
      "cpu-scheduling": { unlockedAt: "2026-11-02T09:00:00.000Z" },
      deadlock: { completedAt: "2026-11-03T10:00:00.000Z" },
      paging: { unlockedAt: "2026-11-01T10:00:00.000Z", completedAt: "2026-11-01T11:00:00.000Z" },
    });
    expect(isCompleted(progress, "deadlock")).toBe(true);
  });

  it("saves the renamed ids on the next write", () => {
    const storage = memory(
      '{"v":1,"lessons":{"interbloqueo":{"unlockedAt":"2026-11-03T10:00:00.000Z"}}}',
    );
    markCompleted(storage, "paging", new Date("2026-11-07T10:00:00Z"));
    const saved = JSON.parse(storage.getItem(PROGRESS_KEY) ?? "{}");
    expect(Object.keys(saved.lessons).sort()).toEqual(["deadlock", "paging"]);
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readProgress(broken)).toEqual({ v: 1, lessons: {} });
    expect(isCompleted(markCompleted(broken, "x", new Date(0)), "x")).toBe(true);
    expect(readProgress(undefined)).toEqual({ v: 1, lessons: {} });
  });

  it("unlocks gated stages once, and completion implies unlocked", () => {
    const storage = memory();
    expect(isUnlocked(readProgress(storage), "a")).toBe(false);
    markUnlocked(storage, "a", new Date("2026-11-02T10:00:00Z"));
    markUnlocked(storage, "a", new Date("2026-11-03T10:00:00Z"));
    const progress = readProgress(storage);
    expect(progress.lessons["a"]?.unlockedAt).toBe("2026-11-02T10:00:00.000Z");
    expect(isUnlocked(progress, "a")).toBe(true);
    expect(isCompleted(progress, "a")).toBe(false);
    expect(isUnlocked(markCompleted(storage, "b", new Date(0)), "b")).toBe(true);
  });
});
