import type { Step, Trace } from "../trace";

export const algorithms = ["fcfs", "sjf", "srtf", "priority", "rr"] as const;
export type Algorithm = (typeof algorithms)[number];

export const limits = {
  processes: { min: 2, max: 6 },
  arrival: { min: 0, max: 20 },
  burst: { min: 1, max: 12 },
  priority: { min: 1, max: 9 },
  quantum: { min: 1, max: 6 },
} as const;

/** Simulation stops here even if processes remain; valid inputs never reach it. */
export const TIME_CAP = 400;

export interface ProcessSpec {
  id: string;
  arrival: number;
  burst: number;
  /** 1 is the most urgent. */
  priority: number;
}

export interface CpuInput {
  processes: readonly ProcessSpec[];
  algorithm: Algorithm;
  /** Used only by Round Robin. */
  quantum: number;
}

export interface CpuState {
  /** Process that ran during [t, t + 1), or null when the CPU was idle. */
  running: string | null;
  /** Ready processes waiting during the unit, in queue order (the running one excluded). */
  queue: readonly string[];
  /** Processes finished by t + 1, in finish order. */
  finished: readonly string[];
  /** Remaining burst per process at t + 1. */
  remaining: Readonly<Record<string, number>>;
}

export interface ProcessMetrics extends ProcessSpec {
  firstStart: number;
  finish: number;
  turnaround: number;
  waiting: number;
  response: number;
}

/** A maximal run of one process (or idle time, id null). RR turns cut by an expired quantum stay separate. */
export interface Segment {
  id: string | null;
  start: number;
  end: number;
}

export interface CpuResult {
  processes: readonly ProcessMetrics[];
  averages: { turnaround: number; waiting: number; response: number };
  finishOrder: readonly string[];
  segments: readonly Segment[];
  /** Total simulated time. */
  makespan: number;
}

/** Explanation keys and their params. Templates live in src/i18n/engines/cpu-scheduling.<lang>.ts. */
export interface CpuExplainParams {
  "fcfs.pick": { id: string; arrival: number };
  "sjf.pick": { id: string; burst: number };
  "srtf.pick": { id: string; remaining: number };
  "srtf.preempt": { id: string; preempted: string; remaining: number; preemptedRemaining: number };
  "srtf.keep": { id: string; remaining: number };
  "priority.pick": { id: string; priority: number };
  "rr.pick": { id: string; quantum: number };
  "rr.continue": { id: string; used: number; quantum: number };
  "rr.expire": { id: string };
  "nonpreemptive.continue": { id: string; algorithm: Algorithm };
  finish: { id: string; time: number };
  idle: Record<string, never>;
}

export type CpuExplainKey = keyof CpuExplainParams;

export type CpuExplanation = {
  [K in CpuExplainKey]: { key: K; params: CpuExplainParams[K] };
}[CpuExplainKey];

export type CpuStep = Step<CpuState, CpuExplanation>;
export type CpuTrace = Trace<CpuState, CpuResult, CpuExplanation>;
