import type { TxExplainParams } from "../../engines/transactions/types";
import type { ExplainTemplates } from "./types";

const plusOrMinus = (delta: number) => (delta < 0 ? `menos ${-delta}` : `más ${delta}`);

/** "T1, T2, T3" → "T1, T2 y T3". */
const list = (ids: string) => ids.replace(/, ([^,]*)$/, " y $1");

export const transactionsEs: ExplainTemplates<TxExplainParams> = {
  read: ({ tx, item, value }) => `${tx} lee ${item} = ${value}.`,
  "read.hidden": ({ tx, item, value, writer, pending }) =>
    `${tx} lee ${item} = ${value}. ${writer} ya escribió ${pending}, pero no lo ha confirmado: Read Committed solo deja ver lo confirmado.`,
  "read.dirty": ({ tx, item, value, writer }) =>
    `${tx} lee ${item} = ${value}, un valor que ${writer} aún no ha confirmado: una lectura sucia.`,
  "read.own": ({ tx, item, value }) =>
    `${tx} lee ${item} = ${value}: su propia escritura, aún sin confirmar.`,
  "read.changed": ({ tx, item, before, value }) =>
    `La última vez ${tx} leyó ${item} = ${before}; ahora lee ${value}: otra transacción confirmó un cambio entre medias.`,
  "read.lock": ({ tx, item, value }) =>
    `${tx} lee ${item} = ${value} y lo bloquea para escribirlo después (FOR UPDATE).`,
  write: ({ tx, item, value }) => `${tx} escribe ${item} = ${value}, sin confirmar todavía.`,
  "write.computed": ({ tx, item, value, read, delta }) =>
    `${tx} escribe ${item} = ${value}: el ${read} que leyó ${plusOrMinus(delta)}. Aún no está confirmado.`,
  "write.stale": ({ tx, item, read, current, by }) =>
    `Pero ${item} ya vale ${current}, confirmado por ${by}. ${tx} calculó a partir de ${read}: al confirmar, borrará ese cambio.`,
  add: ({ tx, item, before, delta, value }) =>
    `${tx} ${delta < 0 ? `resta ${-delta} a` : `suma ${delta} a`} ${item} dentro de la base de datos: ${before} → ${value}, sin confirmar todavía.`,
  "lock.wait": ({ tx, item, holder }) =>
    `${tx} quiere escribir ${item}, pero ${holder} lo tiene bloqueado: ${tx} espera a que ${holder} termine.`,
  "read.shared": ({ tx, item, value }) =>
    `${tx} lee ${item} = ${value} y toma un bloqueo compartido: nadie podrá escribir ${item} hasta que ${tx} termine.`,
  "lock.wait.shared": ({ tx, item, holders }) =>
    `${tx} quiere escribir ${item}, pero ${list(holders)} ${holders.includes(",") ? "lo están leyendo con bloqueos compartidos" : "lo está leyendo con un bloqueo compartido"}: ${tx} espera.`,
  "lock.upgrade": ({ tx, item }) =>
    `${tx} ya tenía un bloqueo compartido de ${item} y lo convierte en exclusivo.`,
  handoff: ({ tx, item, to }) =>
    `${tx} libera ${item} y ${to}, que esperaba, lo bloquea y continúa.`,
  commit: ({ tx }) => `${tx} confirma: sus escrituras ya son visibles para todos.`,
  abort: ({ tx }) => `${tx} se deshace (ROLLBACK): sus escrituras desaparecen.`,
  deadlock: ({ tx, path }) =>
    `Ciclo de espera: ${path}. La base de datos aborta a ${tx} para romperlo.`,
};
