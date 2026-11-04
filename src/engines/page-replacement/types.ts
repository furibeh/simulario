import type { Step, Trace } from "../trace";

export const limits = {
  refs: { min: 1, max: 20 },
  page: { min: 0, max: 9 },
  frames: { min: 1, max: 6 },
} as const;

export const algorithms = ["fifo", "lru", "opt", "clock"] as const;
export type Algorithm = (typeof algorithms)[number];

export interface ReplacementInput {
  refs: readonly number[];
  frames: number;
  algorithm: Algorithm;
}

/** State after the reference of the step. */
export interface ReplacementState {
  /** Page in each slot, or null. */
  slots: readonly (number | null)[];
  /** FIFO: pages in load order, oldest first. */
  queue: readonly number[];
  /** LRU: pages by last use, least recent first. */
  recency: readonly number[];
  /** Clock: use bit per slot. */
  bits: readonly (0 | 1)[];
  /** Clock: slot under the hand. */
  hand: number;
  /** OPT: 1-based position of the next use of the page in each slot after this step, or null if never. */
  nextUse: readonly (number | null)[];
  record: RefRecord;
}

export interface RefRecord {
  index: number;
  page: number;
  hit: boolean;
  slot: number;
  victim: number | null;
}

export interface ReplacementResult {
  records: readonly RefRecord[];
  faults: number;
  hits: number;
  /** Distinct pages: the faults no algorithm can avoid. */
  compulsory: number;
}

/** Explanation keys and their params. Templates live in src/i18n/engines/page-replacement.<lang>.ts. */
export interface ReplacementExplainParams {
  hit: { page: number; slot: number };
  load: { page: number; slot: number };
  "evict.fifo": { page: number; victim: number; slot: number };
  "evict.lru": { page: number; victim: number; slot: number };
  "evict.opt": { page: number; victim: number; slot: number; next: number };
  "evict.opt.never": { page: number; victim: number; slot: number };
  "clock.clear": { page: number; slot: number };
  "evict.clock": { page: number; victim: number; slot: number };
}

export type ReplacementExplainKey = keyof ReplacementExplainParams;

export type ReplacementExplanation = {
  [K in ReplacementExplainKey]: { key: K; params: ReplacementExplainParams[K] };
}[ReplacementExplainKey];

export type ReplacementStep = Step<ReplacementState, ReplacementExplanation>;
export type ReplacementTrace = Trace<ReplacementState, ReplacementResult, ReplacementExplanation>;
