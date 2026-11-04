import { describe, expect, it } from "vitest";
import { presets } from "./presets";
import { simulate } from "./simulate";
import type { FsExplanation, FsTrace, Operation } from "./types";

/**
 * Expected values are hand-computed in docs/lessons/inodos-enlaces.md ("Expected results").
 * Never regenerate them from the engine's output.
 */

function formatKey(e: FsExplanation): string {
  const p = e.params as Record<string, string | number>;
  const parts = Object.entries(p).map(([k, v]) => `${k}=${v}`);
  return parts.length > 0 ? `${e.key} ${parts.join(" ")}` : e.key;
}

const keys = (trace: FsTrace, step: number) =>
  trace.steps[step - 1]?.explain.map(formatKey).join("; ");

const dir = (trace: FsTrace, step: number) =>
  trace.steps[step - 1]?.state.entries.map((e) => `${e.name}→${e.inode}`).join(", ");

const inodesInUse = (trace: FsTrace, step: number) =>
  trace.steps[step - 1]?.state.inodes
    .flatMap((n) => (n ? [n.number === 0 ? "0" : `${n.number} (${n.links})`] : []))
    .join(", ");

const blocksInUse = (trace: FsTrace, step: number) =>
  trace.steps[step - 1]?.state.blocks.flatMap((b, i) => (b === null ? [] : [i])).join(", ");

describe("preset: links (Enlaces)", () => {
  const trace = simulate({ script: presets.links });

  it("matches the spec table step by step", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((s) => dir(trace, s))).toEqual([
      "notas.txt→1",
      "notas.txt→1",
      "notas.txt→1, copia.txt→1",
      "notas.txt→1, copia.txt→1, atajo→2",
      "copia.txt→1, atajo→2",
      "copia.txt→1, atajo→2",
      "copia.txt→1, atajo→2",
    ]);
    expect([1, 2, 3, 4, 5, 6, 7].map((s) => inodesInUse(trace, s))).toEqual([
      "0, 1 (1)",
      "0, 1 (1)",
      "0, 1 (2)",
      "0, 1 (2), 2 (1)",
      "0, 1 (1), 2 (1)",
      "0, 1 (1), 2 (1)",
      "0, 1 (1), 2 (1)",
    ]);
    expect([1, 2, 3, 4, 5].map((s) => blocksInUse(trace, s))).toEqual([
      "0",
      "0, 1, 2, 3",
      "0, 1, 2, 3",
      "0, 1, 2, 3",
      "0, 1, 2, 3",
    ]);
  });

  it("emits the keys of the spec", () => {
    expect(keys(trace, 1)).toBe("create name=notas.txt inode=1");
    expect(keys(trace, 2)).toBe("write name=notas.txt inode=1 size=10 blocks=1, 2, 3");
    expect(keys(trace, 3)).toBe("link name=copia.txt target=notas.txt inode=1 links=2");
    expect(keys(trace, 4)).toBe("symlink name=atajo target=notas.txt inode=2");
    expect(keys(trace, 5)).toBe("unlink.keep name=notas.txt inode=1 links=1");
    expect(keys(trace, 6)).toBe("cat name=copia.txt inode=1 content=hola mundo");
    expect(keys(trace, 7)).toBe("error.dangling name=atajo target=notas.txt");
  });

  it("stores blocks and the symlink target as the spec says", () => {
    expect(trace.steps[1]?.state.blocks.slice(1, 4)).toEqual(["hola", " mun", "do"]);
    expect(trace.steps[3]?.state.inodes[2]).toMatchObject({
      type: "symlink",
      size: 9,
      blocks: [],
      target: "notas.txt",
    });
    expect(trace.result.outputs).toEqual([
      { step: 5, kind: "content", content: "hola mundo" },
      { step: 6, kind: "error", content: "" },
    ]);
    expect(trace.result.errors).toEqual([6]);
  });
});

describe("preset: openFile (Archivo abierto)", () => {
  const trace = simulate({ script: presets.openFile });

  it("keeps an unlinked open file until close", () => {
    expect(keys(trace, 2)).toBe("write name=log.txt inode=1 size=5 blocks=1, 2");
    expect(trace.steps[1]?.state.blocks.slice(1, 3)).toEqual(["dato", "s"]);
    expect(keys(trace, 3)).toBe("open name=log.txt inode=1 fd=3");
    expect(keys(trace, 4)).toBe("unlink.orphan name=log.txt inode=1");
    expect(trace.steps[3]?.state.inodes[1]).toMatchObject({ links: 0, open: 1 });
    expect(blocksInUse(trace, 4)).toBe("0, 1, 2");
    expect(keys(trace, 5)).toBe("read fd=3 inode=1 content=datos");
    expect(keys(trace, 6)).toBe("close.free fd=3 inode=1 blocks=1, 2");
    expect(blocksInUse(trace, 6)).toBe("0");
    expect(trace.steps[5]?.state.inodes[1]).toBeNull();
    expect(keys(trace, 7)).toBe("create name=nuevo.txt inode=1");
  });
});

