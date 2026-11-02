/** Entity slots: shape + color identity. See docs/design.md, "Entities". */
export const SLOT_COUNT = 6;

export type Slot = 1 | 2 | 3 | 4 | 5 | 6;

/** 24×24 SVG paths, one per slot: circle, square, triangle, diamond, hexagon, pentagon. */
export const shapePaths: Record<Slot, string> = {
  1: "M12 2.5a9.5 9.5 0 1 0 0.01 0z",
  2: "M3.5 3.5h17v17h-17z",
  3: "M12 2.5l10 18.5H2z",
  4: "M12 1.5l10.5 10.5L12 22.5 1.5 12z",
  5: "M7 3h10l5 9-5 9H7l-5-9z",
  6: "M12 2l10 7.3-3.8 11.7H5.8L2 9.3z",
};

/** Slot for the entity at a zero-based index; a seventh entity reuses slot 1. */
export function slotForIndex(index: number): Slot {
  return ((((index % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT) + 1) as Slot;
}

/** Slot for ids like "P3" (1-based number at the end of the id). */
export function slotForId(id: string): Slot {
  const n = Number.parseInt(id.replace(/^\D+/, ""), 10);
  return slotForIndex(Number.isNaN(n) ? 0 : n - 1);
}
