export const presetIds = ["belady", "classic"] as const;
export type PresetId = (typeof presetIds)[number];

/** Reference strings from docs/lessons/operating-systems/page-replacement.md. */
export const presets: Record<PresetId, readonly number[]> = {
  /** "Belady": FIFO faults more with 4 frames than with 3. */
  belady: [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5],
  /** "Clásica" / "Classic": the string from Silberschatz, Galvin and Gagne, §10.4. */
  classic: [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1],
};
