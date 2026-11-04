import { describe, expect, it } from "vitest";
import { presets } from "../../engines/file-system/presets";
import { simulate } from "../../engines/file-system/simulate";
import type { FsExplainParams, FsExplanation, Operation } from "../../engines/file-system/types";
import { fileSystemEn } from "./file-system.en";
import { fileSystemEs } from "./file-system.es";
import { type ExplainTemplates, renderExplanation } from "./types";

const locales: Record<string, ExplainTemplates<FsExplainParams>> = {
  es: fileSystemEs,
  en: fileSystemEn,
};

const firstFive = presets.links.slice(0, 5);
const scripts: Operation[][] = [
  [...presets.links],
  [...presets.openFile],
  [...firstFive, { op: "unlink", name: "copia.txt" }, { op: "unlink", name: "atajo" }],
  [
    ...firstFive,
    { op: "create", name: "notas.txt" },
    { op: "write", name: "notas.txt", text: "otra" },
    { op: "cat", name: "atajo" },
    { op: "rename", name: "copia.txt", to: "final.txt" },
    { op: "open", name: "final.txt" },
    { op: "close", fd: 3 },
    { op: "write", name: "final.txt", text: "" },
  ],
  [
    { op: "create", name: "a" },
    { op: "create", name: "a" },
    { op: "close", fd: 4 },
    { op: "cat", name: "z" },
    { op: "write", name: "a", text: "123456789012" },
    { op: "create", name: "b" },
    { op: "write", name: "b", text: "123456789012" },
    { op: "create", name: "c" },
    { op: "write", name: "c", text: "123456789012" },
    { op: "create", name: "d" },
    { op: "write", name: "d", text: "123456789012" },
  ],
  "abcdefgh".split("").map((name) => ({ op: "create", name })),
  [
    { op: "symlink", target: "b", name: "a" },
    { op: "symlink", target: "a", name: "b" },
    { op: "cat", name: "a" },
  ],
  [
    { op: "create", name: "a" },
    ..."bcdefgh".split("").map((to) => ({ op: "link" as const, name: "a", to })),
    { op: "link", name: "a", to: "i" },
  ],
];

describe("file-system explanation templates", () => {
  it("render every explanation without placeholders", () => {
    const seen = new Set<string>();
    for (const script of scripts) {
      for (const step of simulate({ script }).steps) {
        for (const explanation of step.explain) {
          seen.add(explanation.key);
          for (const templates of Object.values(locales)) {
            const text = renderExplanation(templates, explanation);
            expect(text.trim()).not.toBe("");
            expect(text).not.toMatch(/undefined|NaN|null|\$\{|\{\w+\}/);
          }
        }
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(fileSystemEs).sort());
  });

  it("renders the spec examples", () => {
    const examples: [FsExplanation, string, string][] = [
      [
        { key: "write", params: { name: "notas.txt", inode: 1, size: 10, blocks: "1, 2, 3" } },
        "notas.txt (inodo 1) ahora tiene 10 bytes en los bloques 1, 2, 3.",
        "notas.txt (inode 1) now holds 10 bytes in blocks 1, 2, 3.",
      ],
      [
        { key: "link", params: { name: "copia.txt", target: "notas.txt", inode: 1, links: 2 } },
        "copia.txt es otro nombre para el inodo 1, el mismo de notas.txt. Su contador de enlaces sube a 2. No se copia ningún dato.",
        "copia.txt is another name for inode 1, the same as notas.txt. Its link count rises to 2. No data is copied.",
      ],
      [
        { key: "unlink.keep", params: { name: "notas.txt", inode: 1, links: 1 } },
        "Se borra la entrada notas.txt. El inodo 1 sigue vivo: le queda 1 enlace.",
        "The entry notas.txt is removed. Inode 1 lives on: 1 link left.",
      ],
      [
        { key: "unlink.free", params: { name: "copia.txt", inode: 1, blocks: "1, 2, 3" } },
        "Se borra la entrada copia.txt. El inodo 1 ya no tiene nombres ni está abierto: se liberan el inodo y los bloques 1, 2, 3.",
        "The entry copia.txt is removed. Inode 1 has no names and is not open: the inode and blocks 1, 2, 3 are freed.",
      ],
      [
        { key: "cat", params: { name: "copia.txt", inode: 1, content: "hola mundo" } },
        "cat copia.txt sigue el nombre hasta el inodo 1 y lee «hola mundo».",
        'cat copia.txt follows the name to inode 1 and reads "hola mundo".',
      ],
      [
        { key: "cat", params: { name: "a", inode: 1, content: "" } },
        "cat a sigue el nombre hasta el inodo 1 y lee un archivo vacío.",
        "cat a follows the name to inode 1 and reads an empty file.",
      ],
      [
        { key: "error.dangling", params: { name: "atajo", target: "notas.txt" } },
        "Error: atajo lleva al nombre notas.txt, pero ese nombre ya no existe. Es un enlace colgante.",
        "Error: atajo leads to the name notas.txt, but that name no longer exists. It is a dangling link.",
      ],
    ];
    for (const [explanation, es, en] of examples) {
      expect(renderExplanation(fileSystemEs, explanation)).toBe(es);
      expect(renderExplanation(fileSystemEn, explanation)).toBe(en);
    }
  });
});
