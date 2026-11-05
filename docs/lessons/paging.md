# Lesson spec: Virtual memory and paging

| Field          | Value                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| Id             | `paging`                                                               |
| Path / module  | Operating systems (`operating-systems`) / 6, Virtual memory and paging |
| Engine         | `src/engines/address-translation/`                                     |
| Estimated time | 35 minutes                                                             |
| Status         | Written                                                                |

The simulation is an **address translation board**. A process issues a short list of memory accesses. For each one the board splits the virtual address into page number and offset (in decimal and in binary), looks the page up in a small TLB, then in the page table, serves a page fault from disk when needed, and builds the physical address. The TLB, the page table, physical memory (frames) and the disk are all visible, and every access shows what it cost. Pages are tokens that move between disk and frames.

## Learning objectives

By the end of the lesson the learner can:

1. Split a virtual address into page number and offset for a given page size, and build the physical address from the frame number.
2. Trace a sequence of accesses through the TLB, the page table and page faults, and classify each one as a TLB hit, a TLB miss, a page fault or an invalid access.
3. Tell a page fault (normal, served by the OS) from an access to an invalid page (the process is killed).
4. Compute the cost of a sequence of accesses with a simple cost model, and explain why a few page faults dominate it.
5. Explain why translations are cached in a TLB, what must happen to a TLB entry when its page leaves memory, and why real page tables have several levels.

## Prerequisites

- Processes and the address space as "the memory of a program" (lesson `process-states`).
- Binary numbers: reading the low bits of a number. A short reminder is part of Theory.

## Misconceptions targeted

| #   | Misconception                                                              | Where it is exposed                              |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| M1  | A page fault is an error that crashes the program.                         | Predict (accesses 3 and 6); Run; Check C1        |
| M2  | Every access reads the page table in memory (or goes to disk).             | Predict (accesses 2 and 4 hit the TLB); Check C2 |
| M3  | Translation changes the whole address, offset included.                    | Theory; Run (binary view); Check C3              |
| M4  | Consecutive virtual pages sit in consecutive frames.                       | Run (p0 → f2, p1 → f0); Explain                  |
| M5  | The TLB stores data; or a TLB entry stays valid after its page is evicted. | Explain; Experiment E3; Check C4                 |
| M6  | An evicted page is lost.                                                   | Experiment E3 (p0 comes back); Check C5          |

## Minimal theory (before Predict)

- Every address a program uses is **virtual**. The OS and the hardware translate it to a **physical** address in RAM.
- Memory is cut into fixed-size blocks: **pages** in virtual memory and **frames** in physical memory, both of the same size (here 16 bytes; 4 KiB in real systems).
- A virtual address splits into **page number** = address ÷ page size (integer division) and **offset** = remainder. With 16-byte pages, the offset is the low 4 bits and the page number is the rest. Example: 70 = `100 0110` → page 4 (`100`), offset 6 (`0110`).
- The **page table** says, for each page, where it is: in a frame, on disk (valid but not loaded), or invalid (not part of the program).
- **Physical address** = frame × page size + offset. The offset never changes.
- A **TLB** is a tiny, fast cache of recent translations (page → frame) inside the CPU. Hit: no page table read. Miss: read the page table and remember the translation, evicting the least recently used entry if the TLB is full.
- **Page fault**: the page is valid but on disk. The OS loads it into a free frame, updates the page table, and the access repeats. It is slow but normal.
- **Invalid page**: the address is not part of the program. The OS kills the process (segmentation fault).
- Cost model: TLB lookup 1, memory access 100, page fault service 10 000 (time units).

## Predict

- **Setup**: preset _Recorrido_: 16-byte pages, 8 pages, 4 frames, TLB of 2 entries (empty at the start).

  | Page  | 0   | 1   | 2    | 3   | 4    | 5       | 6       | 7    |
  | ----- | --- | --- | ---- | --- | ---- | ------- | ------- | ---- |
  | Where | f2  | f0  | disk | f3  | disk | invalid | invalid | disk |

  Accesses: 20, 25, 70, 23, 3, 90. Frame 1 is free.
