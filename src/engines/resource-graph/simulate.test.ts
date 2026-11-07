import { describe, expect, it } from "vitest";
import { philosophers, presets, twoLocks } from "./presets";
import { simulate } from "./simulate";
import type { GraphExplanation, GraphInput, GraphTrace } from "./types";

/**
 * Expected values are hand-computed in docs/lessons/operating-systems/deadlock.md ("Expected results").
 * Never regenerate them from the engine's output.
 */

const num = (res: string) => res.replace("R", "");

/** The operation of a step in the spec's notation: "T1 a1", "T5 a1 B(T1)", "T4 r4 → T3". */
function opText(e: GraphExplanation): string | null {
  switch (e.key) {
    case "acquire":
      return `${e.params.id} a${num(e.params.res)}`;
    case "block":
      return `${e.params.id} a${num(e.params.res)} B(${e.params.holder})`;
    case "release":
      return `${e.params.id} r${num(e.params.res)}`;
    case "handoff":
      return `${e.params.id} r${num(e.params.res)} → ${e.params.to}`;
    case "work":
      return `${e.params.id} w`;
    case "think":
      return `${e.params.id} k`;
    default:
      return null;
  }
}

const ops = (trace: GraphTrace) =>
  trace.steps.map((s) =>
    s.explain
      .map(opText)
      .filter((x) => x !== null)
      .join(""),
  );

const keysAt = (trace: GraphTrace, step: number) =>
  trace.steps[step]?.explain.map((e) => e.key) ?? [];

const cycleText = (trace: GraphTrace) =>
  trace.steps.flatMap((s) => s.explain).flatMap((e) => (e.key === "cycle" ? [e.params.path] : []));

const delayed = (input: GraphInput, index: number, delay: number): GraphInput => ({
  ...input,
  threads: input.threads.map((th, i) => (i === index ? { ...th, delay } : th)),
});

describe("preset: philosophers (Filósofos)", () => {
  it("five philosophers deadlock at step 9 and nobody eats", () => {
    const trace = simulate(presets.philosophers);
    expect(ops(trace)).toEqual([
      "T1 a1",
      "T2 a2",
      "T3 a3",
      "T4 a4",
      "T5 a5",
      "T1 a2 B(T2)",
      "T2 a3 B(T3)",
      "T3 a4 B(T4)",
      "T4 a5 B(T5)",
      "T5 a1 B(T1)",
    ]);
    expect(keysAt(trace, 9)).toEqual(["block", "cycle", "stalled"]);
    expect(cycleText(trace)).toEqual(["T5 → R1 → T1 → R2 → T2 → R3 → T3 → R4 → T4 → R5 → T5"]);
    expect(trace.steps[9]?.explain.at(-1)).toEqual({ key: "stalled", params: { count: 5 } });
    expect(trace.result).toMatchObject({
      deadlock: true,
      cycleStep: 9,
      cycle: ["T5", "T1", "T2", "T3", "T4"],
      stalled: true,
      worked: [],
      steps: 10,
    });
    expect(trace.steps[4]?.state.resources.map((r) => r.holder)).toEqual([
      "T1",
      "T2",
      "T3",
      "T4",
      "T5",
    ]);
  });

  it("with a global order everybody eats", () => {
    const trace = simulate({ ...presets.philosophers, ordering: "global" });
    expect(trace.result.programs.T5?.slice(0, 2)).toEqual([
      { op: "acquire", res: 1 },
      { op: "acquire", res: 5 },
    ]);
    expect(ops(trace)).toEqual([
      "T1 a1",
      "T2 a2",
      "T3 a3",
      "T4 a4",
      "T5 a1 B(T1)",
      "T1 a2 B(T2)",
      "T2 a3 B(T3)",
      "T3 a4 B(T4)",
      "T4 a5",
      "T4 w",
      "T4 r5",
      "T4 r4 → T3",
      "T3 w",
      "T3 r4",
      "T3 r3 → T2",
      "T2 w",
      "T2 r3",
      "T2 r2 → T1",
      "T1 w",
      "T1 r2",
      "T1 r1 → T5",
      "T5 a5",
      "T5 w",
      "T5 r1",
      "T5 r5",
    ]);
    const blockedAfter7 = trace.steps[7]?.state.threads.filter((x) => x.status === "blocked");
    expect(blockedAfter7?.map((x) => x.id)).toEqual(["T1", "T2", "T3", "T5"]);
    expect(trace.steps[7]?.state.ready).toEqual(["T4"]);
    expect(trace.result).toMatchObject({
      deadlock: false,
      stalled: false,
      steps: 25,
      finishOrder: ["T4", "T3", "T2", "T1", "T5"],
      worked: ["T4", "T3", "T2", "T1", "T5"],
    });
  });

  it("two philosophers deadlock at step 3", () => {
    const trace = simulate(philosophers(2));
    expect(ops(trace)).toEqual(["T1 a1", "T2 a2", "T1 a2 B(T2)", "T2 a1 B(T1)"]);
    expect(cycleText(trace)).toEqual(["T2 → R1 → T1 → R2 → T2"]);
    expect(trace.result.cycleStep).toBe(3);
  });
});

