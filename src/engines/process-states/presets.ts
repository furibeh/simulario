import type { ProcessSpec } from "./types";

export const presetIds = ["diskWait", "allIo"] as const;
export type PresetId = (typeof presetIds)[number];

const make = (rows: readonly (readonly [number, ...number[]])[]): ProcessSpec[] =>
  rows.map(([arrival, ...bursts], i) => ({ id: `P${i + 1}`, arrival, bursts }));

/** Workloads from docs/lessons/procesos-estados.md. Rows: [arrival, ...bursts]. */
export const presets: Record<PresetId, readonly ProcessSpec[]> = {
  /** "Esperando al disco" / "Waiting for the disk". */
  diskWait: make([
    [0, 2, 3, 2],
    [0, 3],
    [1, 1, 2, 1],
  ]),
  /** "Todos en E/S" / "Everyone in I/O". */
  allIo: make([
    [0, 1, 4, 1],
    [0, 1, 3, 1],
  ]),
};
