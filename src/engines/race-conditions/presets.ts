import type { RaceInput } from "./types";

export const presetIds = ["twoOnce", "threeTwice", "worstCase"] as const;
export type PresetId = (typeof presetIds)[number];

/** Workloads from docs/lessons/operating-systems/race-conditions.md. */
export const presets: Record<PresetId, RaceInput> = {
  /** "Dos incrementos" / "Two increments". */
  twoOnce: { threads: 2, increments: 1, atomic: false, schedule: { kind: "timer", quantum: 2 } },
  /** "Tres hilos" / "Three threads". */
  threeTwice: {
    threads: 3,
    increments: 2,
    atomic: false,
    schedule: { kind: "timer", quantum: 2 },
  },
  /** "Peor caso" / "Worst case": two threads, three increments each, counter ends at 2. */
  worstCase: {
    threads: 2,
    increments: 3,
    atomic: false,
    schedule: {
      kind: "manual",
      order: [
        "T1",
        ...Array<string>(6).fill("T2"),
        "T1",
        "T1",
        "T2",
        ...Array<string>(6).fill("T1"),
        "T2",
        "T2",
      ],
    },
  },
};
