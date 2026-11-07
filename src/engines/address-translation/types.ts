import type { Step, Trace } from "../trace";

export const limits = {
  pageSizes: [8, 16, 32, 64],
  pages: { min: 2, max: 8 },
  frames: { min: 2, max: 6 },
  tlbSize: { min: 0, max: 4 },
  accesses: { min: 1, max: 10 },
} as const;

/** Cost model from docs/lessons/operating-systems/paging.md. */
export const costs = { tlb: 1, memory: 100, fault: 10_000 } as const;

export type PageEntry = { kind: "frame"; frame: number } | { kind: "disk" } | { kind: "invalid" };

export interface TranslationInput {
  pageSize: number;
  /** Page k at index k. */
  pages: readonly PageEntry[];
  frames: number;
  /** 0: no TLB. */
  tlbSize: number;
  /** Virtual addresses, in order. */
  accesses: readonly number[];
}

export type Outcome = "hit" | "miss" | "fault" | "invalid";

export interface TlbEntry {
  page: number;
  frame: number;
}

/** State after the access of the step. */
export interface TranslationState {
  pages: readonly PageEntry[];
  /** Least recently used first. */
  tlb: readonly TlbEntry[];
  /** Page held by each frame, or null. */
  frames: readonly (number | null)[];
  /** Frames in FIFO order, oldest first. */
  fifo: readonly number[];
  /** The access of this step. */
  access: AccessRecord;
}

export interface AccessRecord {
  index: number;
  address: number;
  page: number;
  offset: number;
  outcome: Outcome;
  /** null when the page is invalid. */
  frame: number | null;
  phys: number | null;
  cost: number;
}

export interface TranslationResult {
  accesses: readonly AccessRecord[];
  hits: number;
  misses: number;
  faults: number;
  invalid: boolean;
  cost: number;
  /** Accesses that completed (an invalid access does not). */
  completed: number;
}

/** Explanation keys and their params. Templates live in src/i18n/engines/address-translation.<lang>.ts. */
export interface TranslationExplainParams {
  split: { addr: number; page: number; offset: number };
  "tlb.hit": { page: number; frame: number };
  "tlb.miss": { page: number };
  "pt.hit": { page: number; frame: number };
  fault: { page: number };
  evict: { page: number; frame: number };
  "tlb.drop": { page: number };
  load: { page: number; frame: number };
  segfault: { page: number };
  "tlb.evict": { page: number };
  "tlb.fill": { page: number; frame: number };
  access: { frame: number; offset: number; pageSize: number; phys: number };
}

export type TranslationExplainKey = keyof TranslationExplainParams;

export type TranslationExplanation = {
  [K in TranslationExplainKey]: { key: K; params: TranslationExplainParams[K] };
}[TranslationExplainKey];

export type TranslationStep = Step<TranslationState, TranslationExplanation>;
export type TranslationTrace = Trace<TranslationState, TranslationResult, TranslationExplanation>;
