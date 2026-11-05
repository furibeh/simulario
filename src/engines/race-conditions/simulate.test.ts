import { describe, expect, it } from "vitest";
import { presets } from "./presets";
import { simulate } from "./simulate";
import type { RaceExplanation, RaceInput, RaceTrace } from "./types";

/**
 * Expected values are hand-computed in docs/lessons/race-conditions.md ("Expected results").
 * Never regenerate them from the engine's output.
 */

/** One token per instruction in the spec's notation: "T1 L0", "T2 S1*", "T1 I1". */
function trail(trace: RaceTrace): string {
  return trace.steps
    .map(({ state, explain }) => {
      const e = explain.find((x) => ["load", "add", "store", "store.stale", "inc"].includes(x.key));
      if (!e || !("value" in e.params)) return "?";
      const letter = { load: "L", add: "A", store: "S", "store.stale": "S", inc: "I" }[
        e.key as "load"
      ];
      return `${state.running} ${letter}${e.params.value}${e.key === "store.stale" ? "*" : ""}`;
    })
    .join(", ");
}

/** Turns as written in the spec: "T1 L0 A1 | T2 L0 A1". */
function turns(trace: RaceTrace): string {
  const parts: string[] = [];
  let last = "";
  for (const token of trail(trace).split(", ")) {
    const [id, op] = token.split(" ");
    if (id !== last) parts.push(`| ${id} ${op}`);
    else parts.push(op ?? "");
    last = id ?? "";
  }
  return parts.join(" ").replace(/^\| /, "");
}

function formatKey(e: RaceExplanation): string {
  switch (e.key) {
    case "preempt":
      return `preempt ${e.params.id} (${e.params.quantum})`;
    case "load":
    case "store":
    case "inc":
      return `${e.key} ${e.params.id} (${e.params.value})`;
    case "add":
      return `add ${e.params.id} (${e.params.value}, counter ${e.params.counter})`;
    case "store.stale":
      return `store.stale ${e.params.id} (${e.params.value}, loaded ${e.params.loaded}, before ${e.params.before})`;
    default:
      return `${e.key} ${e.params.id}`;
  }
}

const keyRows = (trace: RaceTrace) => trace.steps.map((s) => s.explain.map(formatKey).join(", "));

const timer = (base: RaceInput, quantum: number): RaceInput => ({
  ...base,
  schedule: { kind: "timer", quantum },
});

interface Summary {
  final: number;
  lost: number;
  stale: number;
  switches?: number;
}

function expectSummary(trace: RaceTrace, s: Summary): void {
  expect(trace.result.final).toBe(s.final);
  expect(trace.result.lost).toBe(s.lost);
  expect(trace.result.writes.filter((w) => w.stale).length).toBe(s.stale);
  expect(trace.result.complete).toBe(true);
  if (s.switches !== undefined) expect(trace.result.switches).toBe(s.switches);
}

