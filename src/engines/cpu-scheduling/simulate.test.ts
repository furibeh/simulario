import { describe, expect, it } from "vitest";
import { type PresetId, presets } from "./presets";
import { simulate } from "./simulate";
import type { Algorithm, CpuInput, ProcessSpec } from "./types";

/**
 * Expected values are hand-computed in docs/lessons/planificador-cpu.md ("Expected results").
 * Never regenerate them from the engine's output.
 */
interface Expected {
  schedule: string; // "P1 0-10, P2 10-12"; idle runs are written "- a-b"
  finish: number[];
  turnaround: number[];
  waiting: number[];
  response: number[];
  avg: [turnaround: number, waiting: number, response: number];
  order: string;
}

const expected: Record<PresetId, Record<Algorithm, Expected>> = {
  convoy: {
    fcfs: {
      schedule: "P1 0-10, P2 10-12, P3 12-13, P4 13-16",
      finish: [10, 12, 13, 16],
      turnaround: [10, 11, 11, 13],
      waiting: [0, 9, 10, 10],
      response: [0, 9, 10, 10],
      avg: [11.25, 7.25, 7.25],
      order: "P1 P2 P3 P4",
    },
    sjf: {
      schedule: "P1 0-10, P3 10-11, P2 11-13, P4 13-16",
      finish: [10, 13, 11, 16],
      turnaround: [10, 12, 9, 13],
      waiting: [0, 10, 8, 10],
      response: [0, 10, 8, 10],
      avg: [11, 7, 7],
      order: "P1 P3 P2 P4",
    },
    srtf: {
      schedule: "P1 0-1, P2 1-3, P3 3-4, P4 4-7, P1 7-16",
      finish: [16, 3, 4, 7],
      turnaround: [16, 2, 2, 4],
      waiting: [6, 0, 1, 1],
      response: [0, 0, 1, 1],
      avg: [6, 2, 0.5],
      order: "P2 P3 P4 P1",
    },
    priority: {
      schedule: "P1 0-10, P2 10-12, P3 12-13, P4 13-16",
      finish: [10, 12, 13, 16],
      turnaround: [10, 11, 11, 13],
      waiting: [0, 9, 10, 10],
      response: [0, 9, 10, 10],
      avg: [11.25, 7.25, 7.25],
      order: "P1 P2 P3 P4",
    },
    rr: {
      schedule: "P1 0-2, P2 2-4, P3 4-5, P1 5-7, P4 7-9, P1 9-11, P4 11-12, P1 12-14, P1 14-16",
      finish: [16, 4, 5, 12],
      turnaround: [16, 3, 3, 9],
      waiting: [6, 1, 2, 6],
      response: [0, 1, 2, 4],
      avg: [7.75, 3.75, 1.75],
      order: "P2 P3 P4 P1",
    },
  },
  staggered: {
    fcfs: {
      schedule: "P1 0-6, P2 6-10, P3 10-12, P4 12-17, P5 17-18",
      finish: [6, 10, 12, 17, 18],
      turnaround: [6, 8, 8, 11, 10],
      waiting: [0, 4, 6, 6, 9],
      response: [0, 4, 6, 6, 9],
      avg: [8.6, 5, 5],
      order: "P1 P2 P3 P4 P5",
    },
    sjf: {
      schedule: "P1 0-6, P3 6-8, P5 8-9, P2 9-13, P4 13-18",
      finish: [6, 13, 8, 18, 9],
      turnaround: [6, 11, 4, 12, 1],
      waiting: [0, 7, 2, 7, 0],
      response: [0, 7, 2, 7, 0],
      avg: [6.8, 3.2, 3.2],
      order: "P1 P3 P5 P2 P4",
    },
    srtf: {
      schedule: "P1 0-6, P3 6-8, P5 8-9, P2 9-13, P4 13-18",
      finish: [6, 13, 8, 18, 9],
      turnaround: [6, 11, 4, 12, 1],
      waiting: [0, 7, 2, 7, 0],
      response: [0, 7, 2, 7, 0],
      avg: [6.8, 3.2, 3.2],
      order: "P1 P3 P5 P2 P4",
    },
    priority: {
      schedule: "P1 0-6, P2 6-10, P5 10-11, P4 11-16, P3 16-18",
      finish: [6, 10, 18, 16, 11],
      turnaround: [6, 8, 14, 10, 3],
      waiting: [0, 4, 12, 5, 2],
      response: [0, 4, 12, 5, 2],
      avg: [8.2, 4.6, 4.6],
      order: "P1 P2 P5 P4 P3",
    },
    rr: {
      schedule:
        "P1 0-2, P2 2-4, P1 4-6, P3 6-8, P2 8-10, P4 10-12, P1 12-14, P5 14-15, P4 15-17, P4 17-18",
      finish: [14, 10, 8, 18, 15],
      turnaround: [14, 8, 4, 12, 7],
      waiting: [8, 4, 2, 7, 6],
      response: [0, 0, 2, 4, 6],
      avg: [9, 5.4, 2.4],
      order: "P3 P2 P1 P5 P4",
    },
  },
  similar: {
    fcfs: {
      schedule: "P1 0-4, P2 4-9, P3 9-13, P4 13-18",
      finish: [4, 9, 13, 18],
      turnaround: [4, 9, 12, 16],
      waiting: [0, 4, 8, 11],
      response: [0, 4, 8, 11],
      avg: [10.25, 5.75, 5.75],
      order: "P1 P2 P3 P4",
    },
    sjf: {
      schedule: "P1 0-4, P3 4-8, P2 8-13, P4 13-18",
      finish: [4, 13, 8, 18],
      turnaround: [4, 13, 7, 16],
      waiting: [0, 8, 3, 11],
      response: [0, 8, 3, 11],
      avg: [10, 5.5, 5.5],
      order: "P1 P3 P2 P4",
    },
    srtf: {
      schedule: "P1 0-4, P3 4-8, P2 8-13, P4 13-18",
      finish: [4, 13, 8, 18],
      turnaround: [4, 13, 7, 16],
      waiting: [0, 8, 3, 11],
      response: [0, 8, 3, 11],
      avg: [10, 5.5, 5.5],
      order: "P1 P3 P2 P4",
    },
    priority: {
      schedule: "P2 0-5, P1 5-9, P4 9-14, P3 14-18",
      finish: [9, 5, 18, 14],
      turnaround: [9, 5, 17, 12],
      waiting: [5, 0, 13, 7],
      response: [5, 0, 13, 7],
      avg: [10.75, 6.25, 6.25],
      order: "P2 P1 P4 P3",
    },
    rr: {
      schedule:
        "P1 0-2, P2 2-4, P3 4-6, P4 6-8, P1 8-10, P2 10-12, P3 12-14, P4 14-16, P2 16-17, P4 17-18",
      finish: [10, 17, 14, 18],
      turnaround: [10, 17, 13, 16],
      waiting: [6, 12, 9, 11],
      response: [0, 2, 3, 4],
      avg: [14, 9.5, 2.25],
      order: "P1 P3 P2 P4",
    },
  },
};

