import { describe, expect, it } from "vitest";
import { presetIds, presets } from "./presets";
import { simulate } from "./simulate";
import type {
  ProcessSpec,
  ProcessStatesExplanation,
  ProcessStatesInput,
  ProcessStatesTrace,
  ProcessStatus,
} from "./types";

/**
 * Expected values are hand-computed in docs/lessons/operating-systems/process-states.md ("Expected results").
 * Never regenerate them from the engine's output.
 */

const letter: Record<ProcessStatus, string> = {
  absent: "—",
  ready: "Q",
  running: "R",
  blocked: "B",
  terminated: "T",
};

/** One row per instant in the spec's notation: "B R Q". */
const stateRows = (trace: ProcessStatesTrace): string[] =>
  trace.steps.map((s) => s.state.processes.map((p) => letter[p.status]).join(" "));

function formatKey(e: ProcessStatesExplanation): string {
  switch (e.key) {
    case "continue":
      return `continue ${e.params.id} (${e.params.remaining})`;
    case "block":
      return `block ${e.params.id} (${e.params.duration}, until ${e.params.until})`;
    case "timeout":
      return `timeout ${e.params.id} (${e.params.quantum})`;
    case "exit":
      return `exit ${e.params.id} (${e.params.time})`;
    case "idle.io":
    case "idle.arrivals":
      return e.key;
    default:
      return `${e.key} ${e.params.id}`;
  }
}

/** One line per instant: "block P1 (3, until 5), dispatch P2". */
const keyRows = (trace: ProcessStatesTrace): string[] =>
  trace.steps.map((s) => s.explain.map(formatKey).join(", "));

const segments = (list: readonly { id: string | null; start: number; end: number }[]): string =>
  list.map((s) => `${s.id ?? "-"} ${s.start}-${s.end}`).join(", ");

const column = <K extends "finish" | "turnaround" | "cpu" | "io" | "ready">(
  trace: ProcessStatesTrace,
  key: K,
) => trace.result.processes.map((p) => p[key]);

const procs = (rows: [number, ...number[]][]): ProcessSpec[] =>
  rows.map(([arrival, ...bursts], i) => ({ id: `P${i + 1}`, arrival, bursts }));

const run = (rows: [number, ...number[]][], quantum: number | null = null) =>
  simulate({ processes: procs(rows), quantum });

interface Expected {
  cpu: string;
  io: string;
  states: string[];
  keys: string[];
  finish: number[];
  turnaround: number[];
  cpuTime: number[];
  ioTime: number[];
  ready: number[];
  makespan: number;
  busy: number;
  utilization: number;
  serialTime: number;
}

function expectTrace(input: ProcessStatesInput, exp: Expected): void {
  const trace = simulate(input);
  expect(segments(trace.result.cpuSegments)).toBe(exp.cpu);
  expect(segments(trace.result.ioSegments)).toBe(exp.io);
  expect(stateRows(trace)).toEqual(exp.states);
  expect(keyRows(trace)).toEqual(exp.keys);
  expect(column(trace, "finish")).toEqual(exp.finish);
  expect(column(trace, "turnaround")).toEqual(exp.turnaround);
  expect(column(trace, "cpu")).toEqual(exp.cpuTime);
  expect(column(trace, "io")).toEqual(exp.ioTime);
  expect(column(trace, "ready")).toEqual(exp.ready);
  expect(trace.result.makespan).toBe(exp.makespan);
  expect(trace.result.busy).toBe(exp.busy);
  expect(trace.result.utilization).toBeCloseTo(exp.utilization, 10);
  expect(trace.result.serialTime).toBe(exp.serialTime);
}

const allIo: Expected = {
  cpu: "P1 0-1, P2 1-2, - 2-5, P1 5-6, P2 6-7",
  io: "P1 1-5, P2 2-5",
  states: ["R Q", "B R", "B B", "B B", "B B", "R Q", "T R", "T T"],
  keys: [
    "admit P1, admit P2, dispatch P1",
    "block P1 (4, until 5), dispatch P2",
    "block P2 (3, until 5), idle.io",
    "idle.io",
    "idle.io",
    "wakeup P1, wakeup P2, dispatch P1",
    "exit P1 (6), dispatch P2",
    "exit P2 (7)",
  ],
  finish: [6, 7],
  turnaround: [6, 7],
  cpuTime: [2, 2],
  ioTime: [4, 3],
  ready: [0, 2],
  makespan: 7,
  busy: 4,
  utilization: 4 / 7,
  serialTime: 11,
};

