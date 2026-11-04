import {
  type Instruction,
  limits,
  type RaceExplanation,
  type RaceInput,
  type RaceResult,
  type RaceStep,
  type RaceTrace,
  type Segment,
  type ThreadView,
  type Write,
} from "./types";

interface Thread {
  id: string;
  pc: number;
  reg: number | null;
  loaded: number | null;
}

const inRange = (v: number, r: { min: number; max: number }) =>
  Number.isInteger(v) && v >= r.min && v <= r.max;

/** The program every thread runs. */
export function programFor(increments: number, atomic: boolean): Instruction[] {
  const one: Instruction[] = atomic ? ["inc"] : ["load", "add", "store"];
  return Array.from({ length: increments }, () => one).flat();
}

/** Throws a RangeError describing the first invalid field. Rules: docs/lessons/condiciones-carrera.md. */
export function assertValidInput(input: RaceInput): void {
  if (!inRange(input.threads, limits.threads)) throw new RangeError("Invalid thread count");
  if (!inRange(input.increments, limits.increments)) throw new RangeError("Invalid increments");
  if (input.schedule.kind === "timer" && !inRange(input.schedule.quantum, limits.quantum)) {
    throw new RangeError("Invalid quantum");
  }
}

/** Simulates threads running counter++ on one CPU, one instruction per step. Pure. */
export function simulate(input: RaceInput): RaceTrace {
  assertValidInput(input);
  const program = programFor(input.increments, input.atomic);
  const threads: Thread[] = Array.from({ length: input.threads }, (_, i) => ({
    id: `T${i + 1}`,
    pc: 0,
    reg: null,
    loaded: null,
  }));
  const finished = (th: Thread) => th.pc >= program.length;
  const steps: RaceStep[] = [];
  const writes: Write[] = [];
  let counter = 0;
  let switches = 0;
  let previous: Thread | null = null;
  // Timer state: the running thread and how many instructions it has run in this turn.
  let current: Thread | null = null;
  let used = 0;

  const nextAfter = (from: number): Thread | null => {
    for (let k = 1; k <= threads.length; k++) {
      const th = threads[(from + k) % threads.length];
      if (th && !finished(th)) return th;
    }
    return null;
  };

  for (let t = 0; ; t++) {
    if (threads.every(finished)) break;
    const explain: RaceExplanation[] = [];
    let thread: Thread;

    if (input.schedule.kind === "manual") {
      const id = input.schedule.order[t];
      if (id === undefined) break;
      const named = threads.find((th) => th.id === id);
      if (!named || finished(named)) {
        throw new RangeError(`Step ${t}: ${id} has no instructions left`);
      }
      thread = named;
      if (thread !== previous) {
        explain.push({ key: "pick", params: { id: thread.id } });
        if (previous) switches += 1;
      }
    } else {
      const { quantum } = input.schedule;
      if (current === null) {
        current = threads[0] ?? null;
        used = 0;
        if (current) explain.push({ key: "dispatch", params: { id: current.id } });
      } else if (finished(current)) {
        current = nextAfter(threads.indexOf(current));
        used = 0;
        if (current) explain.push({ key: "dispatch", params: { id: current.id } });
        switches += 1;
      } else if (used >= quantum) {
        const next = nextAfter(threads.indexOf(current));
        used = 0;
        if (next && next !== current) {
          explain.push({ key: "preempt", params: { id: current.id, quantum } });
          explain.push({ key: "dispatch", params: { id: next.id } });
          current = next;
          switches += 1;
        }
      }
      if (!current) break;
      thread = current;
    }

    const instruction = program[thread.pc] as Instruction;
    switch (instruction) {
      case "load":
        thread.reg = counter;
        thread.loaded = counter;
        explain.push({ key: "load", params: { id: thread.id, value: counter } });
        break;
      case "add":
        thread.reg = (thread.reg ?? 0) + 1;
        explain.push({ key: "add", params: { id: thread.id, value: thread.reg, counter } });
        break;
      case "store": {
        const value = thread.reg ?? 0;
        const loaded = thread.loaded ?? 0;
        const stale = counter !== loaded;
        writes.push({ step: t, id: thread.id, value, loaded, before: counter, stale });
        explain.push(
          stale
            ? { key: "store.stale", params: { id: thread.id, value, loaded, before: counter } }
            : { key: "store", params: { id: thread.id, value } },
        );
        counter = value;
        thread.loaded = null;
        break;
      }
      case "inc":
        writes.push({
          step: t,
          id: thread.id,
          value: counter + 1,
          loaded: null,
          before: counter,
          stale: false,
        });
        counter += 1;
        explain.push({ key: "inc", params: { id: thread.id, value: counter } });
        break;
    }
    thread.pc += 1;
    used += 1;
    if (finished(thread)) explain.push({ key: "finish", params: { id: thread.id } });
    previous = thread;

    const views: ThreadView[] = threads.map((th) => ({
      id: th.id,
      pc: th.pc,
      reg: th.reg,
      loaded: th.loaded,
      status: finished(th) ? "done" : th === thread ? "running" : "ready",
    }));
    steps.push({
      t,
      state: { counter, threads: views, running: thread.id, instruction },
      explain,
    });
  }

  return { steps, result: buildResult(input, program, steps, writes, counter, switches) };
}

function buildResult(
  input: RaceInput,
  program: readonly Instruction[],
  steps: readonly RaceStep[],
  writes: readonly Write[],
  final: number,
  switches: number,
): RaceResult {
  const expected = input.threads * input.increments;
  const segments: Segment[] = [];
  for (const step of steps) {
    const last = segments.at(-1);
    if (last && last.id === step.state.running) last.end = step.t + 1;
    else segments.push({ id: step.state.running, start: step.t, end: step.t + 1 });
  }
  return {
    program,
    final,
    expected,
    lost: expected - final,
    complete: steps.length === input.threads * program.length,
    instructions: steps.length,
    switches,
    writes,
    segments,
  };
}
