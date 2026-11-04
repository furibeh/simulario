import {
  type AccessRecord,
  costs,
  limits,
  type Outcome,
  type PageEntry,
  type TlbEntry,
  type TranslationExplanation,
  type TranslationInput,
  type TranslationResult,
  type TranslationStep,
  type TranslationTrace,
} from "./types";

const inRange = (v: number, r: { min: number; max: number }) =>
  Number.isInteger(v) && v >= r.min && v <= r.max;

/** Throws a RangeError describing the first invalid field. Rules: docs/lessons/paginacion.md. */
export function assertValidInput(input: TranslationInput): void {
  if (!(limits.pageSizes as readonly number[]).includes(input.pageSize)) {
    throw new RangeError("Invalid page size");
  }
  if (!inRange(input.pages.length, limits.pages)) throw new RangeError("Invalid page count");
  if (!inRange(input.frames, limits.frames)) throw new RangeError("Invalid frame count");
  if (!inRange(input.tlbSize, limits.tlbSize)) throw new RangeError("Invalid TLB size");
  if (!inRange(input.accesses.length, limits.accesses)) throw new RangeError("Invalid accesses");
  const used = new Set<number>();
  for (const p of input.pages) {
    if (p.kind !== "frame") continue;
    if (!inRange(p.frame, { min: 0, max: input.frames - 1 }) || used.has(p.frame)) {
      throw new RangeError(`Invalid or repeated frame ${p.frame}`);
    }
    used.add(p.frame);
  }
  const top = input.pages.length * input.pageSize - 1;
  for (const a of input.accesses) {
    if (!inRange(a, { min: 0, max: top })) throw new RangeError(`Address ${a} out of range`);
  }
}

/** Simulates address translation with a TLB, a page table and demand paging. Pure. */
export function simulate(input: TranslationInput): TranslationTrace {
  assertValidInput(input);
  const { pageSize } = input;
  const pages: PageEntry[] = input.pages.map((p) => ({ ...p }));
  const frames: (number | null)[] = Array.from({ length: input.frames }, () => null);
  pages.forEach((p, i) => {
    if (p.kind === "frame") frames[p.frame] = i;
  });
  // Frames mapped at the start count as loaded in increasing frame order.
  let fifo: number[] = frames.flatMap((page, f) => (page === null ? [] : [f]));
  let tlb: TlbEntry[] = [];
  const steps: TranslationStep[] = [];
  const records: AccessRecord[] = [];

  for (const [index, address] of input.accesses.entries()) {
    const explain: TranslationExplanation[] = [];
    const page = Math.floor(address / pageSize);
    const offset = address % pageSize;
    let cost = 0;
    let outcome: Outcome = "miss";
    let frame: number | null = null;
    explain.push({ key: "split", params: { addr: address, page, offset } });

    const cached = input.tlbSize > 0 ? tlb.find((e) => e.page === page) : undefined;
    if (input.tlbSize > 0) cost += costs.tlb;
    if (cached) {
      outcome = "hit";
      frame = cached.frame;
      tlb = [...tlb.filter((e) => e !== cached), cached];
      explain.push({ key: "tlb.hit", params: { page, frame } });
    } else {
      if (input.tlbSize > 0) explain.push({ key: "tlb.miss", params: { page } });
      cost += costs.memory;
      const entry = pages[page] as PageEntry;
      if (entry.kind === "invalid") {
        outcome = "invalid";
        explain.push({ key: "segfault", params: { page } });
      } else if (entry.kind === "frame") {
        frame = entry.frame;
        explain.push({ key: "pt.hit", params: { page, frame } });
      } else {
        outcome = "fault";
        cost += costs.fault;
        explain.push({ key: "fault", params: { page } });
        let target = frames.indexOf(null);
        if (target < 0) {
          target = fifo[0] ?? 0;
          const victim = frames[target] as number;
          pages[victim] = { kind: "disk" };
          explain.push({ key: "evict", params: { page: victim, frame: target } });
          if (tlb.some((e) => e.page === victim)) {
            tlb = tlb.filter((e) => e.page !== victim);
            explain.push({ key: "tlb.drop", params: { page: victim } });
          }
        }
        fifo = [...fifo.filter((f) => f !== target), target];
        frames[target] = page;
        pages[page] = { kind: "frame", frame: target };
        frame = target;
        explain.push({ key: "load", params: { page, frame } });
      }
      if (frame !== null && input.tlbSize > 0) {
        if (tlb.length >= input.tlbSize) {
          const lru = tlb[0] as TlbEntry;
          tlb = tlb.slice(1);
          explain.push({ key: "tlb.evict", params: { page: lru.page } });
        }
        tlb = [...tlb, { page, frame }];
        explain.push({ key: "tlb.fill", params: { page, frame } });
      }
    }

    let phys: number | null = null;
    if (frame !== null) {
      cost += costs.memory;
      phys = frame * pageSize + offset;
      explain.push({ key: "access", params: { frame, offset, pageSize, phys } });
    }

    const record: AccessRecord = { index, address, page, offset, outcome, frame, phys, cost };
    records.push(record);
    steps.push({
      t: index,
      state: {
        pages: pages.map((p) => ({ ...p })),
        tlb: [...tlb],
        frames: [...frames],
        fifo: [...fifo],
        access: record,
      },
      explain,
    });
    if (outcome === "invalid") break;
  }

  const result: TranslationResult = {
    accesses: records,
    hits: records.filter((r) => r.outcome === "hit").length,
    misses: records.filter((r) => r.outcome === "miss").length,
    faults: records.filter((r) => r.outcome === "fault").length,
    invalid: records.some((r) => r.outcome === "invalid"),
    cost: records.reduce((sum, r) => sum + r.cost, 0),
    completed: records.filter((r) => r.outcome !== "invalid").length,
  };
  return { steps, result };
}