function schedule(input: CpuInput): string {
  return simulate(input)
    .result.segments.map((s) => `${s.id ?? "-"} ${s.start}-${s.end}`)
    .join(", ");
}

const procs = (rows: [number, number, number?][]): ProcessSpec[] =>
  rows.map(([arrival, burst, priority = 1], i) => ({ id: `P${i + 1}`, arrival, burst, priority }));

describe("presets × algorithms (quantum 2)", () => {
  for (const [preset, byAlgorithm] of Object.entries(expected) as [
    PresetId,
    typeof expected.convoy,
  ][]) {
    for (const [algorithm, exp] of Object.entries(byAlgorithm) as [Algorithm, Expected][]) {
      it(`${preset} / ${algorithm}`, () => {
        const input: CpuInput = { processes: presets[preset], algorithm, quantum: 2 };
        const { result } = simulate(input);
        expect(schedule(input)).toBe(exp.schedule);
        expect(result.processes.map((p) => p.finish)).toEqual(exp.finish);
        expect(result.processes.map((p) => p.turnaround)).toEqual(exp.turnaround);
        expect(result.processes.map((p) => p.waiting)).toEqual(exp.waiting);
        expect(result.processes.map((p) => p.response)).toEqual(exp.response);
        expect(result.averages.turnaround).toBeCloseTo(exp.avg[0], 10);
        expect(result.averages.waiting).toBeCloseTo(exp.avg[1], 10);
        expect(result.averages.response).toBeCloseTo(exp.avg[2], 10);
        expect(result.finishOrder.join(" ")).toBe(exp.order);
      });
    }
  }
});

