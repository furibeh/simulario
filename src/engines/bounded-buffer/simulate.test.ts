import { describe, expect, it } from "vitest";
import { presets } from "./presets";
import { consumerShares, simulate } from "./simulate";
import type { BufferExplanation, BufferInput, BufferTrace } from "./types";

/**
 * Expected values are hand-computed in docs/lessons/operating-systems/mutex-semaphores.md ("Expected results").
 * Never regenerate them from the engine's output.
 */

const short = { empty: "e", full: "f", mutex: "m" } as const;

/** The operation of a step in the spec's notation: "P1 We pass 1", "C1 Se wake P1". */
function opText(e: BufferExplanation): string | null {
  switch (e.key) {
    case "wait.pass":
      return `${e.params.id} W${short[e.params.sem]} pass ${e.params.value}`;
    case "wait.block":
      return `${e.params.id} W${short[e.params.sem]} block`;
    case "signal.inc":
      return `${e.params.id} S${short[e.params.sem]} inc ${e.params.value}`;
    case "signal.wake":
      return `${e.params.id} S${short[e.params.sem]} wake ${e.params.woken}`;
    case "put":
      return `${e.params.id} put ${e.params.item} → ${e.params.slot}`;
    case "take":
      return `${e.params.id} take ${e.params.item} ← ${e.params.slot}`;
    default:
      return null;
  }
}

const ops = (trace: BufferTrace) =>
  trace.steps.map((s) =>
    s.explain
      .map(opText)
      .filter((x) => x !== null)
      .join(", "),
  );

const sems = (trace: BufferTrace) =>
  trace.steps.map(({ state: { sems: s } }) => [s.empty.value, s.full.value, s.mutex.value]);

function formatKey(e: BufferExplanation): string {
  switch (e.key) {
    case "dispatch":
    case "finish":
      return `${e.key} ${e.params.id}`;
    case "preempt":
      return `preempt ${e.params.id}`;
    case "deadlock":
      return "deadlock";
    case "stuck":
      return `stuck ${e.params.id} ${e.params.sem}`;
    default:
      return opText(e) ?? "?";
  }
}

const keyRows = (trace: BufferTrace) => trace.steps.map((s) => s.explain.map(formatKey).join(", "));

const blocks = (trace: BufferTrace) => trace.result.blocks.map((b) => `${b.step} ${b.id} ${b.sem}`);
const consumed = (trace: BufferTrace) => trace.result.consumed.map((c) => c.item);

