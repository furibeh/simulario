import type { ProcessSpec } from "./types";

export const presetIds = ["convoy", "staggered", "similar"] as const;
export type PresetId = (typeof presetIds)[number];

const make = (rows: readonly (readonly [number, number, number])[]): ProcessSpec[] =>
  rows.map(([arrival, burst, priority], i) => ({ id: `P${i + 1}`, arrival, burst, priority }));

/** Workloads from docs/lessons/operating-systems/cpu-scheduling.md. Rows: [arrival, burst, priority]. */
export const presets: Record<PresetId, readonly ProcessSpec[]> = {
  convoy: make([
    [0, 10, 3],
    [1, 2, 1],
    [2, 1, 2],
    [3, 3, 2],
  ]),
  staggered: make([
    [0, 6, 3],
    [2, 4, 1],
    [4, 2, 4],
    [6, 5, 2],
    [8, 1, 1],
  ]),
  similar: make([
    [0, 4, 2],
    [0, 5, 1],
    [1, 4, 3],
    [2, 5, 2],
  ]),
};
