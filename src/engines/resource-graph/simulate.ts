import {
  type Block,
  type GraphExplanation,
  type GraphInput,
  type GraphResult,
  type GraphStep,
  type GraphTrace,
  limits,
  type Operation,
  type ProgramOp,
  type Segment,
} from "./types";

interface Thread {
  id: string;
  program: ProgramOp[];
  pc: number;
  status: "ready" | "blocked" | "done";
  waitsFor: number | null;
}

const inRange = (v: number, r: { min: number; max: number }) =>
  Number.isInteger(v) && v >= r.min && v <= r.max;

const rid = (n: number) => `R${n}`;

/** With a global order, the k-th acquire takes the k-th smallest resource the script acquires. */
export function effectiveScript(
  script: readonly Operation[],
  ordering: GraphInput["ordering"],
): Operation[] {
  if (ordering === "script") return [...script];
  const sorted = script.flatMap((o) => (o.op === "acquire" ? [o.res] : [])).sort((a, b) => a - b);
  let k = 0;
  return script.map((o) => (o.op === "acquire" ? { op: "acquire", res: sorted[k++] ?? o.res } : o));
}

/** Throws a RangeError describing the first invalid field. Rules: docs/lessons/interbloqueo.md. */
export function assertValidInput(input: GraphInput): void {
  if (!inRange(input.resources, limits.resources)) throw new RangeError("Invalid resources");
  if (!inRange(input.threads.length, limits.threads)) throw new RangeError("Invalid threads");
  input.threads.forEach((th, i) => {
    const id = `T${i + 1}`;
    if (!inRange(th.delay, limits.delay)) throw new RangeError(`${id}: invalid delay`);
    if (!inRange(th.script.length, limits.script)) throw new RangeError(`${id}: invalid script`);
    const held = new Set<number>();
    for (const o of effectiveScript(th.script, input.ordering)) {
      if (o.op === "work") continue;
      if (!inRange(o.res, { min: 1, max: input.resources })) {
        throw new RangeError(`${id}: unknown resource ${o.res}`);
      }
      if (o.op === "acquire") {
        if (held.has(o.res)) throw new RangeError(`${id}: acquires R${o.res} twice`);
        held.add(o.res);
      } else {
        if (!held.has(o.res)) throw new RangeError(`${id}: releases R${o.res} without holding it`);
        held.delete(o.res);
      }
    }
    if (held.size > 0) throw new RangeError(`${id}: ends holding resources`);
  });
}

/** Simulates threads taking single-instance resources, one operation per turn. Pure. */
export function simulate(input: GraphInput): GraphTrace {
  assertValidInput(input);
  const threads: Thread[] = input.threads.map((spec, i) => ({
    id: `T${i + 1}`,
    program: [
      ...Array.from({ length: spec.delay }, () => ({ op: "think" }) as const),
      ...effectiveScript(spec.script, input.ordering),
    ],
    pc: 0,
    status: "ready",
    waitsFor: null,
  }));
  const holder: (Thread | null)[] = Array.from({ length: input.resources + 1 }, () => null);
  const queues: Thread[][] = Array.from({ length: input.resources + 1 }, () => []);
  let ready: Thread[] = [...threads];
  const steps: GraphStep[] = [];
  const blocks: Block[] = [];
  const finishOrder: string[] = [];
  const worked: string[] = [];
  const segments: Segment[] = [];
  let cycle: string[] | null = null;
  let cycleStep: number | null = null;
  let stalled = false;

  for (let t = 0; ; t++) {
    const th = ready[0];
    if (!th) break;
    ready = ready.slice(1);
    const explain: GraphExplanation[] = [];
    const op = th.program[th.pc] as ProgramOp;

    switch (op.op) {
      case "think":
        explain.push({ key: "think", params: { id: th.id } });
        th.pc += 1;
        break;
      case "work":
        explain.push({ key: "work", params: { id: th.id } });
        if (!worked.includes(th.id)) worked.push(th.id);
        th.pc += 1;
        break;
      case "acquire": {
        const owner = holder[op.res];
        if (owner) {
          queues[op.res]?.push(th);
          th.status = "blocked";
          th.waitsFor = op.res;
          blocks.push({ step: t, id: th.id, res: rid(op.res), holder: owner.id });
          explain.push({ key: "block", params: { id: th.id, res: rid(op.res), holder: owner.id } });
        } else {
          holder[op.res] = th;
          th.pc += 1;
          explain.push({ key: "acquire", params: { id: th.id, res: rid(op.res) } });
        }
        break;
      }
      case "release": {
        const next = queues[op.res]?.shift();
        if (next) {
          holder[op.res] = next;
          next.status = "ready";
          next.waitsFor = null;
          next.pc += 1;
          ready.push(next);
          explain.push({ key: "handoff", params: { id: th.id, res: rid(op.res), to: next.id } });
        } else {
          holder[op.res] = null;
          explain.push({ key: "release", params: { id: th.id, res: rid(op.res) } });
        }
        th.pc += 1;
        break;
      }
    }

    if (th.pc >= th.program.length) {
      th.status = "done";
      finishOrder.push(th.id);
      explain.push({ key: "finish", params: { id: th.id } });
    } else if (th.status === "ready") {
      ready.push(th);
    }

    if (th.status === "blocked" && cycle === null) {
      const found = findCycle(th, holder);
      if (found) {
        cycle = found.ids;
        cycleStep = t;
        explain.push({ key: "cycle", params: { path: found.path } });
      }
    }

    const last = segments.at(-1);
    if (last && last.id === th.id) last.end = t + 1;
    else segments.push({ id: th.id, start: t, end: t + 1 });

    const blocked = threads.filter((x) => x.status === "blocked").length;
    if (ready.length === 0 && blocked > 0) {
      stalled = true;
      explain.push({ key: "stalled", params: { count: blocked } });
    }

    steps.push({
      t,
      state: {
        threads: threads.map((x) => ({
          id: x.id,
          status: x.status,
          holds: holder.flatMap((h, r) => (h === x ? [rid(r)] : [])),
          waitsFor: x.waitsFor === null ? null : rid(x.waitsFor),
          pc: x.pc,
        })),
        resources: holder.slice(1).map((h, i) => ({
          id: rid(i + 1),
          holder: h?.id ?? null,
          queue: (queues[i + 1] ?? []).map((x) => x.id),
        })),
        ran: th.id,
        ready: ready.map((x) => x.id),
        cycle,
      },
      explain,
    });
    if (stalled) break;
  }

  const result: GraphResult = {
    programs: Object.fromEntries(threads.map((x) => [x.id, x.program])),
    deadlock: cycle !== null,
    cycle,
    cycleStep,
    stalled,
    finishOrder,
    worked,
    blocks,
    steps: steps.length,
    segments,
  };
  return { steps, result };
}

/** Follows "waits for R, held by U" from a blocked thread; returns the path if it comes back. */
function findCycle(
  start: Thread,
  holder: readonly (Thread | null)[],
): { ids: string[]; path: string } | null {
  const ids: string[] = [start.id];
  const parts: string[] = [start.id];
  let current: Thread = start;
  for (let hops = 0; hops < holder.length; hops++) {
    if (current.waitsFor === null) return null;
    const owner = holder[current.waitsFor];
    if (!owner) return null;
    parts.push(rid(current.waitsFor), owner.id);
    if (owner === start) return { ids, path: parts.join(" → ") };
    ids.push(owner.id);
    current = owner;
  }
  return null;
}
