import type { BufferExplainParams } from "../../engines/bounded-buffer/types";
import type { ExplainTemplates } from "./types";

export const boundedBufferEn: ExplainTemplates<BufferExplainParams> = {
  dispatch: ({ id }) => `The scheduler gives the CPU to ${id}.`,
  preempt: ({ id, quantum }) =>
    `${id}'s quantum (${quantum === 1 ? "1 operation" : `${quantum} operations`}) runs out: back to the end of the ready queue.`,
  "wait.pass": ({ id, sem, value }) =>
    `${id} does wait(${sem}): ${sem} drops to ${value} and ${id} continues.`,
  "wait.block": ({ id, sem }) =>
    `${id} does wait(${sem}), but ${sem} is 0: it blocks in its queue and gives up the CPU.`,
  "signal.inc": ({ id, sem, value }) =>
    `${id} does signal(${sem}): nobody is waiting, so ${sem} rises to ${value}.`,
  "signal.wake": ({ id, sem, woken }) =>
    `${id} does signal(${sem}): it wakes ${woken}, which becomes ready holding the permit. ${sem} does not change.`,
  put: ({ id, item, slot }) => `${id} puts ${item} in slot ${slot}.`,
  take: ({ id, item, slot }) => `${id} takes ${item} from slot ${slot}.`,
  finish: ({ id }) => `${id} has finished its work.`,
  deadlock: () => "Every remaining thread is blocked and none can wake another: deadlock.",
  stuck: ({ id, sem }) => `${id} waits on ${sem} forever.`,
};
