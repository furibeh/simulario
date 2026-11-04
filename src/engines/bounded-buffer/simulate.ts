import {
  type Block,
  type BufferExplanation,
  type BufferInput,
  type BufferResult,
  type BufferStep,
  type BufferTrace,
  type Consumed,
  limits,
  type Operation,
  type Role,
  type Segment,
  type Sem,
  semaphores,
  type ThreadView,
} from "./types";

interface Thread {
  id: string;
  role: Role;
  program: Operation[];
  pc: number;
  status: ThreadView["status"];
  blockedOn: Sem | null;
  items: number;
}

const inRange = (v: number, r: { min: number; max: number }) =>
  Number.isInteger(v) && v >= r.min && v <= r.max;

/** Throws a RangeError describing the first invalid field. Rules: docs/lessons/mutex-semaforos.md. */
export function assertValidInput(input: BufferInput): void {
  if (!inRange(input.producers, limits.producers)) throw new RangeError("Invalid producers");
  if (!inRange(input.consumers, limits.consumers)) throw new RangeError("Invalid consumers");
  if (!inRange(input.items, limits.items)) throw new RangeError("Invalid items");
  if (!inRange(input.capacity, limits.capacity)) throw new RangeError("Invalid capacity");
  if (input.quantum !== null && !inRange(input.quantum, limits.quantum)) {
    throw new RangeError("Invalid quantum");
  }
}

/** Items each consumer takes: an even split, the first consumers take the remainder. */
export function consumerShares(input: BufferInput): number[] {
  const total = input.producers * input.items;
  return Array.from(
    { length: input.consumers },
    (_, k) => Math.floor(total / input.consumers) + (k < total % input.consumers ? 1 : 0),
  );
}

export function producerProgram(items: number, version: BufferInput["version"]): Operation[] {
  const first: Operation[] =
    version === "correct"
      ? [
          { op: "wait", sem: "empty" },
          { op: "wait", sem: "mutex" },
        ]
      : [
          { op: "wait", sem: "mutex" },
          { op: "wait", sem: "empty" },
        ];
  const one: Operation[] = [
    ...first,
    { op: "put" },
    { op: "signal", sem: "mutex" },
    { op: "signal", sem: "full" },
  ];
  return Array.from({ length: items }, () => one).flat();
}

export function consumerProgram(items: number): Operation[] {
  const one: Operation[] = [
    { op: "wait", sem: "full" },
    { op: "wait", sem: "mutex" },
    { op: "take" },
    { op: "signal", sem: "mutex" },
    { op: "signal", sem: "empty" },
  ];
  return Array.from({ length: items }, () => one).flat();
}

