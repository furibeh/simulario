import type { Step, Trace } from "../trace";

export const limits = {
  threads: { min: 2, max: 5 },
  resources: { min: 2, max: 5 },
  delay: { min: 0, max: 4 },
  script: { min: 1, max: 8 },
} as const;

export type Operation =
  | { op: "acquire"; res: number }
  | { op: "release"; res: number }
  | { op: "work" };

export interface ThreadSpec {
  /** Turns of `think` before the script. */
  delay: number;
  script: readonly Operation[];
}

export interface GraphInput {
  /** Number of single-instance resources, ids R1…Rn. */
  resources: number;
  /** Threads T1…Tn, in order. */
  threads: readonly ThreadSpec[];
  /** "global": each thread's acquires take its resources in increasing order. */
  ordering: "script" | "global";
}

export interface ThreadView {
  id: string;
  status: "ready" | "blocked" | "done";
  /** Resource ids held, in increasing order. */
  holds: readonly string[];
  waitsFor: string | null;
  /** Index of the next operation in the effective program (delay included). */
  pc: number;
}

export interface ResourceView {
  id: string;
  holder: string | null;
  /** Threads waiting for it, first to be served first. */
  queue: readonly string[];
}

/** State after the operation of the step. */
export interface GraphState {
  threads: readonly ThreadView[];
  resources: readonly ResourceView[];
  /** Thread that ran this step. */
  ran: string;
  ready: readonly string[];
  /** Cycle found so far (thread ids in path order), or null. */
  cycle: readonly string[] | null;
}

export interface Block {
  step: number;
  id: string;
  res: string;
  holder: string;
}

export interface Segment {
  id: string;
  start: number;
  end: number;
}

/** Program actually run: think turns, then the script after ordering. */
export type ProgramOp = Operation | { op: "think" };

export interface GraphResult {
  programs: Readonly<Record<string, readonly ProgramOp[]>>;
  deadlock: boolean;
  cycle: readonly string[] | null;
  cycleStep: number | null;
  stalled: boolean;
  finishOrder: readonly string[];
  /** Threads that ran `work`, in the order of their first `work`. */
  worked: readonly string[];
  blocks: readonly Block[];
  steps: number;
  segments: readonly Segment[];
}

/** Explanation keys and their params. Templates live in src/i18n/engines/resource-graph.<lang>.ts. */
export interface GraphExplainParams {
  acquire: { id: string; res: string };
  block: { id: string; res: string; holder: string };
  release: { id: string; res: string };
  handoff: { id: string; res: string; to: string };
  work: { id: string };
  think: { id: string };
  finish: { id: string };
  cycle: { path: string };
  stalled: { count: number };
}

export type GraphExplainKey = keyof GraphExplainParams;

export type GraphExplanation = {
  [K in GraphExplainKey]: { key: K; params: GraphExplainParams[K] };
}[GraphExplainKey];

export type GraphStep = Step<GraphState, GraphExplanation>;
export type GraphTrace = Trace<GraphState, GraphResult, GraphExplanation>;