describe("preset: twoOnce (Dos incrementos)", () => {
  it("quantum 1", () => {
    const trace = simulate(timer(presets.twoOnce, 1));
    expect(turns(trace)).toBe("T1 L0 | T2 L0 | T1 A1 | T2 A1 | T1 S1 | T2 S1*");
    expectSummary(trace, { final: 1, lost: 1, stale: 1, switches: 5 });
  });

  it("quantum 2, step by step", () => {
    const trace = simulate(presets.twoOnce);
    expect(turns(trace)).toBe("T1 L0 A1 | T2 L0 A1 | T1 S1 | T2 S1*");
    expect(keyRows(trace)).toEqual([
      "dispatch T1, load T1 (0)",
      "add T1 (1, counter 0)",
      "preempt T1 (2), dispatch T2, load T2 (0)",
      "add T2 (1, counter 0)",
      "preempt T2 (2), dispatch T1, store T1 (1), finish T1",
      "dispatch T2, store.stale T2 (1, loaded 0, before 1), finish T2",
    ]);
    expect(trace.steps.map((s) => s.state.counter)).toEqual([0, 0, 0, 0, 1, 1]);
    expect(trace.steps.map((s) => s.state.threads.map((th) => th.reg))).toEqual([
      [0, null],
      [1, null],
      [1, 0],
      [1, 1],
      [1, 1],
      [1, 1],
    ]);
    expectSummary(trace, { final: 1, lost: 1, stale: 1, switches: 3 });
    expect(trace.result.expected).toBe(2);
    expect(trace.result.segments).toEqual([
      { id: "T1", start: 0, end: 2 },
      { id: "T2", start: 2, end: 4 },
      { id: "T1", start: 4, end: 5 },
      { id: "T2", start: 5, end: 6 },
    ]);
  });

  it("quantum 3: no preempt when the thread ends with its quantum", () => {
    const trace = simulate(timer(presets.twoOnce, 3));
    expect(turns(trace)).toBe("T1 L0 A1 S1 | T2 L1 A2 S2");
    const keys = keyRows(trace);
    expect(keys[0]).toBe("dispatch T1, load T1 (0)");
    expect(keys[2]).toBe("store T1 (1), finish T1");
    expect(keys[3]).toBe("dispatch T2, load T2 (1)");
    expect(keys[5]).toBe("store T2 (2), finish T2");
    expectSummary(trace, { final: 2, lost: 0, stale: 0, switches: 1 });
  });

  it("quantum 6 behaves like quantum 3", () => {
    const trace = simulate(timer(presets.twoOnce, 6));
    expect(turns(trace)).toBe("T1 L0 A1 S1 | T2 L1 A2 S2");
    expectSummary(trace, { final: 2, lost: 0, stale: 0, switches: 1 });
  });

  it("atomic, quantum 1", () => {
    const trace = simulate({ ...timer(presets.twoOnce, 1), atomic: true });
    expect(turns(trace)).toBe("T1 I1 | T2 I2");
    expect(trace.steps.map((s) => s.state.threads.map((th) => th.reg))).toEqual([
      [null, null],
      [null, null],
    ]);
    expectSummary(trace, { final: 2, lost: 0, stale: 0, switches: 1 });
  });
});

describe("preset: threeTwice (Tres hilos)", () => {
  it("quantum 1", () => {
    const trace = simulate(timer(presets.threeTwice, 1));
    expect(trail(trace)).toBe(
      [
        "T1 L0, T2 L0, T3 L0, T1 A1, T2 A1, T3 A1, T1 S1, T2 S1*, T3 S1*",
        "T1 L1, T2 L1, T3 L1, T1 A2, T2 A2, T3 A2, T1 S2, T2 S2*, T3 S2*",
      ].join(", "),
    );
    expectSummary(trace, { final: 2, lost: 4, stale: 4 });
  });

  it("quantum 2", () => {
    const trace = simulate(presets.threeTwice);
    expect(turns(trace)).toBe(
      "T1 L0 A1 | T2 L0 A1 | T3 L0 A1 | T1 S1 L1 | T2 S1* L1 | T3 S1* L1 | T1 A2 S2 | T2 A2 S2* | T3 A2 S2*",
    );
    expect(trace.steps).toHaveLength(18);
    expectSummary(trace, { final: 2, lost: 4, stale: 4, switches: 8 });
  });

  it("quantum 3", () => {
    const trace = simulate(timer(presets.threeTwice, 3));
    expect(turns(trace)).toBe(
      "T1 L0 A1 S1 | T2 L1 A2 S2 | T3 L2 A3 S3 | T1 L3 A4 S4 | T2 L4 A5 S5 | T3 L5 A6 S6",
    );
    expectSummary(trace, { final: 6, lost: 0, stale: 0 });
  });

  it("quantum 4: one stale store erases two increments", () => {
    const trace = simulate(timer(presets.threeTwice, 4));
    expect(turns(trace)).toBe(
      "T1 L0 A1 S1 L1 | T2 L1 A2 S2 L2 | T3 L2 A3 S3 L3 | T1 A2 S2* | T2 A3 S3 | T3 A4 S4",
    );
    const keys = keyRows(trace);
    expect(keys[13]).toBe("store.stale T1 (2, loaded 1, before 3), finish T1");
    expect(keys[14]).toBe("dispatch T2, add T2 (3, counter 2)");
    expectSummary(trace, { final: 4, lost: 2, stale: 1 });
  });

  it("quantum 5", () => {
    const trace = simulate(timer(presets.threeTwice, 5));
    expect(turns(trace)).toBe(
      "T1 L0 A1 S1 L1 A2 | T2 L1 A2 S2 L2 A3 | T3 L2 A3 S3 L3 A4 | T1 S2* | T2 S3 | T3 S4",
    );
    expectSummary(trace, { final: 4, lost: 2, stale: 1 });
  });

  it("quantum 6", () => {
    const trace = simulate(timer(presets.threeTwice, 6));
    expect(turns(trace)).toBe("T1 L0 A1 S1 L1 A2 S2 | T2 L2 A3 S3 L3 A4 S4 | T3 L4 A5 S5 L5 A6 S6");
    expectSummary(trace, { final: 6, lost: 0, stale: 0 });
  });

  it("atomic, quantum 2", () => {
    const trace = simulate({ ...presets.threeTwice, atomic: true });
    expect(turns(trace)).toBe("T1 I1 I2 | T2 I3 I4 | T3 I5 I6");
    expectSummary(trace, { final: 6, lost: 0, stale: 0, switches: 2 });
  });
});

