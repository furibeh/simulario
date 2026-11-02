import { describe, expect, it } from "vitest";
import { slotForId, slotForIndex } from "./shapes";

describe("entity slots", () => {
  it("maps indexes to slots 1–6 and wraps after six", () => {
    expect([0, 1, 5, 6, 7].map(slotForIndex)).toEqual([1, 2, 6, 1, 2]);
  });

  it("reads the number at the end of an id", () => {
    expect(slotForId("P1")).toBe(1);
    expect(slotForId("P6")).toBe(6);
    expect(slotForId("T7")).toBe(1);
    expect(slotForId("x")).toBe(1);
  });
});
