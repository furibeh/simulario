import {
  type Entry,
  type FdView,
  type FsExplanation,
  type FsInput,
  type FsResult,
  type FsStep,
  type FsTrace,
  geometry,
  type InodeView,
  limits,
  type Operation,
  type Output,
} from "./types";

type Inode = { -readonly [K in keyof InodeView]: InodeView[K] } & { blocks: number[] };

const names = (op: Operation): string[] => {
  switch (op.op) {
    case "link":
    case "rename":
      return [op.name, op.to];
    case "symlink":
      return [op.target, op.name];
    case "close":
    case "read":
      return [];
    default:
      return [op.name];
  }
};

/** Throws a RangeError describing the first invalid operation. Rules: docs/lessons/inodos-enlaces.md. */
export function assertValidInput(input: FsInput): void {
  const { script } = input;
  if (script.length < limits.script.min || script.length > limits.script.max) {
    throw new RangeError("Invalid script length");
  }
  script.forEach((op, i) => {
    for (const n of names(op)) {
      if (!limits.name.test(n)) throw new RangeError(`Step ${i + 1}: invalid name "${n}"`);
    }
    if (op.op === "write" && op.text.length > limits.text) {
      throw new RangeError(`Step ${i + 1}: text too long`);
    }
    if ((op.op === "close" || op.op === "read") && !Number.isInteger(op.fd)) {
      throw new RangeError(`Step ${i + 1}: invalid descriptor`);
    }
  });
}

const list = (blocks: readonly number[]) => blocks.join(", ");

