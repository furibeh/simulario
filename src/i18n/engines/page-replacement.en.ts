import type { ReplacementExplainParams } from "../../engines/page-replacement/types";
import type { ExplainTemplates } from "./types";

export const pageReplacementEn: ExplainTemplates<ReplacementExplainParams> = {
  hit: ({ page, slot }) => `Page ${page} is already in frame ${slot}: a hit.`,
  load: ({ page, slot }) =>
    `Page fault: page ${page} is not in memory and goes into free frame ${slot}.`,
  "evict.fifo": ({ page, victim, slot }) =>
    `Page fault: FIFO evicts page ${victim}, the one loaded longest ago, and puts page ${page} in frame ${slot}.`,
  "evict.lru": ({ page, victim, slot }) =>
    `Page fault: LRU evicts page ${victim}, unused for the longest time, and puts page ${page} in frame ${slot}.`,
  "evict.opt": ({ page, victim, slot, next }) =>
    `Page fault: OPT evicts page ${victim}, whose next use is the farthest (reference ${next}), and puts page ${page} in frame ${slot}.`,
  "evict.opt.never": ({ page, victim, slot }) =>
    `Page fault: OPT evicts page ${victim}, which will never be used again, and puts page ${page} in frame ${slot}.`,
  "clock.clear": ({ page, slot }) =>
    `The hand points to frame ${slot} (page ${page}) with use bit 1: it clears it and moves on.`,
  "evict.clock": ({ page, victim, slot }) =>
    `The hand finds page ${victim} with bit 0 in frame ${slot}: it evicts it and puts page ${page} there.`,
};