describe("experiment scripts", () => {
  const firstFive = presets.links.slice(0, 5);

  it("E2: the last name frees the inode and blocks", () => {
    const trace = simulate({ script: [...firstFive, { op: "unlink", name: "copia.txt" }] });
    expect(keys(trace, 6)).toBe("unlink.free name=copia.txt inode=1 blocks=1, 2, 3");
    expect(trace.result.inodesInUse).toEqual([0, 2]);
    expect(trace.result.blocksInUse).toEqual([0]);
  });

  it("E3: the symbolic link finds a new file with the same name", () => {
    const trace = simulate({
      script: [
        ...firstFive,
        { op: "create", name: "notas.txt" },
        { op: "write", name: "notas.txt", text: "otra" },
        { op: "cat", name: "atajo" },
      ],
    });
    expect(keys(trace, 6)).toBe("create name=notas.txt inode=3");
    expect(keys(trace, 7)).toBe("write name=notas.txt inode=3 size=4 blocks=4");
    expect(keys(trace, 8)).toBe("cat.via name=atajo target=notas.txt inode=3 content=otra");
  });

  it("E4: rename only changes the entry", () => {
    const trace = simulate({
      script: [...firstFive, { op: "rename", name: "copia.txt", to: "final.txt" }],
    });
    expect(dir(trace, 6)).toBe("final.txt→1, atajo→2");
    expect(trace.steps[5]?.state.inodes[1]?.blocks).toEqual([1, 2, 3]);
    expect(keys(trace, 6)).toBe("rename name=copia.txt to=final.txt inode=1");
  });
});

describe("edge cases", () => {
  it("overwrite frees the old blocks first", () => {
    const trace = simulate({
      script: [
        { op: "create", name: "a" },
        { op: "write", name: "a", text: "abcdefgh" },
        { op: "write", name: "a", text: "xy" },
      ],
    });
    expect(keys(trace, 2)).toBe("write name=a inode=1 size=8 blocks=1, 2");
    expect(keys(trace, 3)).toBe(
      "free.blocks inode=1 blocks=1, 2; write name=a inode=1 size=2 blocks=1",
    );
    expect(trace.steps[2]?.state.blocks[1]).toBe("xy");
  });

  it("an empty write uses no blocks", () => {
    const trace = simulate({
      script: [
        { op: "create", name: "a" },
        { op: "write", name: "a", text: "" },
      ],
    });
    expect(keys(trace, 2)).toBe("write name=a inode=1 size=0 blocks=");
    expect(trace.result.blocksInUse).toEqual([0]);
  });

  it("errors change nothing", () => {
    const trace = simulate({
      script: [
        { op: "create", name: "a" },
        { op: "create", name: "a" },
        { op: "read", fd: 4 },
        { op: "cat", name: "b" },
      ],
    });
    expect(keys(trace, 2)).toBe("error.exists name=a");
    expect(keys(trace, 3)).toBe("error.badFd fd=4");
    expect(keys(trace, 4)).toBe("error.missing name=b");
    expect(trace.result.inodesInUse).toEqual([0, 1]);
    expect(trace.result.errors).toEqual([1, 2, 3]);
  });

  it("runs out of inodes", () => {
    const script: Operation[] = "abcdefgh".split("").map((name) => ({ op: "create", name }));
    const trace = simulate({ script });
    expect(trace.result.inodesInUse).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(keys(trace, 8)).toBe("error.noInodes");
  });

  it("fills the directory", () => {
    const script: Operation[] = [
      { op: "create", name: "a" },
      ..."bcdefgh".split("").map((to) => ({ op: "link" as const, name: "a", to })),
      { op: "link", name: "a", to: "i" },
    ];
    const trace = simulate({ script });
    expect(trace.steps[7]?.state.entries).toHaveLength(8);
    expect(trace.steps[7]?.state.inodes[1]?.links).toBe(8);
    expect(keys(trace, 9)).toBe("error.dirFull name=i");
  });

  it("runs out of blocks", () => {
    const text = "123456789012";
    const script: Operation[] = ["a", "b", "c", "d"].flatMap((name) => [
      { op: "create" as const, name },
      { op: "write" as const, name, text },
    ]);
    const trace = simulate({ script });
    expect(keys(trace, 6)).toBe("write name=c inode=3 size=12 blocks=7, 8, 9");
    expect(keys(trace, 8)).toBe("error.noSpace name=d");
  });

  it("a hard link to a symbolic link keeps it alive", () => {
    const trace = simulate({
      script: [
        { op: "create", name: "a" },
        { op: "symlink", target: "a", name: "s" },
        { op: "link", name: "s", to: "t" },
        { op: "unlink", name: "s" },
        { op: "cat", name: "t" },
      ],
    });
    expect(keys(trace, 3)).toBe("link name=t target=s inode=2 links=2");
    expect(keys(trace, 4)).toBe("unlink.keep name=s inode=2 links=1");
    expect(keys(trace, 5)).toBe("cat.via name=t target=a inode=1 content=");
  });

  it("rejects invalid scripts", () => {
    expect(() => simulate({ script: [{ op: "create", name: "Notas" }] })).toThrow(RangeError);
    expect(() => simulate({ script: [{ op: "write", name: "a", text: "1234567890123" }] })).toThrow(
      RangeError,
    );
    expect(() => simulate({ script: [] })).toThrow(RangeError);
  });
});
