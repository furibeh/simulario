import type { PageEntry, TranslationInput } from "./types";

export const presetIds = ["walk", "fullMemory"] as const;
export type PresetId = (typeof presetIds)[number];

const f = (frame: number): PageEntry => ({ kind: "frame", frame });
const disk: PageEntry = { kind: "disk" };
const invalid: PageEntry = { kind: "invalid" };

/** Workloads from docs/lessons/paginacion.md. */
export const presets: Record<PresetId, TranslationInput> = {
  /** "Recorrido" / "Walkthrough". */
  walk: {
    pageSize: 16,
    pages: [f(2), f(0), disk, f(3), disk, invalid, invalid, disk],
    frames: 4,
    tlbSize: 2,
    accesses: [20, 25, 70, 23, 3, 90],
  },
  /** "Memoria llena" / "Full memory". */
  fullMemory: {
    pageSize: 16,
    pages: [f(0), f(1), f(2), disk, disk, invalid, invalid, invalid],
    frames: 3,
    tlbSize: 2,
    accesses: [5, 50, 18, 70, 2],
  },
};
