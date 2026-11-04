import type { Step, Trace } from "../trace";

export const limits = {
  threads: { min: 2, max: 3 },
  increments: { min: 1, max: 3 },
  quantum: { min: 1, max: 6 },
} as const;

export type Schedule =
  | { kind: "timer"; quantum: number }
  /** One thread id per instruction. */
  | { kind: "manual"; order: readonly string[] };

export interface RaceInput {
  /** Number of threads, ids T1…Tn. */
  threads: number;
  /** counter++ runs this many times in each thread. */
  increments: number;
  /** true: counter++ is one indivisible `inc`; false: load, add, store. */
  atomic: boolean;
  schedule: Schedule;
}

export const instructions = ["load", "add", "store", "inc"] as const;
export type Instruction = (typeof instructions)[number];

export interface ThreadView {
  id: string;
  /** Index of the next instruction; program.length once finished. */
  pc: number;
  /** Private register; null before the first load (always null when atomic). */
  reg: number | null;
  /** Value loaded for the increment in progress; null outside load…store. */
  loaded: number | null;
  status: "running" | "ready" | "done";
}

/** State after the instruction of the step. */
export interface RaceState {
  counter: number;
  threads: readonly ThreadView[];
  /** Thread that ran this step's instruction. */
  running: string;
  /** Instruction it ran. */
  instruction: Instruction;
}

/** One write to counter. `loaded` is null for an atomic inc. */
export interface Write {
  step: number;
  id: string;
  value: number;
  loaded: number | null;
  before: number;
  stale: boolean;
}

export interface Segment {
  id: string;
  start: number;
  end: number;
}

export interface RaceResult {
  /** Instruction list of every thread (all threads run the same program). */
  program: readonly Instruction[];
  final: number;
  expected: number;
  /** expected − final. */
  lost: number;
  /** false when a manual order ends before every thread finishes. */
  complete: boolean;
  instructions: number;
  /** Thread switches after the first dispatch or pick. */
  switches: number;
  writes: readonly Write[];
  segments: readonly Segment[];
}

/** Explanation keys and their params. Templates live in src/i18n/engines/race-conditions.<lang>.ts. */
export interface RaceExplainParams {
  dispatch: { id: string };
  preempt: { id: string; quantum: number };
  pick: { id: string };
  load: { id: string; value: number };
  add: { id: string; value: number; counter: number };
  store: { id: string; value: number };
  "store.stale": { id: string; value: number; loaded: number; before: number };
  inc: { id: string; value: number };
  finish: { id: string };
}

export type RaceExplainKey = keyof RaceExplainParams;

export type RaceExplanation = {
  [K in RaceExplainKey]: { key: K; params: RaceExplainParams[K] };
}[RaceExplainKey];

export type RaceStep = Step<RaceState, RaceExplanation>;
export type RaceTrace = Trace<RaceState, RaceResult, RaceExplanation>;
