import type { GraphExplainParams } from "../../engines/resource-graph/types";
import type { ExplainTemplates } from "./types";

export const resourceGraphEn: ExplainTemplates<GraphExplainParams> = {
  acquire: ({ id, res }) => `${id} takes ${res}.`,
  block: ({ id, res, holder }) =>
    `${id} asks for ${res}, but ${holder} holds it: ${id} blocks waiting for it.`,
  release: ({ id, res }) => `${id} releases ${res}, which is now free.`,
  handoff: ({ id, res, to }) => `${id} releases ${res} and hands it to ${to}, which wakes up.`,
  work: ({ id }) => `${id} works with the resources it holds.`,
  think: ({ id }) => `${id} does not ask for resources yet: it does something else.`,
  finish: ({ id }) => `${id} has finished and holds no resources.`,
  cycle: ({ path }) =>
    `A cycle closed: ${path}. Each thread waits for something the next one holds: none can move.`,
  stalled: ({ count }) =>
    `No thread is ready: ${count === 1 ? "1 thread is" : `${count} threads are`} blocked forever.`,
};