/** Simulates a tiny one-directory file system, one operation per step. Pure. */
export function simulate(input: FsInput): FsTrace {
  assertValidInput(input);
  const inodes: (Inode | null)[] = Array.from({ length: geometry.inodes }, () => null);
  inodes[0] = { number: 0, type: "dir", links: 2, open: 0, size: 0, blocks: [0], target: null };
  const blocks: (string | null)[] = Array.from({ length: geometry.blocks }, () => null);
  let entries: Entry[] = [];
  let fds: FdView[] = [];
  const steps: FsStep[] = [];
  const outputs: Output[] = [];
  const errors: number[] = [];

  const lookup = (name: string) => entries.find((e) => e.name === name);
  const freeInode = () => inodes.indexOf(null);
  const content = (node: Inode) => node.blocks.map((b) => blocks[b] ?? "").join("");
  const release = (node: Inode) => {
    for (const b of node.blocks) blocks[b] = null;
    inodes[node.number] = null;
  };

  /** Follows symbolic links from a name. */
  function resolve(
    name: string,
  ): { ok: true; node: Inode; via: string | null } | { ok: false; error: FsExplanation } {
    let current = name;
    let via: string | null = null;
    for (let hop = 0; hop <= geometry.maxHops; hop++) {
      const entry = lookup(current);
      if (!entry) {
        return via === null
          ? { ok: false, error: { key: "error.missing", params: { name } } }
          : { ok: false, error: { key: "error.dangling", params: { name, target: current } } };
      }
      const node = inodes[entry.inode] as Inode;
      if (node.type !== "symlink") return { ok: true, node, via };
      via = node.target;
      current = node.target ?? "";
    }
    return { ok: false, error: { key: "error.dangling", params: { name, target: current } } };
  }

  input.script.forEach((op, t) => {
    const explain: FsExplanation[] = [];
    const touched = { inodes: [] as number[], blocks: [] as number[], names: [] as string[] };
    const fail = (e: FsExplanation) => {
      explain.push(e);
      errors.push(t);
      if (op.op === "cat" || op.op === "read")
        outputs.push({ step: t, kind: "error", content: "" });
    };

    switch (op.op) {
      case "create": {
        const n = freeInode();
        if (lookup(op.name)) fail({ key: "error.exists", params: { name: op.name } });
        else if (entries.length >= geometry.entries) {
          fail({ key: "error.dirFull", params: { name: op.name } });
        } else if (n < 0) fail({ key: "error.noInodes", params: {} });
        else {
          inodes[n] = {
            number: n,
            type: "file",
            links: 1,
            open: 0,
            size: 0,
            blocks: [],
            target: null,
          };
          entries = [...entries, { name: op.name, inode: n }];
          touched.inodes.push(n);
          touched.names.push(op.name);
          explain.push({ key: "create", params: { name: op.name, inode: n } });
        }
        break;
      }
      case "write": {
        const r = resolve(op.name);
        if (!r.ok) {
          fail(r.error);
          break;
        }
        const node = r.node;
        const needed = Math.ceil(op.text.length / geometry.blockSize);
        const free = blocks.flatMap((b, i) => (b === null && i > 0 ? [i] : []));
        if (free.length + node.blocks.length < needed) {
          fail({ key: "error.noSpace", params: { name: op.name } });
          break;
        }
        if (node.blocks.length > 0) {
          explain.push({
            key: "free.blocks",
            params: { inode: node.number, blocks: list(node.blocks) },
          });
          for (const b of node.blocks) blocks[b] = null;
        }
        const chosen = blocks.flatMap((b, i) => (b === null && i > 0 ? [i] : [])).slice(0, needed);
        chosen.forEach((b, k) => {
          blocks[b] = op.text.slice(k * geometry.blockSize, (k + 1) * geometry.blockSize);
        });
        node.blocks = chosen;
        node.size = op.text.length;
        touched.inodes.push(node.number);
        touched.blocks.push(...chosen);
        explain.push({
          key: "write",
          params: { name: op.name, inode: node.number, size: node.size, blocks: list(chosen) },
        });
        break;
      }
      case "link": {
        const source = lookup(op.name);
        if (!source) fail({ key: "error.missing", params: { name: op.name } });
        else if (lookup(op.to)) fail({ key: "error.exists", params: { name: op.to } });
        else if (entries.length >= geometry.entries) {
          fail({ key: "error.dirFull", params: { name: op.to } });
        } else {
          const node = inodes[source.inode] as Inode;
          node.links += 1;
          entries = [...entries, { name: op.to, inode: node.number }];
          touched.inodes.push(node.number);
          touched.names.push(op.to);
          explain.push({
            key: "link",
            params: { name: op.to, target: op.name, inode: node.number, links: node.links },
          });
        }
        break;
      }
      case "symlink": {
        const n = freeInode();
        if (lookup(op.name)) fail({ key: "error.exists", params: { name: op.name } });
        else if (entries.length >= geometry.entries) {
          fail({ key: "error.dirFull", params: { name: op.name } });
        } else if (n < 0) fail({ key: "error.noInodes", params: {} });
        else {
          inodes[n] = {
            number: n,
            type: "symlink",
            links: 1,
            open: 0,
            size: op.target.length,
            blocks: [],
            target: op.target,
          };
          entries = [...entries, { name: op.name, inode: n }];
          touched.inodes.push(n);
          touched.names.push(op.name);
          explain.push({ key: "symlink", params: { name: op.name, target: op.target, inode: n } });
        }
        break;
      }
      case "unlink": {
        const entry = lookup(op.name);
        if (!entry) {
          fail({ key: "error.missing", params: { name: op.name } });
          break;
        }
        entries = entries.filter((e) => e !== entry);
        const node = inodes[entry.inode] as Inode;
        node.links -= 1;
        touched.inodes.push(node.number);
        if (node.type === "symlink") {
          release(node);
          explain.push({ key: "unlink.symlink", params: { name: op.name, inode: node.number } });
        } else if (node.links > 0) {
          explain.push({
            key: "unlink.keep",
            params: { name: op.name, inode: node.number, links: node.links },
          });
        } else if (node.open > 0) {
          explain.push({ key: "unlink.orphan", params: { name: op.name, inode: node.number } });
        } else {
          touched.blocks.push(...node.blocks);
          explain.push({
            key: "unlink.free",
            params: { name: op.name, inode: node.number, blocks: list(node.blocks) },
          });
          release(node);
        }
        break;
      }
      case "open": {
        const r = resolve(op.name);
        if (!r.ok) {
          fail(r.error);
          break;
        }
        let fd = geometry.firstFd;
        while (fds.some((f) => f.fd === fd)) fd++;
        if (fd > geometry.lastFd) {
          fail({ key: "error.badFd", params: { fd } });
          break;
        }
        r.node.open += 1;
        fds = [...fds, { fd, inode: r.node.number }].sort((a, b) => a.fd - b.fd);
        touched.inodes.push(r.node.number);
        explain.push({ key: "open", params: { name: op.name, inode: r.node.number, fd } });
        break;
      }
      case "close": {
        const handle = fds.find((f) => f.fd === op.fd);
        if (!handle) {
          fail({ key: "error.badFd", params: { fd: op.fd } });
          break;
        }
        fds = fds.filter((f) => f !== handle);
        const node = inodes[handle.inode] as Inode;
        node.open -= 1;
        touched.inodes.push(node.number);
        if (node.links === 0 && node.open === 0) {
          touched.blocks.push(...node.blocks);
          explain.push({
            key: "close.free",
            params: { fd: op.fd, inode: node.number, blocks: list(node.blocks) },
          });
          release(node);
        } else {
          explain.push({ key: "close.keep", params: { fd: op.fd, inode: node.number } });
        }
        break;
      }
      case "cat": {
        const r = resolve(op.name);
        if (!r.ok) {
          fail(r.error);
          break;
        }
        const text = content(r.node);
        outputs.push({ step: t, kind: "content", content: text });
        touched.inodes.push(r.node.number);
        touched.blocks.push(...r.node.blocks);
        explain.push(
          r.via === null
            ? { key: "cat", params: { name: op.name, inode: r.node.number, content: text } }
            : {
                key: "cat.via",
                params: { name: op.name, target: r.via, inode: r.node.number, content: text },
              },
        );
        break;
      }
      case "read": {
        const handle = fds.find((f) => f.fd === op.fd);
        if (!handle) {
          fail({ key: "error.badFd", params: { fd: op.fd } });
          break;
        }
        const node = inodes[handle.inode] as Inode;
        const text = content(node);
        outputs.push({ step: t, kind: "content", content: text });
        touched.inodes.push(node.number);
        touched.blocks.push(...node.blocks);
        explain.push({ key: "read", params: { fd: op.fd, inode: node.number, content: text } });
        break;
      }
      case "rename": {
        const entry = lookup(op.name);
        if (!entry) fail({ key: "error.missing", params: { name: op.name } });
        else if (lookup(op.to)) fail({ key: "error.exists", params: { name: op.to } });
        else {
          entries = entries.map((e) => (e === entry ? { name: op.to, inode: e.inode } : e));
          touched.names.push(op.to);
          explain.push({ key: "rename", params: { name: op.name, to: op.to, inode: entry.inode } });
        }
        break;
      }
    }

    blocks[0] = entries.map((e) => `${e.name}:${e.inode}`).join(" ");
    steps.push({
      t,
      state: {
        inodes: inodes.map((n) => (n ? { ...n, blocks: [...n.blocks] } : null)),
        blocks: [...blocks],
        entries: [...entries],
        fds: [...fds],
        touched,
      },
      explain,
    });
  });

  const result: FsResult = {
    outputs,
    errors,
    inodesInUse: inodes.flatMap((n, i) => (n ? [i] : [])),
    blocksInUse: blocks.flatMap((b, i) => (b !== null ? [i] : [])),
    entries,
  };
  return { steps, result };
}
