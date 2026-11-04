import { describe, expect, it } from "vitest";
import { simulate as replace } from "./page-replacement/simulate";
import { simulate as race } from "./race-conditions/simulate";

/**
 * External cross-check: traces published in Arpaci-Dusseau and Arpaci-Dusseau, "Operating Systems:
 * Three Easy Pieces" (v1.10), transcribed from the book's figures, not from any engine output.
 * https://pages.cs.wisc.edu/~remzi/OSTEP/
 */

describe("OSTEP ch. 22, Figures 22.1, 22.2 and 22.5 (refs 0 1 2 0 1 3 0 3 1 2 1, cache of 3)", () => {
  const refs = [0, 1, 2, 0, 1, 3, 0, 3, 1, 2, 1];
  const marks = (algorithm: "opt" | "fifo" | "lru") =>
    replace({ refs, frames: 3, algorithm }).result.records.map((r) => (r.hit ? "Hit" : "Miss"));
  const evictions = (algorithm: "opt" | "fifo" | "lru") =>
    replace({ refs, frames: 3, algorithm }).result.records.flatMap((r) =>
      r.victim === null ? [] : [r.victim],
    );

  it("Figure 22.1, optimal: 6 hits; first victim 2; the second is a tie", () => {
    expect(marks("opt")).toEqual("Miss Miss Miss Hit Hit Miss Hit Hit Hit Miss Hit".split(" "));
    // At reference 10 pages 0 and 3 are never used again. The book evicts 3; the lesson's rule
    // (docs/lessons/reemplazo-paginas.md) breaks ties by the lowest slot and evicts 0. Both are
    // optimal and give the same hits and misses.
    const [first, second] = evictions("opt");
    expect(first).toBe(2);
    expect([0, 3]).toContain(second);
  });

  it("Figure 22.2, FIFO: 4 hits, evicts 0 1 2 3, queue states as printed", () => {
    const trace = replace({ refs, frames: 3, algorithm: "fifo" });
    expect(marks("fifo")).toEqual("Miss Miss Miss Hit Hit Miss Miss Hit Miss Miss Hit".split(" "));
    expect(evictions("fifo")).toEqual([0, 1, 2, 3]);
    expect(trace.steps.map((s) => s.state.queue.join(","))).toEqual([
      "0",
      "0,1",
      "0,1,2",
      "0,1,2",
      "0,1,2",
      "1,2,3",
      "2,3,0",
      "2,3,0",
      "3,0,1",
      "0,1,2",
      "0,1,2",
    ]);
  });

  it("Figure 22.5, LRU: 6 hits, evicts 2 then 0, recency states as printed", () => {
    const trace = replace({ refs, frames: 3, algorithm: "lru" });
    expect(marks("lru")).toEqual("Miss Miss Miss Hit Hit Miss Hit Hit Hit Miss Hit".split(" "));
    expect(evictions("lru")).toEqual([2, 0]);
    expect(trace.steps.map((s) => s.state.recency.join(","))).toEqual([
      "0",
      "0,1",
      "0,1,2",
      "1,2,0",
      "2,0,1",
      "0,1,3",
      "1,3,0",
      "1,0,3",
      "0,3,1",
      "3,1,2",
      "3,2,1",
    ]);
  });
});

describe("OSTEP ch. 26, Figure 26.7 (the lost update, counter shifted from 50 to 0)", () => {
  it("T1 loads and adds, is interrupted, T2 runs a whole increment, T1 stores the same value", () => {
    // The figure starts at 50: T1 mov/add (51 in its register), interrupt, T2 mov/add/mov (stores 51),
    // T1 mov (stores 51 again). One increment is lost.
    const trace = race({
      threads: 2,
      increments: 1,
      atomic: false,
      schedule: { kind: "manual", order: ["T1", "T1", "T2", "T2", "T2", "T1"] },
    });
    expect(trace.steps.map((s) => s.state.counter)).toEqual([0, 0, 0, 0, 1, 1]);
    expect(trace.result.writes.map((w) => [w.id, w.value, w.stale])).toEqual([
      ["T2", 1, false],
      ["T1", 1, true],
    ]);
    expect(trace.result.final).toBe(1);
    expect(trace.result.lost).toBe(1);
  });
});