- **Question**: "Classify each access: TLB hit, TLB miss with the page in memory, page fault, or invalid page." A 6-cell grid.
- **Correct answer**: miss, hit, fault, hit, miss, invalid.
- **Naive answers and why they fail**:
  - Access 3 (70) or 6 (90) as "the same kind of failure" (M1): page 4 is on disk (fault, served, the access completes at physical 22); page 5 is invalid (the process is killed).
  - Access 2 (25) or 4 (23) as a miss (M2): they are on page 1, already in the TLB since access 1.

## Run

- **Default setup**: _Recorrido_.
- **Moments to watch**:
  - Access 1 (20): page 1, offset 4; page 1 is in frame 0, so the physical address is 4. Same offset, different page.
  - Access 3 (70): page fault; page 4 goes to free frame 1; physical 22. The access costs 10 201, more than the other five together.
  - Access 5 (3): TLB full, so the least recently used translation (page 4) leaves the TLB, not memory.
  - Access 6 (90): page 5 is invalid; the run stops.
- Below the board: the access log (virtual address, page, offset, outcome, physical address, cost) and totals.

## Explain (depth after the run)

- **Page fault vs invalid access** (M1): the page table distinguishes "on disk" from "invalid". A fault is how pages get into memory lazily (demand paging); a program may take thousands of faults per second. An invalid access is a bug: Linux sends `SIGSEGV`.
- **Why a TLB** (M2): without it, every access needs at least two memory reads (the page table, then the data). With 2 entries, two of the first five accesses skip the page table. Real TLBs hold tens to a few thousand entries and hit more than 99% of the time because programs reuse nearby addresses (locality).
- **Only the page number is translated** (M3); the offset bits pass through. That is why page size is a power of two.
- **Any page in any frame** (M4): page 0 is in frame 2 and page 1 in frame 0. Contiguous virtual memory does not need contiguous physical memory, which removes external fragmentation.
- **Costs**: the run costs 201 + 101 + 10 201 + 101 + 201 + 101 = 10 906 units; the access with the page fault is 94% of it. Real numbers: TLB about 1 ns, DRAM about 100 ns, a page fault served from an SSD tens to hundreds of microseconds, from a hard disk milliseconds.
- **Evicting a page** (M5, M6): when no frame is free the OS evicts a page to disk (here, the one loaded first: FIFO; the next lesson compares better choices). Its page-table entry goes back to "disk", and its TLB entry must be removed, or the TLB would translate to a frame that now holds another page. The page is not lost: the next access to it is a page fault.
- **Real page tables**: with 4 KiB pages and 48-bit addresses, a flat table would need 2³⁶ entries per process. x86-64 uses a 4-level tree (5 levels, 57-bit addresses, on recent CPUs with LA57), so a TLB miss walks up to 4–5 levels. Huge pages (2 MiB, 1 GiB) let one TLB entry cover far more memory. TLB entries are tagged with an address-space id (ASID/PCID) so a context switch does not have to flush them.

## Experiment

| #   | Challenge                                                 | One valid solution                                                                  | Why it works                                                                                      |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| E1  | Make _Recorrido_ cost more without changing the accesses. | TLB of 0 entries: 11 100.                                                           | Every access now reads the page table: 200 instead of 101 for the hits, no lookup cost elsewhere. |
| E2  | Get four TLB hits out of six accesses.                    | Accesses 20, 25, 23, 30, 3, 6 with TLB 2: hits at 2, 3, 4 and 6.                    | Every access is on page 1 or page 0: each page misses once, then hits.                            |
| E3  | Make a page come back from disk after being evicted.      | Preset _Memoria llena_: page 0 is evicted at access 2 and faults again at access 5. | With no free frames, FIFO evicts the oldest page even if it will be needed again.                 |
| E4  | Make the run stop at the first access.                    | First access 100 (page 6, invalid).                                                 | An invalid page ends the process; there is nothing to load.                                       |