/** Simulates the bounded buffer with semaphores, one operation per step. Pure. */
export function simulate(input: BufferInput): BufferTrace {
  assertValidInput(input);
  const threads: Thread[] = [
    ...Array.from({ length: input.producers }, (_, i) => ({
      id: `P${i + 1}`,
      role: "producer" as const,
      program: producerProgram(input.items, input.version),
    })),
    ...consumerShares(input).map((share, i) => ({
      id: `C${i + 1}`,
      role: "consumer" as const,
      program: consumerProgram(share),
    })),
  ].map((th) => ({
    ...th,
    pc: 0,
    // A consumer whose share is 0 has nothing to do: it starts finished and never runs.
    status: th.program.length === 0 ? "done" : "ready",
    blockedOn: null,
    items: 0,
  }));

  const value: Record<Sem, number> = { empty: input.capacity, full: 0, mutex: 1 };
  const queues: Record<Sem, Thread[]> = { empty: [], full: [], mutex: [] };
  const buffer: (string | null)[] = Array.from({ length: input.capacity }, () => null);
  let slotIn = 0;
  let slotOut = 0;
  let ready: Thread[] = threads.filter((th) => th.status === "ready");
  let running: Thread | null = null;
  let used = 0;
  let deadlock = false;
  const steps: BufferStep[] = [];
  const consumed: Consumed[] = [];
  const blocks: Block[] = [];
  const finishOrder: string[] = [];
  const segments: Segment[] = [];

  for (let t = 0; ; t++) {
    const explain: BufferExplanation[] = [];
    let fresh = false;
    if (running && input.quantum !== null && used >= input.quantum) {
      if (ready.length > 0) {
        explain.push({ key: "preempt", params: { id: running.id, quantum: input.quantum } });
        running.status = "ready";
        ready.push(running);
        running = null;
      } else {
        used = 0;
      }
    }
    if (!running) {
      const head = ready[0];
      if (!head) break;
      ready = ready.slice(1);
      head.status = "running";
      running = head;
      used = 0;
      fresh = true;
      explain.push({ key: "dispatch", params: { id: head.id } });
    }

    const th: Thread = running;
    const op = th.program[th.pc] as Operation;
    switch (op.op) {
      case "wait":
        if (value[op.sem] > 0) {
          value[op.sem] -= 1;
          th.pc += 1;
          explain.push({
            key: "wait.pass",
            params: { id: th.id, sem: op.sem, value: value[op.sem] },
          });
        } else {
          queues[op.sem].push(th);
          th.status = "blocked";
          th.blockedOn = op.sem;
          running = null;
          blocks.push({ step: t, id: th.id, sem: op.sem });
          explain.push({ key: "wait.block", params: { id: th.id, sem: op.sem } });
        }
        break;
      case "signal": {
        const woken = queues[op.sem].shift();
        if (woken) {
          woken.pc += 1;
          woken.status = "ready";
          woken.blockedOn = null;
          ready.push(woken);
          explain.push({
            key: "signal.wake",
            params: { id: th.id, sem: op.sem, woken: woken.id },
          });
        } else {
          value[op.sem] += 1;
          explain.push({
            key: "signal.inc",
            params: { id: th.id, sem: op.sem, value: value[op.sem] },
          });
        }
        th.pc += 1;
        break;
      }
      case "put": {
        const item = `${th.id}.${th.items + 1}`;
        buffer[slotIn] = item;
        explain.push({ key: "put", params: { id: th.id, item, slot: slotIn } });
        slotIn = (slotIn + 1) % input.capacity;
        th.items += 1;
        th.pc += 1;
        break;
      }
      case "take": {
        const item = buffer[slotOut] ?? "";
        buffer[slotOut] = null;
        consumed.push({ item, by: th.id, step: t });
        explain.push({ key: "take", params: { id: th.id, item, slot: slotOut } });
        slotOut = (slotOut + 1) % input.capacity;
        th.items += 1;
        th.pc += 1;
        break;
      }
    }
    used += 1;

    if (th.pc >= th.program.length) {
      th.status = "done";
      running = null;
      finishOrder.push(th.id);
      explain.push({ key: "finish", params: { id: th.id } });
    }

    const last = segments.at(-1);
    if (last && last.id === th.id && !fresh) last.end = t + 1;
    else segments.push({ id: th.id, start: t, end: t + 1 });

    const stuck = !running && ready.length === 0 && threads.some((x) => x.status !== "done");
    if (stuck) {
      deadlock = true;
      explain.push({ key: "deadlock", params: {} });
      for (const x of threads) {
        if (x.status === "blocked" && x.blockedOn) {
          explain.push({ key: "stuck", params: { id: x.id, sem: x.blockedOn } });
        }
      }
    }

    steps.push({
      t,
      state: {
        sems: {
          empty: { value: value.empty, queue: queues.empty.map((x) => x.id) },
          full: { value: value.full, queue: queues.full.map((x) => x.id) },
          mutex: { value: value.mutex, queue: queues.mutex.map((x) => x.id) },
        },
        buffer: [...buffer],
        in: slotIn,
        out: slotOut,
        threads: threads.map((x) => ({
          id: x.id,
          role: x.role,
          pc: x.pc,
          status: x.status,
          blockedOn: x.blockedOn,
          items: x.items,
        })),
        ran: th.id,
        running: running?.id ?? null,
        ready: ready.map((x) => x.id),
      },
      explain,
    });
    if (stuck) break;
  }

  const result: BufferResult = {
    programs: Object.fromEntries(threads.map((x) => [x.id, x.program])),
    completed: threads.every((x) => x.status === "done"),
    deadlock,
    steps: steps.length,
    consumed,
    blocks,
    finishOrder,
    finalSems: Object.fromEntries(semaphores.map((s) => [s, value[s]])) as Record<Sem, number>,
    segments,
  };
  return { steps, result };
}
