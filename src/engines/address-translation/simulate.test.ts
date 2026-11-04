import { describe, expect, it } from "vitest";
import { presets } from "./presets";
import { simulate } from "./simulate";
import type { TranslationExplanation, TranslationInput, TranslationTrace } from "./types";

/**
 * Expected values are hand-computed in docs/lessons/paginacion.md ("Expected results").
 * Never regenerate them from the engine's output.
 */

const column = <K extends "page" | "offset" | "outcome" | "frame" | "phys" | "cost">(
  trace: TranslationTrace,
  key: K,
) => trace.result.accesses.map((a) => a[key]);

const tlbAfter = (trace: TranslationTrace) =>
  trace.steps.map((s) => s.state.tlb.map((e) => `p${e.page}`).join(", "));

function formatKey(e: TranslationExplanation): string {
  switch (e.key) {
    case "split":
      return `split ${e.params.addr}`;
    case "access":
      return `access ${e.params.phys}`;
    case "evict":
    case "load":
      return `${e.key} p${e.params.page} f${e.params.frame}`;
    default:
      return `${e.key} p${e.params.page}`;
  }
}

const keys = (trace: TranslationTrace, i: number) =>
  trace.steps[i]?.explain.map(formatKey).join(", ") ?? "";

describe("preset: walk (Recorrido)", () => {
  const trace = simulate(presets.walk);

  it("matches the spec table", () => {
    expect(column(trace, "page")).toEqual([1, 1, 4, 1, 0, 5]);
    expect(column(trace, "offset")).toEqual([4, 9, 6, 7, 3, 10]);
    expect(column(trace, "outcome")).toEqual(["miss", "hit", "fault", "hit", "miss", "invalid"]);
    expect(column(trace, "frame")).toEqual([0, 0, 1, 0, 2, null]);
    expect(column(trace, "phys")).toEqual([4, 9, 22, 7, 35, null]);
    expect(column(trace, "cost")).toEqual([201, 101, 10_201, 101, 201, 101]);
    expect(tlbAfter(trace)).toEqual(["p1", "p1", "p1, p4", "p4, p1", "p1, p0", "p1, p0"]);
    expect(trace.result).toMatchObject({
      hits: 2,
      misses: 2,
      faults: 1,
      invalid: true,
      cost: 10_906,
      completed: 5,
    });
  });

  it("emits the keys of the spec", () => {
    expect(keys(trace, 2)).toBe(
      "split 70, tlb.miss p4, fault p4, load p4 f1, tlb.fill p4, access 22",
    );
    expect(keys(trace, 4)).toBe(
      "split 3, tlb.miss p0, pt.hit p0, tlb.evict p4, tlb.fill p0, access 35",
    );
    expect(keys(trace, 5)).toBe("split 90, tlb.miss p5, segfault p5");
    expect(keys(trace, 1)).toBe("split 25, tlb.hit p1, access 9");
  });

  it("variants with other TLB sizes", () => {
    const noTlb = simulate({ ...presets.walk, tlbSize: 0 });
    expect(column(noTlb, "outcome")).toEqual(["miss", "miss", "fault", "miss", "miss", "invalid"]);
    expect(column(noTlb, "cost")).toEqual([200, 200, 10_200, 200, 200, 100]);
    expect(noTlb.result.cost).toBe(11_100);
    expect(keys(noTlb, 0)).toBe("split 20, pt.hit p1, access 4");

    const one = simulate({ ...presets.walk, tlbSize: 1 });
    expect(column(one, "outcome")).toEqual(["miss", "hit", "fault", "miss", "miss", "invalid"]);
    expect(one.result.cost).toBe(11_006);

    const four = simulate({ ...presets.walk, tlbSize: 4 });
    expect(column(four, "outcome")).toEqual(["miss", "hit", "fault", "hit", "miss", "invalid"]);
    expect(four.result.cost).toBe(10_906);
    expect(four.steps.flatMap((s) => s.explain).some((e) => e.key === "tlb.evict")).toBe(false);
  });

  it("E2: four hits out of six", () => {
    const e2 = simulate({ ...presets.walk, accesses: [20, 25, 23, 30, 3, 6] });
    expect(column(e2, "outcome")).toEqual(["miss", "hit", "hit", "hit", "miss", "hit"]);
    expect(e2.result.cost).toBe(806);
  });
});

describe("preset: fullMemory (Memoria llena)", () => {
  const trace = simulate(presets.fullMemory);

  it("evicts in FIFO order and drops stale TLB entries", () => {
    expect(column(trace, "page")).toEqual([0, 3, 1, 4, 0]);
    expect(column(trace, "outcome")).toEqual(["miss", "fault", "miss", "fault", "fault"]);
    expect(column(trace, "phys")).toEqual([5, 2, 18, 22, 34]);
    expect(column(trace, "cost")).toEqual([201, 10_201, 201, 10_201, 10_201]);
    expect(tlbAfter(trace)).toEqual(["p0", "p3", "p3, p1", "p3, p4", "p4, p0"]);
    expect(keys(trace, 1)).toBe(
      "split 50, tlb.miss p3, fault p3, evict p0 f0, tlb.drop p0, load p3 f0, tlb.fill p3, access 2",
    );
    expect(keys(trace, 3)).toBe(
      "split 70, tlb.miss p4, fault p4, evict p1 f1, tlb.drop p1, load p4 f1, tlb.fill p4, access 22",
    );
    expect(keys(trace, 4)).toBe(
      "split 2, tlb.miss p0, fault p0, evict p2 f2, load p0 f2, tlb.evict p3, tlb.fill p0, access 34",
    );
    expect(trace.result).toMatchObject({
      hits: 0,
      misses: 2,
      faults: 3,
      invalid: false,
      cost: 31_005,
    });
    expect(trace.steps.at(-1)?.state.pages.slice(0, 5)).toEqual([
      { kind: "frame", frame: 2 },
      { kind: "disk" },
      { kind: "disk" },
      { kind: "frame", frame: 0 },
      { kind: "frame", frame: 1 },
    ]);
  });
});

describe("edge cases", () => {
  it("an invalid first access stops the run", () => {
    const trace = simulate({ ...presets.walk, accesses: [100] });
    expect(trace.steps).toHaveLength(1);
    expect(column(trace, "page")).toEqual([6]);
    expect(column(trace, "cost")).toEqual([101]);
    expect(trace.result.completed).toBe(0);
  });

  it("rejects invalid inputs", () => {
    const bad = (change: Partial<TranslationInput>) => () =>
      simulate({ ...presets.walk, ...change });
    expect(bad({ accesses: [128] })).toThrow(RangeError);
    expect(
      bad({
        pages: [
          { kind: "frame", frame: 1 },
          { kind: "frame", frame: 1 },
        ],
      }),
    ).toThrow(RangeError);
    expect(bad({ pageSize: 12 })).toThrow(RangeError);
    expect(bad({ tlbSize: 5 })).toThrow(RangeError);
  });
});
