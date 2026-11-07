import type { Operation, TxInput } from "./types";

export const presetIds = ["balance", "dirtyRead", "transfer", "crossTransfers", "onCall"] as const;
export type PresetId = (typeof presetIds)[number];

/** Workloads from docs/lessons/databases/isolation-anomalies.md. */
export const presets: Record<PresetId, TxInput> = {
  /** "Saldo" / "Balance": two deposits computed in the application. */
  balance: {
    items: [100],
    transactions: [
      [{ op: "read", item: "x" }, { op: "writeFromRead", item: "x", delta: 50 }, { op: "commit" }],
      [{ op: "read", item: "x" }, { op: "writeFromRead", item: "x", delta: 20 }, { op: "commit" }],
    ],
    isolation: "read-committed",
    order: ["T1", "T2", "T1", "T1", "T2", "T2"],
  },
  /** "Lectura sucia" / "Dirty read": T1 writes and rolls back while T2 reads. */
  dirtyRead: {
    items: [100],
    transactions: [
      [{ op: "write", item: "x", value: 150 }, { op: "abort" }],
      [{ op: "read", item: "x" }, { op: "commit" }],
    ],
    isolation: "read-uncommitted",
    order: ["T1", "T2", "T1", "T2"],
  },
  /** "Transferencia" / "Transfer": a report reads two accounts while 40 moves between them. */
  transfer: {
    items: [50, 50],
    transactions: [
      [{ op: "read", item: "x" }, { op: "read", item: "y" }, { op: "commit" }],
      [
        { op: "read", item: "x" },
        { op: "writeFromRead", item: "x", delta: -40 },
        { op: "read", item: "y" },
        { op: "writeFromRead", item: "y", delta: 40 },
        { op: "commit" },
      ],
    ],
    isolation: "read-committed",
    order: ["T1", "T2", "T2", "T2", "T2", "T2", "T1", "T1"],
  },
  /** "Transferencias cruzadas" / "Crossed transfers" (docs/lessons/databases/two-phase-locking.md). */
  crossTransfers: {
    items: [100, 100],
    transactions: [
      [
        { op: "read", item: "x" },
        { op: "writeFromRead", item: "x", delta: -10 },
        { op: "read", item: "y" },
        { op: "writeFromRead", item: "y", delta: 10 },
        { op: "commit" },
      ],
      [
        { op: "read", item: "y" },
        { op: "writeFromRead", item: "y", delta: -10 },
        { op: "read", item: "x" },
        { op: "writeFromRead", item: "x", delta: 10 },
        { op: "commit" },
      ],
    ],
    isolation: "serializable-2pl",
    order: ["T1", "T2", "T1", "T2", "T1", "T2", "T1", "T1"],
  },
  /** "Guardia" / "On call": two doctors, at least one must stay (docs/lessons/databases/mvcc-snapshots.md). */
  onCall: {
    items: [1, 1],
    transactions: [
      [
        { op: "read", item: "x" },
        { op: "read", item: "y" },
        { op: "check", items: ["x", "y"], atLeast: 2 },
        { op: "write", item: "x", value: 0 },
        { op: "commit" },
      ],
      [
        { op: "read", item: "x" },
        { op: "read", item: "y" },
        { op: "check", items: ["x", "y"], atLeast: 2 },
        { op: "write", item: "y", value: 0 },
        { op: "commit" },
      ],
    ],
    isolation: "snapshot",
    order: ["T1", "T1", "T2", "T2", "T1", "T2", "T1", "T2", "T1", "T2"],
  },
};

/**
 * The fixes of Experiment E4: each script of `balance` rewritten so the database computes from
 * the newest committed value ("atomic") or the read takes the write lock ("forUpdate").
 */
export function fixBalance(fix: "atomic" | "forUpdate"): readonly (readonly Operation[])[] {
  return [50, 20].map((delta): Operation[] =>
    fix === "atomic"
      ? [{ op: "add", item: "x", delta }, { op: "commit" }]
      : [
          { op: "readForUpdate", item: "x" },
          { op: "writeFromRead", item: "x", delta },
          { op: "commit" },
        ],
  );
}
