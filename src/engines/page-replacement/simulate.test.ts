import { describe, expect, it } from "vitest";
import { presets } from "./presets";
import { faultTable, simulate } from "./simulate";
import type { Algorithm, ReplacementExplanation, ReplacementTrace } from "./types";

/**
 * Expected values are hand-computed in docs/lessons/reemplazo-paginas.md ("Expected results").
 * Never regenerate them from the engine's output.
 */

const marks = (trace: ReplacementTrace) =>
  trace.result.records.map((r) => (r.hit ? "·" : "F")).join(" ");

const finalFrames = (trace: ReplacementTrace) => trace.steps.at(-1)?.state.slots.join(" ");

const victims = (trace: ReplacementTrace) =>
  trace.result.records.flatMap((r) => (r.victim === null ? [] : [r.victim]));

const run = (algorithm: Algorithm, frames: number, refs = presets.belady) =>
  simulate({ refs, frames, algorithm });

function formatKey(e: ReplacementExplanation): string {
  switch (e.key) {
    case "hit":
    case "load":
    case "clock.clear":
      return `${e.key} ${e.params.page}@${e.params.slot}`;
    case "evict.opt":
      return `${e.key} ${e.params.victim}@${e.params.slot} next ${e.params.next}`;
    default:
      return `${e.key} ${e.params.victim}@${e.params.slot}`;
  }
}

const keys = (trace: ReplacementTrace, ref: number) =>
  trace.steps[ref - 1]?.explain.map(formatKey).join(", ");

describe("preset: belady", () => {
  const table: [Algorithm, number, string, number, string, number[]][] = [
    ["fifo", 3, "F F F F F F F · · F F ·", 9, "5 3 4", [1, 2, 3, 4, 1, 2]],
    ["fifo", 4, "F F F F · · F F F F F F", 10, "4 5 2 3", [1, 2, 3, 4, 5, 1]],
    ["lru", 3, "F F F F F F F · · F F F", 10, "3 4 5", [1, 2, 3, 4, 5, 1, 2]],
    ["lru", 4, "F F F F · · F · · F F F", 8, "5 2 4 3", [3, 4, 5, 1]],
    ["opt", 3, "F F F F · · F · · F F ·", 7, "4 2 5", [3, 4, 1, 3]],
    ["opt", 4, "F F F F · · F · · · F ·", 6, "4 2 3 5", [4, 1]],
    ["clock", 3, "F F F F F F F · · F F ·", 9, "5 3 4", [1, 2, 3, 4, 1, 2]],
    ["clock", 4, "F F F F · · F F F F F F", 10, "4 5 2 3", [1, 2, 3, 4, 5, 1]],
  ];
  for (const [algorithm, frames, expectedMarks, faults, final, expectedVictims] of table) {
    it(`${algorithm} with ${frames} frames`, () => {
      const trace = run(algorithm, frames);
      expect(marks(trace)).toBe(expectedMarks);
      expect(trace.result.faults).toBe(faults);
      expect(finalFrames(trace)).toBe(final);
      expect(victims(trace)).toEqual(expectedVictims);
      expect(trace.result.compulsory).toBe(5);
    });
  }

  it("FIFO 4: hits leave the queue alone; reference 7 evicts page 1", () => {
    const trace = run("fifo", 4);
    expect(trace.steps[4]?.state.queue).toEqual([1, 2, 3, 4]);
    expect(trace.steps[5]?.state.queue).toEqual([1, 2, 3, 4]);
    expect(keys(trace, 7)).toBe("evict.fifo 1@0");
  });

  it("LRU 4: reference 7 evicts the least recent page", () => {
    const trace = run("lru", 4);
    expect(trace.steps[5]?.state.recency).toEqual([3, 4, 1, 2]);
    expect(keys(trace, 7)).toBe("evict.lru 3@2");
  });

  it("OPT 3: next uses and ties", () => {
    const trace = run("opt", 3);
    expect(keys(trace, 4)).toBe("evict.opt 3@2 next 10");
    expect(keys(trace, 7)).toBe("evict.opt 4@2 next 11");
    expect(keys(trace, 10)).toBe("evict.opt.never 1@0");
    expect(keys(trace, 11)).toBe("evict.opt.never 3@0");
  });

  it("Clock 3: second chances and the hand", () => {
    const trace = run("clock", 3);
    expect(keys(trace, 4)).toBe(
      "clock.clear 1@0, clock.clear 2@1, clock.clear 3@2, evict.clock 1@0",
    );
    expect(trace.steps[3]?.state.hand).toBe(1);
    expect(trace.steps[3]?.state.bits).toEqual([1, 0, 0]);
    expect(keys(trace, 5)).toBe("evict.clock 2@1");
    expect(trace.steps[4]?.state.hand).toBe(2);
    expect(keys(trace, 10)).toBe(
      "clock.clear 1@1, clock.clear 2@2, clock.clear 5@0, evict.clock 1@1",
    );
    expect(trace.steps[9]?.state.hand).toBe(2);
  });

  it("comparison table", () => {
    const t = faultTable(presets.belady);
    expect(t.fifo).toEqual([12, 12, 9, 10, 5, 5]);
    expect(t.lru).toEqual([12, 12, 10, 8, 5, 5]);
  });
});

describe("preset: classic (Clásica), 3 frames", () => {
  it("ranks OPT, LRU, Clock and FIFO", () => {
    expect(run("fifo", 3, presets.classic).result.faults).toBe(15);
    expect(run("lru", 3, presets.classic).result.faults).toBe(12);
    expect(run("opt", 3, presets.classic).result.faults).toBe(9);
    const clock = run("clock", 3, presets.classic);
    const faultRefs = clock.result.records.flatMap((r) => (r.hit ? [] : [r.index + 1]));
    expect(faultRefs).toEqual([1, 2, 3, 4, 6, 8, 9, 11, 12, 14, 15, 16, 18, 20]);
    expect(finalFrames(clock)).toBe("0 7 1");
  });
});

describe("edge cases", () => {
  it("one frame", () => {
    for (const algorithm of ["fifo", "lru", "opt", "clock"] as const) {
      expect(marks(simulate({ refs: [1, 1, 2, 1], frames: 1, algorithm }))).toBe("F · F F");
    }
  });

  it("everything fits: only compulsory faults", () => {
    for (const algorithm of ["fifo", "lru", "opt", "clock"] as const) {
      expect(run(algorithm, 5).result.faults).toBe(5);
    }
  });

  it("rejects invalid inputs", () => {
    expect(() => simulate({ refs: [10], frames: 3, algorithm: "fifo" })).toThrow(RangeError);
    expect(() => simulate({ refs: [1], frames: 0, algorithm: "fifo" })).toThrow(RangeError);
    expect(() =>
      simulate({ refs: Array<number>(21).fill(1), frames: 3, algorithm: "fifo" }),
    ).toThrow(RangeError);
  });
});
