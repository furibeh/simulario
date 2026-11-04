import type { Step, Trace } from "../trace";

export const limits = {
  processes: { min: 1, max: 5 },
  arrival: { min: 0, max: 10 },
  burst: { min: 1, max: 8 },
  burstCounts: [1, 3, 5],
  quantum: { min: 1, max: 6 },
} as const;

/** Simulation stops here even if processes remain; valid inputs never reach it. */
export const TIME_CAP = 200;

export interface ProcessSpec {
  id: string;
  arrival: number;
  /** Alternating CPU and I/O bursts, starting and ending with CPU (even index = CPU). */
  bursts: readonly number[];
}

export interface ProcessStatesInput {
  processes: readonly ProcessSpec[];
  /** null: non-preemptive. Otherwise a running process leaves the CPU after this many units. */
  quantum: number | null;
}

/** "New" is never a step state: admission is instantaneous and shows up only as `admit`. */
export const statuses = ["absent", "ready", "running", "blocked", "terminated"] as const;
export type ProcessStatus = (typeof statuses)[number];

export interface ProcessView {
  id: string;
  status: ProcessStatus;
  /** Index of the current burst; bursts.length once terminated. */
  burst: number;
  /** Units left in the current burst at t, before the unit runs. */
  remaining: number;
  /** Instant the I/O ends, while blocked. */
  ioUntil: number | null;
  /** Units spent on the CPU, in I/O and in the ready queue during [0, t). */
  cpu: number;
  io: number;
  ready: number;
}

/** State after the transitions at t, that is, during the unit [t, t + 1). */
export interface ProcessStatesState {
  /** One view per process, in input order. */
  processes: readonly ProcessView[];
  running: string | null;
  /** Ready queue in order (the running process excluded). */
  queue: readonly string[];
  /** Units with a running process during [0, t). */
  busy: number;
}

export interface ProcessMetrics {
  id: string;
  arrival: number;
  bursts: readonly number[];
  finish: number;
  turnaround: number;
  cpu: number;
  io: number;
  ready: number;
}

/** A maximal run of one process (id null: idle CPU). Turns cut by a timeout stay separate. */
export interface Segment {
  id: string | null;
  start: number;
  end: number;
}

export interface ProcessStatesResult {
  processes: readonly ProcessMetrics[];
  finishOrder: readonly string[];
  cpuSegments: readonly Segment[];
  ioSegments: readonly Segment[];
  /** Instant of the last exit. */
  makespan: number;
  /** Units with a running process. */
  busy: number;
  /** busy / makespan. */
  utilization: number;
  /** Sum of cpu + io over all processes: running them one after another with no gaps. */
  serialTime: number;
}

/** Explanation keys and their params. Templates live in src/i18n/engines/process-states.<lang>.ts. */
export interface ProcessStatesExplainParams {
  admit: { id: string };
  dispatch: { id: string };
  continue: { id: string; remaining: number };
  block: { id: string; duration: number; until: number };
  wakeup: { id: string };
  timeout: { id: string; quantum: number };
  exit: { id: string; time: number };
  "idle.io": Record<string, never>;
  "idle.arrivals": Record<string, never>;
}

export type ProcessStatesExplainKey = keyof ProcessStatesExplainParams;

export type ProcessStatesExplanation = {
  [K in ProcessStatesExplainKey]: { key: K; params: ProcessStatesExplainParams[K] };
}[ProcessStatesExplainKey];

export type ProcessStatesStep = Step<ProcessStatesState, ProcessStatesExplanation>;
export type ProcessStatesTrace = Trace<
  ProcessStatesState,
  ProcessStatesResult,
  ProcessStatesExplanation
>;
