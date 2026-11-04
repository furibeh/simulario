import type { GraphExplainParams } from "../../engines/resource-graph/types";
import type { ExplainTemplates } from "./types";

export const resourceGraphEs: ExplainTemplates<GraphExplainParams> = {
  acquire: ({ id, res }) => `${id} toma ${res}.`,
  block: ({ id, res, holder }) =>
    `${id} pide ${res}, pero lo tiene ${holder}: ${id} se bloquea esperándolo.`,
  release: ({ id, res }) => `${id} suelta ${res}, que queda libre.`,
  handoff: ({ id, res, to }) => `${id} suelta ${res} y se lo entrega a ${to}, que despierta.`,
  work: ({ id }) => `${id} trabaja con los recursos que tiene.`,
  think: ({ id }) => `${id} todavía no pide recursos: hace otra cosa.`,
  finish: ({ id }) => `${id} terminó y no tiene ningún recurso.`,
  cycle: ({ path }) =>
    `Se cerró un ciclo: ${path}. Cada hilo espera algo que tiene el siguiente: ninguno podrá avanzar.`,
  stalled: ({ count }) =>
    `No queda ningún hilo listo: ${count === 1 ? "1 hilo está bloqueado" : `${count} hilos están bloqueados`} para siempre.`,
};
