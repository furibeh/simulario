import type { Step, Trace } from "../trace";

export const limits = {
  items: { min: 1, max: 3 },
  transactions: { min: 2, max: 3 },
  script: { min: 1, max: 6 },
  value: { min: 0, max: 999 },
  delta: { min: -999, max: 999 },
  order: { min: 0, max: 30 },
} as const;

/** Item ids by position: items[0] is x. */
export const itemIds = ["x", "y", "z"] as const;
export type ItemId = (typeof itemIds)[number];

/**
 * Levels and their rules: docs/engines/transactions.md.
 */
export const isolationLevels = [
  "read-uncommitted",
  "read-committed",
  "serializable-2pl",
  "snapshot",
] as const;
export type Isolation = (typeof isolationLevels)[number];

export type Operation =
  /** SELECT value WHERE id = item */
  | { op: "read"; item: ItemId }
  /** SELECT … FOR UPDATE: takes the write lock, then reads. */
  | { op: "readForUpdate"; item: ItemId }
  /** UPDATE … SET value = v, v computed by the application. */
  | { op: "write"; item: ItemId; value: number }
  /** UPDATE … SET value = r + d, r the value this transaction read last. */
  | { op: "writeFromRead"; item: ItemId; delta: number }
  /** UPDATE … SET value = value + d, computed inside the database. */
  | { op: "add"; item: ItemId; delta: number }
  /** The application checks that the values it last read of `items` add up to at least `atLeast`; if not, it rolls back. */
  | { op: "check"; items: readonly ItemId[]; atLeast: number }
  | { op: "commit" }
  | { op: "abort" };

export interface TxInput {
  /** Initial committed values, ids x, y, z by position. */
  items: readonly number[];
  /** Scripts of T1…Tn. */
  transactions: readonly (readonly Operation[])[];
  isolation: Isolation;
  /** One transaction id per step. */
  order: readonly string[];
}

/** "init" for an item's initial value, otherwise "w<step>" for the write that made it. */
export type VersionId = string;

export type ReadKind = "committed" | "dirty" | "own";

export interface ItemView {
  id: ItemId;
  committed: number;
  version: VersionId;
  /** Transaction that committed the current value; null for the initial value. */
  committedBy: string | null;
  /** Uncommitted value, at most one (write locks forbid a second writer). */
  pending: { tx: string; value: number } | null;
  /** Exclusive (write) lock holder. */
  holder: string | null;
  /** Shared (read) lock holders in id order; only under serializable-2pl. */
  readers: readonly string[];
  /** Committed versions, oldest first; `step` is the commit step (null for the initial value). */
  versions: readonly { value: number; by: string | null; step: number | null }[];
  /** Transactions waiting for the lock, first served first. */
  queue: readonly string[];
}

export interface LastRead {
  item: ItemId;
  value: number;
  version: VersionId;
  kind: ReadKind;
}

export interface TxView {
  id: string;
  status: "active" | "blocked" | "committed" | "aborted";
  /**
   * Index of the next operation; script.length once committed or rolled back. A deadlock victim
   * keeps the index of the operation it was waiting for: it and the ones after it never ran.
   */
  pc: number;
  waitsFor: ItemId | null;
  /** Step of its first operation (its snapshot under `snapshot`); null before it runs. */
  start: number | null;
  /** What it read last from each item, in item order. */
  lastReads: readonly LastRead[];
}

/** State after the step. */
export interface TxState {
  items: readonly ItemView[];
  transactions: readonly TxView[];
  /** Transaction named by the order at this step. */
  ran: string;
}

export interface ReadRecord {
  step: number;
  tx: string;
  item: ItemId;
  value: number;
  kind: ReadKind;
  /** Committed value of the item at that moment. */
  committed: number;
  /** Writer of the uncommitted value read (dirty reads only). */
  writer: string | null;
}

export interface WriteRecord {
  step: number;
  tx: string;
  item: ItemId;
  value: number;
  stale: boolean;
}

export interface BlockRecord {
  step: number;
  tx: string;
  item: ItemId;
  /** The exclusive holder, or the shared holders joined by ", " for a wait on readers. */
  holder: string;
}

export interface DeadlockRecord {
  step: number;
  victim: string;
  path: string;
}

export interface Segment {
  id: string;
  start: number;
  end: number;
}

export interface TxResult {
  /** Committed value per item, in item order. */
  final: readonly number[];
  committed: readonly string[];
  aborted: readonly string[];
  /** true when every transaction committed or aborted. */
  complete: boolean;
  steps: number;
  reads: readonly ReadRecord[];
  writes: readonly WriteRecord[];
  /** Stale writes whose transaction committed. */
  lostUpdates: number;
  dirtyReads: number;
  /** Dirty reads whose writer later aborted. */
  dirtyAborted: number;
  /** Reads that returned a different version than the same transaction's previous read. */
  nonRepeatable: number;
  blocks: readonly BlockRecord[];
  deadlocks: readonly DeadlockRecord[];
  segments: readonly Segment[];
}

/** Explanation keys and their params. Templates live in src/i18n/engines/transactions.<lang>.ts. */
export interface TxExplainParams {
  read: { tx: string; item: string; value: number };
  "read.hidden": { tx: string; item: string; value: number; writer: string; pending: number };
  "read.dirty": { tx: string; item: string; value: number; writer: string };
  "read.own": { tx: string; item: string; value: number };
  "read.changed": { tx: string; item: string; before: number; value: number };
  "read.lock": { tx: string; item: string; value: number };
  write: { tx: string; item: string; value: number };
  "write.computed": { tx: string; item: string; value: number; read: number; delta: number };
  "write.stale": { tx: string; item: string; read: number; current: number; by: string };
  add: { tx: string; item: string; before: number; delta: number; value: number };
  "lock.wait": { tx: string; item: string; holder: string };
  "read.shared": { tx: string; item: string; value: number };
  "lock.wait.shared": { tx: string; item: string; holders: string };
  "lock.upgrade": { tx: string; item: string };
  snapshot: { tx: string };
  "read.old": { tx: string; item: string; value: number; current: number; by: string };
  serialization: { tx: string; item: string; by: string };
  "check.pass": { tx: string; sum: number; atLeast: number };
  "check.fail": { tx: string; sum: number; atLeast: number };
  handoff: { tx: string; item: string; to: string };
  commit: { tx: string };
  abort: { tx: string };
  deadlock: { tx: string; path: string };
}

export type TxExplainKey = keyof TxExplainParams;

export type TxExplanation = {
  [K in TxExplainKey]: { key: K; params: TxExplainParams[K] };
}[TxExplainKey];

export type TxStep = Step<TxState, TxExplanation>;
export type TxTrace = Trace<TxState, TxResult, TxExplanation>;
