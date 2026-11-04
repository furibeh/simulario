import type { TranslationExplainParams } from "../../engines/address-translation/types";
import type { ExplainTemplates } from "./types";

export const addressTranslationEn: ExplainTemplates<TranslationExplainParams> = {
  split: ({ addr, page, offset }) => `Virtual address ${addr} is page ${page}, offset ${offset}.`,
  "tlb.hit": ({ page, frame }) =>
    `The TLB already knows where page ${page} is: frame ${frame}. No page table read needed.`,
  "tlb.miss": ({ page }) => `Page ${page} is not in the TLB: the page table must be read.`,
  "pt.hit": ({ page, frame }) => `The page table says page ${page} is in frame ${frame}.`,
  fault: ({ page }) =>
    `Page fault: page ${page} is valid but on disk. The operating system loads it.`,
  evict: ({ page, frame }) =>
    `No free frames: page ${page} leaves frame ${frame} and goes back to disk.`,
  "tlb.drop": ({ page }) => `The TLB forgets page ${page}: its frame now belongs to another page.`,
  load: ({ page, frame }) =>
    `Page ${page} is loaded into frame ${frame} and the page table is updated.`,
  segfault: ({ page }) =>
    `Page ${page} is not part of the program: the operating system kills the program (segmentation fault).`,
  "tlb.evict": ({ page }) => `The TLB is full: it forgets page ${page}, the least recently used.`,
  "tlb.fill": ({ page, frame }) => `The TLB stores the translation page ${page} → frame ${frame}.`,
  access: ({ frame, offset, pageSize, phys }) =>
    `Physical address: frame ${frame} × ${pageSize} + ${offset} = ${phys}.`,
};
