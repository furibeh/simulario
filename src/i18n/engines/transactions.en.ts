import type { TxExplainParams } from "../../engines/transactions/types";
import type { ExplainTemplates } from "./types";

const plusOrMinus = (delta: number) => (delta < 0 ? `minus ${-delta}` : `plus ${delta}`);

/** "T1, T2, T3" → "T1, T2 and T3". */
const list = (ids: string) => ids.replace(/, ([^,]*)$/, " and $1");

export const transactionsEn: ExplainTemplates<TxExplainParams> = {
  read: ({ tx, item, value }) => `${tx} reads ${item} = ${value}.`,
  "read.hidden": ({ tx, item, value, writer, pending }) =>
    `${tx} reads ${item} = ${value}. ${writer} has written ${pending} but not committed it: Read Committed shows only committed values.`,
  "read.dirty": ({ tx, item, value, writer }) =>
    `${tx} reads ${item} = ${value}, a value ${writer} has not committed yet: a dirty read.`,
  "read.own": ({ tx, item, value }) =>
    `${tx} reads ${item} = ${value}: its own write, not committed yet.`,
  "read.changed": ({ tx, item, before, value }) =>
    `Last time ${tx} read ${item} = ${before}; now it reads ${value}: another transaction committed a change in between.`,
  "read.lock": ({ tx, item, value }) =>
    `${tx} reads ${item} = ${value} and locks it to write it later (FOR UPDATE).`,
  write: ({ tx, item, value }) => `${tx} writes ${item} = ${value}, not committed yet.`,
  "write.computed": ({ tx, item, value, read, delta }) =>
    `${tx} writes ${item} = ${value}: the ${read} it read ${plusOrMinus(delta)}. Not committed yet.`,
  "write.stale": ({ tx, item, read, current, by }) =>
    `But ${item} is already ${current}, committed by ${by}. ${tx} computed from ${read}: when it commits, it erases that change.`,
  add: ({ tx, item, before, delta, value }) =>
    `${tx} ${delta < 0 ? `subtracts ${-delta} from` : `adds ${delta} to`} ${item} inside the database: ${before} → ${value}, not committed yet.`,
  "lock.wait": ({ tx, item, holder }) =>
    `${tx} wants to write ${item}, but ${holder} holds its lock: ${tx} waits for ${holder} to finish.`,
  "read.shared": ({ tx, item, value }) =>
    `${tx} reads ${item} = ${value} and takes a shared lock: nobody can write ${item} until ${tx} finishes.`,
  "lock.wait.shared": ({ tx, item, holders }) =>
    `${tx} wants to write ${item}, but ${list(holders)} ${holders.includes(",") ? "hold shared locks" : "holds a shared lock"} to read it: ${tx} waits.`,
  "lock.upgrade": ({ tx, item }) =>
    `${tx} already had a shared lock on ${item} and turns it into an exclusive one.`,
  handoff: ({ tx, item, to }) =>
    `${tx} releases ${item}, and ${to}, which was waiting, locks it and goes on.`,
  commit: ({ tx }) => `${tx} commits: its writes are now visible to everyone.`,
  abort: ({ tx }) => `${tx} rolls back: its writes disappear.`,
  deadlock: ({ tx, path }) => `Waiting cycle: ${path}. The database aborts ${tx} to break it.`,
};
