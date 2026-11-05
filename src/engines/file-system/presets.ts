import type { Operation } from "./types";

export const presetIds = ["links", "openFile"] as const;
export type PresetId = (typeof presetIds)[number];

/** Scripts from docs/lessons/inodes-links.md. */
export const presets: Record<PresetId, readonly Operation[]> = {
  /** "Enlaces" / "Links". */
  links: [
    { op: "create", name: "notas.txt" },
    { op: "write", name: "notas.txt", text: "hola mundo" },
    { op: "link", name: "notas.txt", to: "copia.txt" },
    { op: "symlink", target: "notas.txt", name: "atajo" },
    { op: "unlink", name: "notas.txt" },
    { op: "cat", name: "copia.txt" },
    { op: "cat", name: "atajo" },
  ],
  /** "Archivo abierto" / "Open file". */
  openFile: [
    { op: "create", name: "log.txt" },
    { op: "write", name: "log.txt", text: "datos" },
    { op: "open", name: "log.txt" },
    { op: "unlink", name: "log.txt" },
    { op: "read", fd: 3 },
    { op: "close", fd: 3 },
    { op: "create", name: "nuevo.txt" },
  ],
};