## Check

| #   | Question                                                                                                | Answer                                                                                       | Targets |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------- |
| C1  | A program accesses a valid page that is on disk. What happens?                                          | Page fault: the OS loads it into a frame and the access completes.                           | M1      |
| C2  | Two accesses in a row to the same page, with a TLB. How many page-table reads does the second one need? | None: it hits the TLB.                                                                       | M2      |
| C3  | 16-byte pages; virtual address 37 maps to frame 5. What is the physical address?                        | 5 × 16 + 5 = 85 (page 2, offset 5).                                                          | M3      |
| C4  | The OS evicts page 4 to disk. What must happen to page 4's TLB entry?                                   | It must be removed; otherwise the TLB would point to a frame that now holds another page.    | M5      |
| C5  | Page 0 was evicted to disk. The program accesses it again. What happens?                                | A page fault brings it back into some free or freed frame.                                   | M6      |
| C6  | Why do real systems use multi-level page tables?                                                        | A flat table for a 48-bit address space would be huge; levels only exist for the used parts. | Explain |

## Engine behavior

### Inputs and limits

| Field      | Range                                                                                                     | Default |
| ---------- | --------------------------------------------------------------------------------------------------------- | ------- |
| `pageSize` | 8, 16, 32 or 64                                                                                           | preset  |
| `pages`    | 2–8 entries, page _k_ at index _k_: `{ kind: "frame", frame }`, `{ kind: "disk" }`, `{ kind: "invalid" }` | preset  |
| `frames`   | 2–6; frames used by `pages` must be distinct and below `frames`                                           | preset  |
| `tlbSize`  | 0–4 (0: no TLB)                                                                                           | 2       |
| `accesses` | 1–10 virtual addresses, each 0 ≤ address < `pages.length × pageSize`                                      | preset  |

### Rules

For each access, in order (one step per access, `t` = access index from 0):

1. Split: `page = ⌊address / pageSize⌋`, `offset = address mod pageSize` (`split`).
2. If `tlbSize > 0`, look the page up in the TLB (cost 1). Hit: the entry becomes the most recently used (`tlb.hit`), go to 5. Miss: `tlb.miss`.
3. Read the page-table entry (cost 100).
   - Frame: `pt.hit`.
   - Invalid: `segfault`. The step ends here and the trace stops (no more accesses).
   - Disk: `fault` (cost 10 000). If some frame is free, take the lowest-numbered free frame. Otherwise evict the frame loaded longest ago (FIFO; frames mapped at the start count as loaded in increasing frame order, before any fault): its page goes back to disk (`evict`), and if that page is in the TLB its entry is removed (`tlb.drop`). Load the page into the frame (`load`); the frame becomes the newest in FIFO order.
4. If `tlbSize > 0`: if the TLB is full, remove the least recently used entry (`tlb.evict`); then add the translation as the most recently used (`tlb.fill`).
5. Access the data (cost 100): physical address = `frame × pageSize + offset` (`access`).

Outcomes: `hit` (TLB hit), `miss` (TLB miss or no TLB, page in memory), `fault`, `invalid`. Step cost is the sum of the costs above.

### Explanation keys

