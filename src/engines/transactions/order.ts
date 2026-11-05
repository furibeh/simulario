import { simulate } from "./simulate";
import { limits, type TxInput } from "./types";

/** Whether an order can run (it never names an ended or waiting transaction). */
export function runs(input: TxInput): boolean {
  try {
    simulate(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fits an order to the scripts and level: drops turns that name a transaction that is waiting or
 * has ended, then gives turns to the first transaction that can move until every transaction has
 * ended. Applied to a preset's order, it gives the orders traced in the lesson specs for each level.
 */
export function fitOrder(input: TxInput): string[] {
  const out: string[] = [];
  for (const x of input.order) if (runs({ ...input, order: [...out, x] })) out.push(x);
  while (out.length < limits.order.max) {
    const last = simulate({ ...input, order: out }).steps.at(-1)?.state.transactions;
    const next = last ? last.find((x) => x.status === "active")?.id : "T1";
    if (next === undefined) break;
    out.push(next);
  }
  return out;
}