describe("preset: worstCase (Peor caso)", () => {
  it("ends at 2 out of 6", () => {
    const trace = simulate(presets.worstCase);
    expect(turns(trace)).toBe(
      "T1 L0 | T2 L0 A1 S1 L1 A2 S2 | T1 A1 S1* | T2 L1 | T1 L1 A2 S2 L2 A3 S3 | T2 A2 S2*",
    );
    expect(trace.steps.map((s) => s.state.counter)).toEqual([
      0, 0, 0, 1, 1, 1, 2, 2, 1, 1, 1, 1, 2, 2, 2, 3, 3, 2,
    ]);
    const picks = trace.steps.flatMap((s) =>
      s.explain.some((e) => e.key === "pick") ? [s.t] : [],
    );
    expect(picks).toEqual([0, 1, 7, 9, 10, 16]);
    const stale = trace.result.writes.filter((w) => w.stale);
    expect(stale.map((w) => [w.id, w.loaded, w.before, w.value])).toEqual([
      ["T1", 0, 2, 1],
      ["T2", 1, 3, 2],
    ]);
    expectSummary(trace, { final: 2, lost: 4, stale: 2, switches: 5 });
  });
});

describe("edge cases", () => {
  it("the last thread keeps running without a preempt", () => {
    const trace = simulate({
      threads: 2,
      increments: 2,
      atomic: false,
      schedule: { kind: "timer", quantum: 1 },
    });
    expect(trail(trace)).toBe(
      "T1 L0, T2 L0, T1 A1, T2 A1, T1 S1, T2 S1*, T1 L1, T2 L1, T1 A2, T2 A2, T1 S2, T2 S2*",
    );
    const keys = keyRows(trace);
    expect(keys[10]).toBe("preempt T2 (1), dispatch T1, store T1 (2), finish T1");
    expect(keys[11]).toBe("dispatch T2, store.stale T2 (2, loaded 1, before 2), finish T2");
    expectSummary(trace, { final: 2, lost: 2, stale: 2 });
  });

  it("counts switches in a manual order", () => {
    const trace = simulate({
      threads: 2,
      increments: 2,
      atomic: false,
      schedule: {
        kind: "manual",
        order: ["T1", "T1", "T1", "T2", "T2", "T2", "T2", "T2", "T2", "T1", "T1", "T1"],
      },
    });
    expect(trace.result.final).toBe(4);
    expect(trace.result.switches).toBe(2);
  });

  it("a short manual order ends early", () => {
    const trace = simulate({
      ...presets.twoOnce,
      schedule: { kind: "manual", order: ["T1", "T2"] },
    });
    expect(trace.steps).toHaveLength(2);
    expect(trace.result.complete).toBe(false);
    expect(trace.result.final).toBe(0);
    expect(trace.steps.at(-1)?.state.threads.map((th) => th.reg)).toEqual([0, 0]);
  });

  it("rejects a manual order that runs a finished thread", () => {
    expect(() =>
      simulate({
        ...presets.twoOnce,
        schedule: { kind: "manual", order: ["T1", "T1", "T1", "T1"] },
      }),
    ).toThrow(RangeError);
  });

  it("atomic with a manual order", () => {
    const trace = simulate({
      ...presets.twoOnce,
      atomic: true,
      schedule: { kind: "manual", order: ["T2", "T1"] },
    });
    expect(keyRows(trace)).toEqual([
      "pick T2, inc T2 (1), finish T2",
      "pick T1, inc T1 (2), finish T1",
    ]);
    expect(trace.result.final).toBe(2);
  });

  it("rejects invalid inputs", () => {
    expect(() => simulate({ ...presets.twoOnce, threads: 4 })).toThrow(RangeError);
    expect(() => simulate({ ...presets.twoOnce, increments: 0 })).toThrow(RangeError);
    expect(() => simulate(timer(presets.twoOnce, 7))).toThrow(RangeError);
  });
});