| Key         | Params                                | Example (es)                                                                                            | Example (en)                                                                                    |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `split`     | `addr`, `page`, `offset`              | La dirección virtual 70 es la página 4, desplazamiento 6.                                               | Virtual address 70 is page 4, offset 6.                                                         |
| `tlb.hit`   | `page`, `frame`                       | La TLB ya sabe dónde está la página 4: marco 1. No hace falta leer la tabla de páginas.                 | The TLB already knows where page 4 is: frame 1. No page table read needed.                      |
| `tlb.miss`  | `page`                                | La página 4 no está en la TLB: hay que leer la tabla de páginas.                                        | Page 4 is not in the TLB: the page table must be read.                                          |
| `pt.hit`    | `page`, `frame`                       | La tabla de páginas dice que la página 1 está en el marco 0.                                            | The page table says page 1 is in frame 0.                                                       |
| `fault`     | `page`                                | Fallo de página: la página 4 es válida pero está en disco. El sistema operativo la carga.               | Page fault: page 4 is valid but on disk. The operating system loads it.                         |
| `evict`     | `page`, `frame`                       | No hay marcos libres: la página 0 sale del marco 0 y vuelve al disco.                                   | No free frames: page 0 leaves frame 0 and goes back to disk.                                    |
| `tlb.drop`  | `page`                                | La TLB olvida la página 0: su marco ya es de otra página.                                               | The TLB forgets page 0: its frame now belongs to another page.                                  |
| `load`      | `page`, `frame`                       | La página 4 se carga en el marco 1 y la tabla de páginas se actualiza.                                  | Page 4 is loaded into frame 1 and the page table is updated.                                    |
| `segfault`  | `page`                                | La página 5 no pertenece al programa: el sistema operativo termina el programa (violación de segmento). | Page 5 is not part of the program: the operating system kills the program (segmentation fault). |
| `tlb.evict` | `page`                                | La TLB está llena: olvida la página 4, la usada hace más tiempo.                                        | The TLB is full: it forgets page 4, the least recently used.                                    |
| `tlb.fill`  | `page`, `frame`                       | La TLB guarda la traducción página 1 → marco 0.                                                         | The TLB stores the translation page 1 → frame 0.                                                |
| `access`    | `frame`, `offset`, `pageSize`, `phys` | Dirección física: marco 1 × 16 + 6 = 22.                                                                | Physical address: frame 1 × 16 + 6 = 22.                                                        |

### Result

Per access: virtual address, page, offset, outcome, frame (null when invalid), physical address (null when invalid), cost. Totals: `hits`, `misses`, `faults`, `invalid` (bool), `cost`, `accessesRun`. Final page table, TLB (least recently used first) and frame contents.

## Expected results (hand-computed)

Accesses are numbered from 1 in prose; tables use the same numbering.

### Preset: Recorrido (page size 16, 4 frames, TLB 2)

Page table: p0 f2, p1 f0, p2 disk, p3 f3, p4 disk, p5 invalid, p6 invalid, p7 disk.

| #   | Address | Page | Offset | Outcome | Frame | Physical | Cost   | TLB after (LRU first) |
| --- | ------- | ---- | ------ | ------- | ----- | -------- | ------ | --------------------- |
| 1   | 20      | 1    | 4      | miss    | 0     | 4        | 201    | p1                    |
| 2   | 25      | 1    | 9      | hit     | 0     | 9        | 101    | p1                    |
| 3   | 70      | 4    | 6      | fault   | 1     | 22       | 10 201 | p1, p4                |
| 4   | 23      | 1    | 7      | hit     | 0     | 7        | 101    | p4, p1                |
| 5   | 3       | 0    | 3      | miss    | 2     | 35       | 201    | p1, p0 (p4 evicted)   |
| 6   | 90      | 5    | 10     | invalid | —     | —        | 101    | p1, p0                |

Hits 2, misses 2, faults 1, invalid. Total cost 10 906. Keys of access 3: `split`, `tlb.miss`, `fault`, `load` (p4 → f1), `tlb.fill`, `access`. Keys of access 5: `split`, `tlb.miss`, `pt.hit`, `tlb.evict` (p4), `tlb.fill`, `access`. Keys of access 6: `split`, `tlb.miss`, `segfault`.

| Variant                          | Outcomes                               | Cost                                          |
| -------------------------------- | -------------------------------------- | --------------------------------------------- |
| TLB 0                            | miss, miss, fault, miss, miss, invalid | 200 + 200 + 10 200 + 200 + 200 + 100 = 11 100 |
| TLB 1                            | miss, hit, fault, miss, miss, invalid  | 201 + 101 + 10 201 + 201 + 201 + 101 = 11 006 |
| TLB 4                            | miss, hit, fault, hit, miss, invalid   | 10 906 (no TLB eviction)                      |
| E2 accesses 20, 25, 23, 30, 3, 6 | miss, hit, hit, hit, miss, hit         | 201 + 101 + 101 + 101 + 201 + 101 = 806       |

