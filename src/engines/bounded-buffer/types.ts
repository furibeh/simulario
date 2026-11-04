import type { Step, Trace } from "../trace";

export const limits = {
  producers: { min: 1, max: 2 },
  consumers: { min: 1, max: 2 },
  items: { min: 1, max: 4 },
  capacity: { min: 1, max: 4 },
  quantum: { min: 1, max: 6 },
} as const;

export const semaphores = ["empty", "full", "mutex"] as const;
export type Sem = (typeof semaphores)[number];

export type Version = "correct" | "swapped";

export interface BufferInput {
  producers: number;
  consumers: number;
  /** Items per producer. */
  items: number;
  capacity: number;
  /** "swapped": the producer waits on mutex before empty. */
  version: Version;
  /** null: a thread keeps the CPU until it blocks or finishes. */
  quantum: number | null;
}

export type Operation =
  | { op: "wait"; sem: Sem }
  | { op: "signal"; sem: Sem }
  | { op: "put" }
  | { op: "take" };

export type Role = "producer" | "consumer";

export interface ThreadView {
  id: string;
  role: Role;
  /** Index of the next operation; program length once finished. */
  pc: number;
  status: "ready" | "running" | "blocked" | "done";
  blockedOn: Sem | null;
  /** Items put or taken so far. */
  items: number;
}

export interface SemView {
  value: number;
  /** Blocked thread ids, first to wake first. */
  queue: readonly string[];
}

/** State after the operation of the step. */
export interface BufferState {
  sems: Readonly<Record<Sem, SemView>>;
  /** One entry per slot: item name or null. */
  buffer: readonly (string | null)[];
  in: number;
  out: number;
  threads: readonly ThreadView[];
  /** Thread that ran this step's operation. */
  ran: string;
  /** Thread holding the CPU after the step, if any. */
  running: string | null;
  ready: readonly string[];
}

export interface Consumed {
  item: string;
  by: string;
  step: number;
}

export interface Block {
  step: number;
  id: string;
  sem: Sem;
}

export interface Segment {
  id: string;
  start: number;
  end: number;
}

export interface BufferResult {
  /** Program of each thread, in id order. */
  programs: Readonly<Record<string, readonly Operation[]>>;
  completed: boolean;
  deadlock: boolean;
  steps: number;
  consumed: readonly Consumed[];
  blocks: readonly Block[];
  finishOrder: readonly string[];
  finalSems: Readonly<Record<Sem, number>>;
  segments: readonly Segment[];
}

/** Explanation keys and their params. Templates live in src/i18n/engines/bounded-buffer.<lang>.ts. */
export interface BufferExplainParams {
  dispatch: { id: string };
  preempt: { id: string; quantum: number };
  "wait.pass": { id: string; sem: Sem; value: number };
  "wait.block": { id: string; sem: Sem };
  "signal.inc": { id: string; sem: Sem; value: number };
  "signal.wake": { id: string; sem: Sem; woken: string };
  put: { id: string; item: string; slot: number };
  take: { id: string; item: string; slot: number };
  finish: { id: string };
  deadlock: Record<string, never>;
  stuck: { id: string; sem: Sem };
}

export type BufferExplainKey = keyof BufferExplainParams;

export type BufferExplanation = {
  [K in BufferExplainKey]: { key: K; params: BufferExplainParams[K] };
}[BufferExplainKey];

export type BufferStep = Step<BufferState, BufferExplanation>;
export type BufferTrace = Trace<BufferState, BufferResult, BufferExplanation>;