describe("preset: fastProducer (Productor rápido)", () => {
  const trace = simulate(presets.fastProducer);

  it("runs the 30 operations of the spec table", () => {
    expect(ops(trace)).toEqual([
      "P1 We pass 1",
      "P1 Wm pass 0",
      "P1 put P1.1 → 0",
      "P1 Sm inc 1",
      "P1 Sf inc 1",
      "P1 We pass 0",
      "P1 Wm pass 0",
      "P1 put P1.2 → 1",
      "P1 Sm inc 1",
      "P1 Sf inc 2",
      "P1 We block",
      "C1 Wf pass 1",
      "C1 Wm pass 0",
      "C1 take P1.1 ← 0",
      "C1 Sm inc 1",
      "C1 Se wake P1",
      "C1 Wf pass 0",
      "C1 Wm pass 0",
      "C1 take P1.2 ← 1",
      "C1 Sm inc 1",
      "C1 Se inc 1",
      "C1 Wf block",
      "P1 Wm pass 0",
      "P1 put P1.3 → 0",
      "P1 Sm inc 1",
      "P1 Sf wake C1",
      "C1 Wm pass 0",
      "C1 take P1.3 ← 0",
      "C1 Sm inc 1",
      "C1 Se inc 2",
    ]);
  });

  it("matches the semaphore columns", () => {
    expect(sems(trace)).toEqual([
      [1, 0, 1],
      [1, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 1],
      [0, 2, 1],
      [0, 2, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 1],
      [0, 1, 1],
      [0, 0, 1],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
      [1, 0, 1],
      [1, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [1, 0, 1],
      [1, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [2, 0, 1],
    ]);
  });

  it("dispatches, finishes and summarizes as the spec says", () => {
    const keys = keyRows(trace);
    expect(keys[0]).toBe("dispatch P1, P1 We pass 1");
    expect(keys[11]).toBe("dispatch C1, C1 Wf pass 1");
    expect(keys[22]).toBe("dispatch P1, P1 Wm pass 0");
    expect(keys[25]).toBe("P1 Sf wake C1, finish P1");
    expect(keys[26]).toBe("dispatch C1, C1 Wm pass 0");
    expect(keys[29]).toBe("C1 Se inc 2, finish C1");
    expect(trace.steps[10]?.state.sems.empty.queue).toEqual(["P1"]);
    expect(trace.steps[10]?.state.buffer).toEqual(["P1.1", "P1.2"]);
    expect(trace.result).toMatchObject({
      completed: true,
      deadlock: false,
      steps: 30,
      finishOrder: ["P1", "C1"],
      finalSems: { empty: 2, full: 0, mutex: 1 },
    });
    expect(consumed(trace)).toEqual(["P1.1", "P1.2", "P1.3"]);
    expect(blocks(trace)).toEqual(["10 P1 empty", "21 C1 full"]);
  });
});

describe("preset: swapped (Orden invertido)", () => {
  it("deadlocks at step 13 without a quantum", () => {
    const trace = simulate(presets.swapped);
    expect(ops(trace)).toEqual([
      "P1 Wm pass 0",
      "P1 We pass 1",
      "P1 put P1.1 → 0",
      "P1 Sm inc 1",
      "P1 Sf inc 1",
      "P1 Wm pass 0",
      "P1 We pass 0",
      "P1 put P1.2 → 1",
      "P1 Sm inc 1",
      "P1 Sf inc 2",
      "P1 Wm pass 0",
      "P1 We block",
      "C1 Wf pass 1",
      "C1 Wm block",
    ]);
    expect(sems(trace).slice(9)).toEqual([
      [0, 2, 1],
      [0, 2, 0],
      [0, 2, 0],
      [0, 1, 0],
      [0, 1, 0],
    ]);
    expect(keyRows(trace)[13]).toBe("C1 Wm block, deadlock, stuck P1 empty, stuck C1 mutex");
    expect(trace.result).toMatchObject({ completed: false, deadlock: true, steps: 14 });
    expect(consumed(trace)).toEqual([]);
    expect(blocks(trace)).toEqual(["11 P1 empty", "13 C1 mutex"]);
  });

  it("finishes with quantum 1", () => {
    const trace = simulate({ ...presets.swapped, quantum: 1 });
    expect(keyRows(trace)).toEqual([
      "dispatch P1, P1 Wm pass 0",
      "preempt P1, dispatch C1, C1 Wf block",
      "dispatch P1, P1 We pass 1",
      "P1 put P1.1 → 0",
      "P1 Sm inc 1",
      "P1 Sf wake C1",
      "preempt P1, dispatch C1, C1 Wm pass 0",
      "preempt C1, dispatch P1, P1 Wm block",
      "dispatch C1, C1 take P1.1 ← 0",
      "C1 Sm wake P1",
      "preempt C1, dispatch P1, P1 We pass 0",
      "preempt P1, dispatch C1, C1 Se inc 1",
      "preempt C1, dispatch P1, P1 put P1.2 → 1",
      "preempt P1, dispatch C1, C1 Wf block",
      "dispatch P1, P1 Sm inc 1",
      "P1 Sf wake C1",
      "preempt P1, dispatch C1, C1 Wm pass 0",
      "preempt C1, dispatch P1, P1 Wm block",
      "dispatch C1, C1 take P1.2 ← 1",
      "C1 Sm wake P1",
      "preempt C1, dispatch P1, P1 We pass 0",
      "preempt P1, dispatch C1, C1 Se inc 1",
      "preempt C1, dispatch P1, P1 put P1.3 → 0",
      "preempt P1, dispatch C1, C1 Wf block",
      "dispatch P1, P1 Sm inc 1",
      "P1 Sf wake C1, finish P1",
      "dispatch C1, C1 Wm pass 0",
      "C1 take P1.3 ← 0",
      "C1 Sm inc 1",
      "C1 Se inc 2, finish C1",
    ]);
    expect(trace.result).toMatchObject({
      completed: true,
      deadlock: false,
      steps: 30,
      finalSems: { empty: 2, full: 0, mutex: 1 },
    });
    expect(blocks(trace)).toEqual([
      "1 C1 full",
      "7 P1 mutex",
      "13 C1 full",
      "17 P1 mutex",
      "23 C1 full",
    ]);
    expect(consumed(trace)).toEqual(["P1.1", "P1.2", "P1.3"]);
  });
});

describe("preset: twoProducers (Dos productores)", () => {
  it("matches the spec table", () => {
    const trace = simulate(presets.twoProducers);
    expect(ops(trace)).toEqual([
      "P1 We pass 1",
      "P2 We pass 0",
      "C1 Wf block",
      "P1 Wm pass 0",
      "P2 Wm block",
      "P1 put P1.1 → 0",
      "P1 Sm wake P2",
      "P2 put P2.1 → 1",
      "P1 Sf wake C1",
      "P2 Sm inc 1",
      "C1 Wm pass 0",
      "P1 We block",
      "P2 Sf inc 1",
      "C1 take P1.1 ← 0",
      "P2 We block",
      "C1 Sm inc 1",
      "C1 Se wake P1",
      "P1 Wm pass 0",
      "C1 Wf pass 0",
      "P1 put P1.2 → 0",
      "C1 Wm block",
      "P1 Sm wake C1",
      "C1 take P2.1 ← 1",
      "P1 Sf inc 1",
      "C1 Sm inc 1",
      "C1 Se wake P2",
      "P2 Wm pass 0",
      "C1 Wf pass 0",
      "P2 put P2.2 → 1",
      "C1 Wm block",
      "P2 Sm wake C1",
      "C1 take P1.2 ← 0",
      "P2 Sf inc 1",
      "C1 Sm inc 1",
      "C1 Se inc 1",
      "C1 Wf pass 0",
      "C1 Wm pass 0",
      "C1 take P2.2 ← 1",
      "C1 Sm inc 1",
      "C1 Se inc 2",
    ]);
    expect(trace.steps[15]?.state.sems.empty.queue).toEqual(["P1", "P2"]);
    expect(trace.result).toMatchObject({
      completed: true,
      steps: 40,
      finishOrder: ["P1", "P2", "C1"],
      finalSems: { empty: 2, full: 0, mutex: 1 },
    });
    expect(consumed(trace)).toEqual(["P1.1", "P2.1", "P1.2", "P2.2"]);
    expect(blocks(trace)).toEqual([
      "2 C1 full",
      "4 P2 mutex",
      "11 P1 empty",
      "14 P2 empty",
      "20 C1 mutex",
      "29 C1 mutex",
    ]);
  });
});

describe("edge cases", () => {
  it("a buffer as large as the work never blocks", () => {
    const trace = simulate({ ...presets.fastProducer, capacity: 3 });
    expect(blocks(trace)).toEqual([]);
    expect(trace.result.segments).toEqual([
      { id: "P1", start: 0, end: 15 },
      { id: "C1", start: 15, end: 30 },
    ]);
    expect(trace.result.finalSems).toEqual({ empty: 3, full: 0, mutex: 1 });
  });

  it("splits items among consumers", () => {
    const even: BufferInput = { ...presets.fastProducer, producers: 2, consumers: 2 };
    expect(consumerShares(even)).toEqual([3, 3]);
    expect(consumerShares({ ...presets.fastProducer, consumers: 2 })).toEqual([2, 1]);
    const trace = simulate({ ...presets.fastProducer, consumers: 2 });
    expect(trace.result.completed).toBe(true);
    expect(trace.result.consumed.filter((c) => c.by === "C2")).toHaveLength(1);
  });

  it("a consumer with a share of 0 never runs", () => {
    const trace = simulate({ ...presets.fastProducer, items: 1, consumers: 2 });
    expect(trace.result.steps).toBe(10);
    expect(trace.result.segments).toEqual([
      { id: "P1", start: 0, end: 5 },
      { id: "C1", start: 5, end: 10 },
    ]);
    expect(trace.result.finishOrder).toEqual(["P1", "C1"]);
    expect(trace.result.completed).toBe(true);
  });

  it("rejects invalid inputs", () => {
    expect(() => simulate({ ...presets.fastProducer, capacity: 0 })).toThrow(RangeError);
    expect(() => simulate({ ...presets.fastProducer, producers: 3 })).toThrow(RangeError);
    expect(() => simulate({ ...presets.fastProducer, quantum: 0 })).toThrow(RangeError);
  });
});