With TLB 0 there are no TLB keys: each step goes `split`, then `pt.hit`, `fault` or `segfault`.

### Preset: Memoria llena (page size 16, 3 frames, TLB 2)

Page table: p0 f0, p1 f1, p2 f2, p3 disk, p4 disk, p5–p7 invalid. FIFO order at the start: f0, f1, f2.

| #   | Address | Page | Outcome | What happens                                                  | Physical | Cost   | TLB after |
| --- | ------- | ---- | ------- | ------------------------------------------------------------- | -------- | ------ | --------- |
| 1   | 5       | 0    | miss    | p0 in f0                                                      | 5        | 201    | p0        |
| 2   | 50      | 3    | fault   | evict p0 from f0, drop p0 from the TLB, load p3 into f0       | 2        | 10 201 | p3        |
| 3   | 18      | 1    | miss    | p1 in f1                                                      | 18       | 201    | p3, p1    |
| 4   | 70      | 4    | fault   | evict p1 from f1, drop p1, load p4 into f1                    | 22       | 10 201 | p3, p4    |
| 5   | 2       | 0    | fault   | evict p2 from f2 (not in TLB), load p0 into f2; TLB evicts p3 | 34       | 10 201 | p4, p0    |

Hits 0, misses 2, faults 3, no invalid access. Total 31 005. Final page table: p0 f2, p1 disk, p2 disk, p3 f0, p4 f1. Keys of access 2: `split`, `tlb.miss`, `fault`, `evict` (p0, f0), `tlb.drop` (p0), `load` (p3, f0), `tlb.fill`, `access`.

### External cross-check

`src/engines/published-traces.test.ts` replays OSTEP §19.2 (an array of ten 4-byte ints from address 100, 16-byte pages), shifted down two pages to fit 8 pages: TLB activity miss, hit, hit, miss, hit, hit, hit, miss, hit, hit, a 70% hit rate, as in the book.

### Edge cases

| Case                 | Input                   | Expected                                                      |
| -------------------- | ----------------------- | ------------------------------------------------------------- |
| Invalid first access | Recorrido, accesses 100 | One step: page 6, `segfault`; cost 101; 0 accesses completed. |
| Address out of range | Recorrido, access 128   | `RangeError`.                                                 |
| Frame used twice     | p0 f1, p1 f1            | `RangeError`.                                                 |

## Go deeper (optional section)

- Multi-level page tables walked by hand; inverted page tables.
- Copy-on-write after `fork()` and memory-mapped files, both built on page faults.
- Minor vs major faults (`/usr/bin/time -v`, `perf stat -e page-faults`).
- TLB shootdowns on multicore machines.

## References

- Arpaci-Dusseau and Arpaci-Dusseau, _Operating Systems: Three Easy Pieces_, ch. 18 "Paging: Introduction", ch. 19 "Paging: Faster Translations (TLBs)", ch. 20 "Paging: Smaller Tables" and ch. 21 "Beyond Physical Memory: Mechanisms". Free at https://pages.cs.wisc.edu/~remzi/OSTEP/
- Silberschatz, Galvin and Gagne, _Operating System Concepts_, 10th ed., §9.3 "Paging" and §10.2 "Demand Paging".
- Linux kernel documentation, "5-level paging": https://docs.kernel.org/arch/x86/x86_64/5level-paging.html

## Translations

| Language | File                                | Status               |
| -------- | ----------------------------------- | -------------------- |
| es       | `src/content/lessons/es/paging.mdx` | Reviewed, 2026-11-04 |
| en       | `src/content/lessons/en/paging.mdx` | Reviewed, 2026-11-04 |
