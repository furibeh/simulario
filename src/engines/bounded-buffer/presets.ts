import type { BufferInput } from "./types";

export const presetIds = ["fastProducer", "swapped", "twoProducers"] as const;
export type PresetId = (typeof presetIds)[number];

/** Workloads from docs/lessons/mutex-semaforos.md. */
export const presets: Record<PresetId, BufferInput> = {
  /** "Productor rápido" / "Fast producer". */
  fastProducer: {
    producers: 1,
    consumers: 1,
    items: 3,
    capacity: 2,
    version: "correct",
    quantum: null,
  },
  /** "Orden invertido" / "Swapped order". */
  swapped: { producers: 1, consumers: 1, items: 3, capacity: 2, version: "swapped", quantum: null },
  /** "Dos productores" / "Two producers". */
  twoProducers: {
    producers: 2,
    consumers: 1,
    items: 2,
    capacity: 2,
    version: "correct",
    quantum: 1,
  },
};
