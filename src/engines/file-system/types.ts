import type { Step, Trace } from "../trace";

/** Fixed geometry from docs/lessons/inodos-enlaces.md. */
export const geometry = {
  inodes: 8,
  blocks: 12,
  blockSize: 4,
  entries: 8,
  maxHops: 4,
  firstFd: 3,
  lastFd: 9,
} as const;

export const limits = {
  script: { min: 1, max: 12 },
  name: /^[a-z0-9._-]{1,12}$/,
  text: 12,
} as const;

export type Operation =
  | { op: "create"; name: string }
  | { op: "write"; name: string; text: string }
  | { op: "link"; name: string; to: string }
  | { op: "symlink"; target: string; name: string }
  | { op: "unlink"; name: string }
  | { op: "open"; name: string }
  | { op: "close"; fd: number }
  | { op: "cat"; name: string }
  | { op: "read"; fd: number }
  | { op: "rename"; name: string; to: string };

export type OpName = Operation["op"];

export interface FsInput {
  script: readonly Operation[];
}

export interface InodeView {
  number: number;
  type: "dir" | "file" | "symlink";
  links: number;
  open: number;
  size: number;
  blocks: readonly number[];
  /** Symbolic links only. */
  target: string | null;
}

export interface Entry {
  name: string;
  inode: number;
}

export interface FdView {
  fd: number;
  inode: number;
}

/** State after the operation of the step. */
export interface FsState {
  /** Indexed by inode number; null when free. */
  inodes: readonly (InodeView | null)[];
  /** Indexed by block number; null when free. Block 0 holds the root directory. */
  blocks: readonly (string | null)[];
  /** Root directory entries, in creation order. */
  entries: readonly Entry[];
  fds: readonly FdView[];
  /** What the step touched, for highlighting. */
  touched: { inodes: readonly number[]; blocks: readonly number[]; names: readonly string[] };
}

export interface Output {
  step: number;
  kind: "content" | "error";
  content: string;
}

export interface FsResult {
  outputs: readonly Output[];
  /** Steps whose operation failed. */
  errors: readonly number[];
  inodesInUse: readonly number[];
  blocksInUse: readonly number[];
  entries: readonly Entry[];
}

/** Explanation keys and their params. Templates live in src/i18n/engines/file-system.<lang>.ts. */
export interface FsExplainParams {
  create: { name: string; inode: number };
  "free.blocks": { inode: number; blocks: string };
  write: { name: string; inode: number; size: number; blocks: string };
  link: { name: string; target: string; inode: number; links: number };
  symlink: { name: string; target: string; inode: number };
  "unlink.keep": { name: string; inode: number; links: number };
  "unlink.orphan": { name: string; inode: number };
  "unlink.free": { name: string; inode: number; blocks: string };
  "unlink.symlink": { name: string; inode: number };
  open: { name: string; inode: number; fd: number };
  "close.keep": { fd: number; inode: number };
  "close.free": { fd: number; inode: number; blocks: string };
  cat: { name: string; inode: number; content: string };
  "cat.via": { name: string; target: string; inode: number; content: string };
  read: { fd: number; inode: number; content: string };
  rename: { name: string; to: string; inode: number };
  "error.exists": { name: string };
  "error.missing": { name: string };
  "error.dangling": { name: string; target: string };
  "error.loop": { name: string; hops: number };
  "error.noInodes": Record<string, never>;
  "error.noSpace": { name: string };
  "error.dirFull": { name: string };
  "error.badFd": { fd: number };
}

export type FsExplainKey = keyof FsExplainParams;

export type FsExplanation = {
  [K in FsExplainKey]: { key: K; params: FsExplainParams[K] };
}[FsExplainKey];

export type FsStep = Step<FsState, FsExplanation>;
export type FsTrace = Trace<FsState, FsResult, FsExplanation>;