describe("edge cases", () => {
  it("leaves the CPU idle when nothing is ready", () => {
    const input: CpuInput = {
      processes: procs([
        [0, 2],
        [5, 1],
      ]),
      algorithm: "fcfs",
      quantum: 2,
    };
    const trace = simulate(input);
    expect(schedule(input)).toBe("P1 0-2, - 2-5, P2 5-6");
    for (const t of [2, 3, 4]) {
      expect(trace.steps[t]?.explain).toEqual([{ key: "idle", params: {} }]);
    }
    expect(trace.result.processes.map((p) => p.waiting)).toEqual([0, 0]);
  });

  it("queues simultaneous arrivals in input order", () => {
    expect(
      schedule({
        processes: procs([
          [0, 3],
          [0, 1],
        ]),
        algorithm: "fcfs",
        quantum: 2,
      }),
    ).toBe("P1 0-3, P2 3-4");
  });

  it("SRTF keeps the running process on a tie", () => {
    expect(
      schedule({
        processes: procs([
          [0, 3],
          [1, 2],
        ]),
        algorithm: "srtf",
        quantum: 2,
      }),
    ).toBe("P1 0-3, P2 3-5");
  });

  it("RR with quantum 1 alternates every unit", () => {
    const input: CpuInput = {
      processes: procs([
        [0, 2],
        [0, 2],
      ]),
      algorithm: "rr",
      quantum: 1,
    };
    const { result } = simulate(input);
    expect(schedule(input)).toBe("P1 0-1, P2 1-2, P1 2-3, P2 3-4");
    expect(result.processes.map((p) => p.finish)).toEqual([3, 4]);
    expect(result.processes.map((p) => p.response)).toEqual([0, 1]);
  });

  it("RR queues a same-instant arrival before the expired process", () => {
    expect(
      schedule({
        processes: procs([
          [0, 3],
          [2, 1],
        ]),
        algorithm: "rr",
        quantum: 2,
      }),
    ).toBe("P1 0-2, P2 2-3, P1 3-4");
  });

  it("RR does not expire a process that finishes with quantum left", () => {
    const trace = simulate({
      processes: procs([
        [0, 2],
        [5, 1],
      ]),
      algorithm: "rr",
      quantum: 4,
    });
    const keys = trace.steps.flatMap((s) => s.explain.map((e) => e.key));
    expect(keys).not.toContain("rr.expire");
    expect(trace.result.processes[0]?.finish).toBe(2);
  });

  it("RR with a quantum at least as long as every burst behaves like FCFS (E1)", () => {
    const rr = simulate({ processes: presets.similar, algorithm: "rr", quantum: 5 });
    const fcfs = simulate({ processes: presets.similar, algorithm: "fcfs", quantum: 5 });
    expect(rr.result.finishOrder).toEqual(fcfs.result.finishOrder);
    expect(rr.result.averages).toEqual(fcfs.result.averages);
  });
});

describe("explanations", () => {
  it("FCFS on the convoy preset explains why P2 keeps the CPU at t = 11", () => {
    const step = simulate({ processes: presets.convoy, algorithm: "fcfs", quantum: 2 }).steps[11];
    expect(step?.explain).toEqual([
      { key: "nonpreemptive.continue", params: { id: "P2", algorithm: "fcfs" } },
      { key: "finish", params: { id: "P2", time: 12 } },
    ]);
  });

  it("SRTF on the convoy preset explains the preemption at t = 1", () => {
    const step = simulate({ processes: presets.convoy, algorithm: "srtf", quantum: 2 }).steps[1];
    expect(step?.explain[0]).toEqual({
      key: "srtf.preempt",
      params: { id: "P2", preempted: "P1", remaining: 2, preemptedRemaining: 9 },
    });
  });

  it("RR reports quantum use and expiry", () => {
    const steps = simulate({ processes: presets.convoy, algorithm: "rr", quantum: 2 }).steps;
    expect(steps[0]?.explain).toEqual([{ key: "rr.pick", params: { id: "P1", quantum: 2 } }]);
    expect(steps[1]?.explain).toEqual([
      { key: "rr.continue", params: { id: "P1", used: 1, quantum: 2 } },
      { key: "rr.expire", params: { id: "P1" } },
    ]);
  });

  it("every step records full state", () => {
    const step = simulate({ processes: presets.convoy, algorithm: "fcfs", quantum: 2 }).steps[11];
    expect(step?.state).toEqual({
      running: "P2",
      queue: ["P3", "P4"],
      finished: ["P1", "P2"],
      remaining: { P1: 0, P2: 0, P3: 1, P4: 3 },
    });
  });
});

describe("input validation", () => {
  it("rejects out-of-range values", () => {
    expect(() => simulate({ processes: procs([[0, 1]]), algorithm: "fcfs", quantum: 2 })).toThrow(
      RangeError,
    );
    expect(() =>
      simulate({
        processes: procs([
          [0, 0],
          [0, 1],
        ]),
        algorithm: "fcfs",
        quantum: 2,
      }),
    ).toThrow(RangeError);
    expect(() =>
      simulate({
        processes: procs([
          [0, 1],
          [0, 1],
        ]),
        algorithm: "rr",
        quantum: 7,
      }),
    ).toThrow(RangeError);
  });
});