describe("preset: twoLocks (Dos cerrojos)", () => {
  it("script order: T1 and T2 deadlock, T3 finishes", () => {
    const trace = simulate(twoLocks);
    expect(ops(trace)).toEqual([
      "T1 a1",
      "T2 a2",
      "T3 a3",
      "T1 w",
      "T2 w",
      "T3 w",
      "T1 a2 B(T2)",
      "T2 a1 B(T1)",
      "T3 w",
      "T3 r3",
    ]);
    expect(cycleText(trace)).toEqual(["T2 → R1 → T1 → R2 → T2"]);
    expect(keysAt(trace, 9)).toEqual(["release", "finish", "stalled"]);
    expect(trace.result).toMatchObject({
      deadlock: true,
      cycleStep: 7,
      stalled: true,
      finishOrder: ["T3"],
      worked: ["T1", "T2", "T3"],
      steps: 10,
    });
  });

  it("global order finishes", () => {
    const trace = simulate({ ...twoLocks, ordering: "global" });
    expect(trace.result.programs.T2).toEqual([
      { op: "acquire", res: 1 },
      { op: "work" },
      { op: "acquire", res: 2 },
      { op: "work" },
      { op: "release", res: 1 },
      { op: "release", res: 2 },
    ]);
    expect(ops(trace)).toEqual([
      "T1 a1",
      "T2 a1 B(T1)",
      "T3 a3",
      "T1 w",
      "T3 w",
      "T1 a2",
      "T3 w",
      "T1 w",
      "T3 r3",
      "T1 r2",
      "T1 r1 → T2",
      "T2 w",
      "T2 a2",
      "T2 w",
      "T2 r1",
      "T2 r2",
    ]);
    expect(trace.result).toMatchObject({ deadlock: false, stalled: false, steps: 16 });
    expect(trace.result.finishOrder).toEqual(["T3", "T1", "T2"]);
    const finishSteps = trace.steps.flatMap((s) =>
      s.explain.some((e) => e.key === "finish") ? [s.t] : [],
    );
    expect(finishSteps).toEqual([8, 10, 15]);
  });

  it("delaying T2 by 1 still deadlocks", () => {
    const trace = simulate(delayed(twoLocks, 1, 1));
    expect(ops(trace)).toEqual([
      "T1 a1",
      "T2 k",
      "T3 a3",
      "T1 w",
      "T2 a2",
      "T3 w",
      "T1 a2 B(T2)",
      "T2 w",
      "T3 w",
      "T2 a1 B(T1)",
      "T3 r3",
    ]);
    expect(trace.result.cycleStep).toBe(9);
    expect(cycleText(trace)).toEqual(["T2 → R1 → T1 → R2 → T2"]);
    expect(trace.steps[10]?.explain.at(-1)).toEqual({ key: "stalled", params: { count: 2 } });
  });

  it("delaying T2 by 2 avoids the cycle", () => {
    const trace = simulate(delayed(twoLocks, 1, 2));
    expect(ops(trace)).toEqual([
      "T1 a1",
      "T2 k",
      "T3 a3",
      "T1 w",
      "T2 k",
      "T3 w",
      "T1 a2",
      "T2 a2 B(T1)",
      "T3 w",
      "T1 w",
      "T3 r3",
      "T1 r2 → T2",
      "T2 w",
      "T1 r1",
      "T2 a1",
      "T2 w",
      "T2 r1",
      "T2 r2",
    ]);
    expect(trace.steps[11]?.state.ready).toEqual(["T2", "T1"]);
    expect(trace.result).toMatchObject({ deadlock: false, steps: 18 });
    expect(trace.result.finishOrder).toEqual(["T3", "T1", "T2"]);
  });
});

describe("edge cases", () => {
  it("a chain is not a cycle", () => {
    const trace = simulate({
      resources: 2,
      ordering: "script",
      threads: [
        {
          delay: 0,
          script: [
            { op: "acquire", res: 1 },
            { op: "acquire", res: 2 },
            { op: "work" },
            { op: "release", res: 2 },
            { op: "release", res: 1 },
          ],
        },
        {
          delay: 0,
          script: [
            { op: "acquire", res: 2 },
            { op: "work" },
            { op: "work" },
            { op: "release", res: 2 },
          ],
        },
      ],
    });
    expect(ops(trace)).toEqual([
      "T1 a1",
      "T2 a2",
      "T1 a2 B(T2)",
      "T2 w",
      "T2 w",
      "T2 r2 → T1",
      "T1 w",
      "T1 r2",
      "T1 r1",
    ]);
    expect(trace.result.deadlock).toBe(false);
    expect(trace.result.steps).toBe(9);
  });

  it("rejects invalid scripts", () => {
    const one = (script: GraphInput["threads"][number]["script"]): GraphInput => ({
      resources: 2,
      ordering: "script",
      threads: [
        { delay: 0, script },
        { delay: 0, script: [{ op: "work" }] },
      ],
    });
    expect(() =>
      simulate(
        one([
          { op: "acquire", res: 1 },
          { op: "acquire", res: 1 },
        ]),
      ),
    ).toThrow(RangeError);
    expect(() => simulate(one([{ op: "acquire", res: 1 }, { op: "work" }]))).toThrow(RangeError);
    expect(() => simulate(one([{ op: "release", res: 1 }]))).toThrow(RangeError);
    expect(() => simulate(delayed(twoLocks, 0, 5))).toThrow(RangeError);
  });
});