describe("preset: diskWait (Esperando al disco)", () => {
  it("quantum off", () => {
    expectTrace(
      { processes: presets.diskWait, quantum: null },
      {
        cpu: "P1 0-2, P2 2-5, P3 5-6, P1 6-8, P3 8-9",
        io: "P1 2-5, P3 6-8",
        states: [
          "R Q —",
          "R Q Q",
          "B R Q",
          "B R Q",
          "B R Q",
          "Q T R",
          "R T B",
          "R T B",
          "T T R",
          "T T T",
        ],
        keys: [
          "admit P1, admit P2, dispatch P1",
          "admit P3, continue P1 (1)",
          "block P1 (3, until 5), dispatch P2",
          "continue P2 (2)",
          "continue P2 (1)",
          "exit P2 (5), wakeup P1, dispatch P3",
          "block P3 (2, until 8), dispatch P1",
          "continue P1 (1)",
          "exit P1 (8), wakeup P3, dispatch P3",
          "exit P3 (9)",
        ],
        finish: [8, 5, 9],
        turnaround: [8, 5, 8],
        cpuTime: [4, 3, 2],
        ioTime: [3, 0, 2],
        ready: [1, 2, 4],
        makespan: 9,
        busy: 9,
        utilization: 1,
        serialTime: 14,
      },
    );
  });

  it("quantum 2", () => {
    expectTrace(
      { processes: presets.diskWait, quantum: 2 },
      {
        cpu: "P1 0-2, P2 2-4, P3 4-5, P2 5-6, P1 6-8, P3 8-9",
        io: "P1 2-5, P3 5-7",
        states: [
          "R Q —",
          "R Q Q",
          "B R Q",
          "B R Q",
          "B Q R",
          "Q R B",
          "R T B",
          "R T Q",
          "T T R",
          "T T T",
        ],
        keys: [
          "admit P1, admit P2, dispatch P1",
          "admit P3, continue P1 (1)",
          "block P1 (3, until 5), dispatch P2",
          "continue P2 (2)",
          "timeout P2 (2), dispatch P3",
          "block P3 (2, until 7), wakeup P1, dispatch P2",
          "exit P2 (6), dispatch P1",
          "wakeup P3, continue P1 (1)",
          "exit P1 (8), dispatch P3",
          "exit P3 (9)",
        ],
        finish: [8, 6, 9],
        turnaround: [8, 6, 8],
        cpuTime: [4, 3, 2],
        ioTime: [3, 0, 2],
        ready: [1, 3, 4],
        makespan: 9,
        busy: 9,
        utilization: 1,
        serialTime: 14,
      },
    );
  });

  it("queues P2 (timed out at 4) before P1 (woken at 5) under quantum 2", () => {
    const step = simulate({ processes: presets.diskWait, quantum: 2 }).steps[5];
    expect(step?.state.running).toBe("P2");
    expect(step?.state.queue).toEqual(["P1"]);
  });
});

describe("preset: allIo (Todos en E/S)", () => {
  it("quantum off", () => {
    expectTrace({ processes: presets.allIo, quantum: null }, allIo);
  });

  it("quantum 2 changes nothing", () => {
    expectTrace({ processes: presets.allIo, quantum: 2 }, allIo);
  });
});

describe("experiment workloads", () => {
  it("E3: three I/O-bound processes overlap their waits", () => {
    const trace = run([
      [0, 1, 6, 1],
      [0, 1, 6, 1],
      [0, 1, 6, 1],
    ]);
    expect(segments(trace.result.cpuSegments)).toBe(
      "P1 0-1, P2 1-2, P3 2-3, - 3-7, P1 7-8, P2 8-9, P3 9-10",
    );
    expect(column(trace, "finish")).toEqual([8, 9, 10]);
    expect(column(trace, "ready")).toEqual([0, 1, 2]);
    expect(trace.result.makespan).toBe(10);
    expect(trace.result.busy).toBe(6);
    expect(trace.result.utilization).toBeCloseTo(0.6, 10);
    expect(trace.result.serialTime).toBe(24);
  });

  it("E4: a short process waits behind a long one", () => {
    const trace = run([
      [0, 6],
      [1, 1],
    ]);
    expect(segments(trace.result.cpuSegments)).toBe("P1 0-6, P2 6-7");
    const p2 = trace.result.processes[1];
    expect([p2?.ready, p2?.cpu, p2?.io, p2?.turnaround]).toEqual([5, 1, 0, 6]);
  });
});

