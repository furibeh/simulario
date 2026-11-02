import { describe, expect, it } from "vitest";
import { nextTheme, readTheme, writeTheme } from "./theme";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("theme preference", () => {
  it("cycles system → light → dark → system", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });

  it("round-trips through storage and clears for system", () => {
    const storage = memoryStorage();
    expect(readTheme(storage)).toBe("system");
    writeTheme(storage, "dark");
    expect(readTheme(storage)).toBe("dark");
    writeTheme(storage, "system");
    expect(storage.length).toBe(0);
  });

  it("falls back to system when storage throws or is missing", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readTheme(broken)).toBe("system");
    expect(readTheme(undefined)).toBe("system");
    expect(() =>
      writeTheme(
        {
          setItem: () => {
            throw new Error("blocked");
          },
          removeItem: () => {},
        },
        "dark",
      ),
    ).not.toThrow();
  });
});