describe("edge cases", () => {
  it("single process, CPU only", () => {
    const trace = run([[0, 3]]);
    expect(segments(trace.result.cpuSegments)).toBe("P1 0-3");
    expect(keyRows(trace).at(-1)).toBe("exit P1 (3)");
    expect(column(trace, "ready")).toEqual([0]);
    expect(column(trace, "io")).toEqual([0]);
    expect(stateRows(trace)).not.toContain("B");
  });

  it("worked example from Theory", () => {
    const trace = run([[0, 1, 2, 1]]);
    expect(stateRows(trace)).toEqual(["R", "B", "B", "R", "T"]);
    expect(keyRows(trace)[1]).toBe("block P1 (2, until 3), idle.io");
    expect(keyRows(trace)[2]).toBe("idle.io");
    expect(keyRows(trace)[3]).toBe("wakeup P1, dispatch P1");
    expect(column(trace, "finish")).toEqual([4]);
    expect(trace.result.utilization).toBeCloseTo(2 / 4, 10);
  });

  it("idle before the first arrival", () => {
    const trace = run([[2, 1]]);
    expect(keyRows(trace).slice(0, 2)).toEqual(["idle.arrivals", "idle.arrivals"]);
    expect(stateRows(trace).slice(0, 2)).toEqual(["—", "—"]);
    expect(segments(trace.result.cpuSegments)).toBe("- 0-2, P1 2-3");
    expect(trace.result.makespan).toBe(3);
    expect(trace.result.utilization).toBeCloseTo(1 / 3, 10);
  });

  it("arrival and I/O completion tie: the arrival is queued first", () => {
    const trace = run([
      [0, 1, 1, 1],
      [2, 1],
    ]);
    expect(trace.steps[2]?.state.running).toBe("P2");
    expect(trace.steps[2]?.state.queue).toEqual(["P1"]);
    expect(segments(trace.result.cpuSegments)).toBe("P1 0-1, - 1-2, P2 2-3, P1 3-4");
    expect(keyRows(trace)[1]).toBe("block P1 (1, until 2), idle.io");
  });

  it("I/O completion and timeout tie: the woken process is queued first", () => {
    const trace = run(
      [
        [0, 1, 1, 1],
        [0, 2],
      ],
      1,
    );
    expect(keyRows(trace)[2]).toBe("timeout P2 (1), wakeup P1, dispatch P1");
    expect(trace.steps[2]?.state.queue).toEqual(["P2"]);
    expect(segments(trace.result.cpuSegments)).toBe("P1 0-1, P2 1-2, P1 2-3, P2 3-4");
  });

  it("a burst that ends with the quantum blocks instead of timing out", () => {
    const trace = run([[0, 2, 1, 1]], 2);
    expect(keyRows(trace)[2]).toBe("block P1 (1, until 3), idle.io");
    expect(keyRows(trace).join(", ")).not.toContain("timeout");
  });
});

describe("invariants", () => {
  for (const preset of presetIds) {
    for (const quantum of [null, 1, 2, 3, 4, 5, 6]) {
      it(`${preset}, quantum ${quantum ?? "off"}`, () => {
        const input = { processes: presets[preset], quantum };
        const trace = simulate(input);
        for (const p of trace.result.processes) {
          expect(p.turnaround).toBe(p.cpu + p.io + p.ready);
        }
        trace.steps.forEach((step, t) => {
          expect(step.t).toBe(t);
        });
        expect(trace.steps.length).toBe(trace.result.makespan + 1);
        const last = trace.steps.at(-1);
        expect(last?.state.processes.every((p) => p.status === "terminated")).toBe(true);
        // The final snapshot's counters cover [0, makespan) and match the result.
        expect(last?.state.busy).toBe(trace.result.busy);
        expect(last?.state.processes.map((p) => p.ready)).toEqual(column(trace, "ready"));
        expect(simulate(input)).toEqual(trace);
      });
    }
  }
});

describe("input validation", () => {
  const bad: [string, ProcessStatesInput][] = [
    ["no processes", { processes: [], quantum: null }],
    [
      "six processes",
      {
        processes: procs([
          [0, 1],
          [0, 1],
          [0, 1],
          [0, 1],
          [0, 1],
          [0, 1],
        ]),
        quantum: null,
      },
    ],
    ["two bursts", { processes: procs([[0, 1, 1]]), quantum: null }],
    ["burst 0", { processes: procs([[0, 0]]), quantum: null }],
    ["burst 9", { processes: procs([[0, 9]]), quantum: null }],
    ["arrival 11", { processes: procs([[11, 1]]), quantum: null }],
    ["quantum 0", { processes: procs([[0, 1]]), quantum: 0 }],
    ["quantum 7", { processes: procs([[0, 1]]), quantum: 7 }],
    [
      "duplicate ids",
      {
        processes: [
          { id: "P1", arrival: 0, bursts: [1] },
          { id: "P1", arrival: 0, bursts: [1] },
        ],
        quantum: null,
      },
    ],
  ];
  for (const [name, input] of bad) {
    it(`rejects ${name}`, () => {
      expect(() => simulate(input)).toThrow(RangeError);
    });
  }
});
