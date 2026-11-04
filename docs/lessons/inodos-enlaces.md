# Lesson spec: File systems: inodes and links

| Field          | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| Id             | `inodos-enlaces`                                            |
| Path / module  | Operating systems (`sistemas-operativos`) / 8, File systems |
| Engine         | `src/engines/file-system/`                                  |
| Estimated time | 30 minutes                                                  |
| Status         | Written                                                     |

The simulation is a **three-layer file system board**: the directory (names), the inode table (one card per inode with type, link count, open count, size and block pointers) and the data blocks (a grid of tiny 4-byte blocks), with the inode and data bitmaps above them. The learner runs a script of shell-like operations (`create`, `write`, `link`, `symlink`, `unlink`, `open`, `close`, `cat`, `read`, `rename`) one per step and watches which layer each one touches. Arrows go from names to inodes and from inodes to blocks, so "two names, one inode" and "a symlink that points to a name, not to an inode" are visible.

## Learning objectives

By the end of the lesson the learner can:

1. Tell apart a file's name (a directory entry), its inode (metadata and block pointers) and its data blocks.
2. Trace `create`, `write`, `link`, `symlink`, `unlink`, `open`, `close` and `rename` on the directory, the inode table and the bitmaps.
3. Predict when an inode and its blocks are freed: when its link count is 0 **and** no process has it open.
4. Explain the difference between a hard link and a symbolic link, including what a dangling symbolic link is.
5. Relate the model to real tools: `ls -li`, `stat`, `df -i` and `lsof +L1`.

## Prerequisites

- Processes (lesson `procesos-estados`).
- Disk blocks and allocation as "fixed-size pieces of storage", as in pages and frames (lesson `paginacion` helps but is not required).

## Misconceptions targeted

| #   | Misconception                                             | Where it is exposed                          |
| --- | --------------------------------------------------------- | -------------------------------------------- |
| M1  | A file's name is the file.                                | Theory; Predict; Check C6                    |
| M2  | A hard link is a copy of the file.                        | Predict (`copia.txt`); Run, step 3; Check C1 |
| M3  | `rm` (unlink) erases the data at once.                    | Experiment E1 (open file); Check C2, C3      |
| M4  | A symbolic link keeps its target alive, like a hard link. | Predict (`atajo`); Run, step 7; Check C4     |
| M5  | Renaming a file moves or copies its data.                 | Experiment E4; Check C5                      |
| M6  | The inode stores the file's name.                         | Theory; Explain; Check C6                    |

## Minimal theory (before Predict)

- A file system splits the disk into **blocks** (here 4 bytes each; 4 KiB in real systems).
- Every file has an **inode**, identified by its number: type (file, directory, symbolic link), size, **link count**, and pointers to its data blocks. The inode does **not** store the name.
- A **directory** is a special file whose content is a list of entries `name → inode number`. Here there is only one directory, the root `/`, inode 0, stored in block 0.
- Two **bitmaps** say which inodes and which data blocks are in use (1) or free (0). New inodes and blocks take the lowest free number.
- Operations:
  - `create name`: new inode, empty file, new entry. Fails if the name exists (like `open` with `O_CREAT | O_EXCL`).
  - `write name text`: replaces the content: frees the old blocks, takes ⌈length ÷ 4⌉ new ones.
  - `link old new` (`ln old new`): a **hard link**: a new entry for the **same** inode; its link count goes up.
  - `symlink target new` (`ln -s target new`): a **symbolic link**: a new inode whose content is the **name** `target`.
  - `unlink name` (`rm name`): removes the entry; the link count goes down.
  - `open name` gives a **file descriptor** (3, 4, …); `close fd` returns it. `cat name` reads through the name; `read fd` reads through a descriptor.
  - `rename old new` (`mv old new`): changes the entry's name.
- One worked example: `create a`, then `write a "hey"`: inode 1, size 3, block 1 holds `hey`.

## Predict

- **Setup**: preset _Enlaces_:
  1. `create notas.txt`
  2. `write notas.txt "hola mundo"`
  3. `link notas.txt copia.txt`
  4. `symlink notas.txt atajo`
  5. `unlink notas.txt`
  6. `cat copia.txt`
  7. `cat atajo`

- **Questions**: "What does step 6 show?" and "What does step 7 show?" Options for each: `hola mundo`, an empty file, an error.
- **Correct answers**: step 6 shows `hola mundo`; step 7 is an error: `atajo` points to the name `notas.txt`, which no longer exists.
- **Naive answers and why they fail**:
  - Step 6 as an error, or as a copy that happens to survive (M1, M2): `copia.txt` is a second name for inode 1; removing `notas.txt` lowers the link count from 2 to 1 and nothing else.
  - Step 7 as `hola mundo` (M4): a symbolic link stores a name, not an inode number. Resolving `atajo` looks up `notas.txt` in the directory, and it is gone.

## Run

- **Default setup**: _Enlaces_.
- **Moments to watch**:
  - Step 2: three blocks (`hola`, ` mun`, `do`), all pointed to by inode 1.
  - Step 3: no block or inode is allocated; inode 1's link count becomes 2.
  - Step 5: the entry disappears; inode 1 and its blocks stay.
  - Step 7: the lookup of `notas.txt` fails: dangling symbolic link.

## Explain (depth after the run)

- **Name, inode, blocks** (M1, M6): the directory maps names to numbers; the inode holds everything else. `ls -i` prints inode numbers; `stat` prints the link count.
- **Hard links** (M2): every name is equally "the" file; there is no original and copy. A hard link cannot cross file systems (inode numbers are per file system), and most systems forbid hard links to directories to keep the tree free of cycles.
- **When data is freed** (M3): only when the link count reaches 0 and no descriptor is open. A process can keep reading a file after it is deleted; the space returns at `close` (preset _Archivo abierto_). `lsof +L1` lists such open, deleted files; on Linux they also show as `(deleted)` under `/proc/<pid>/fd`.
- **Symbolic links** (M4): a small file whose content is a path. They can cross file systems and point to directories, but nothing keeps their target alive. ext4 stores short targets (under 60 bytes) directly in the inode ("fast symlinks"), as this simulator does.
- **Rename** (M5): `mv` within one file system rewrites a directory entry; the inode number and every block stay put, which is why moving a 10 GB file is instant.
- **Inodes run out too**: `df -i` shows inode usage. Many tiny files can exhaust inodes while blocks are still free.
- **Real layouts**: ext4 uses 256-byte inodes and 4 KiB blocks, and describes file data with **extents** (start block plus length) instead of one pointer per block. The ext2/ext3 inode (like BSD FFS) has 12 direct pointers plus single, double and triple indirect blocks.

## Experiment

| #   | Challenge                                                         | One valid solution                                                                            | Why it works                                                         |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| E1  | Read a file's data after every one of its names has been removed. | Preset _Archivo abierto_: `read 3` after `unlink log.txt` shows `datos`.                      | The descriptor points to the inode, which lives while it is open.    |
| E2  | Free the blocks of a file that has two names.                     | _Enlaces_, then `unlink copia.txt`: inode 1 and blocks 1–3 are freed.                         | The link count reaches 0 and nothing has it open.                    |
| E3  | Make `atajo` work again without touching it.                      | _Enlaces_ steps 1–5, then `create notas.txt`, `write notas.txt "otra"`, `cat atajo` → `otra`. | The symbolic link resolves the name again; it finds the new inode 3. |
| E4  | Show that renaming does not touch data.                           | `rename copia.txt final.txt` after step 5: still inode 1, blocks 1–3.                         | Only the directory entry changes.                                    |

## Check

| #   | Question                                                                         | Answer                                                                     | Targets |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------- |
| C1  | `ln a b` (hard link). How many inodes and how many copies of the data now exist? | One inode, one copy of the data, two names.                                | M2      |
| C2  | A file has link count 2. You run `rm` on one of its names. Are its blocks freed? | No: the link count drops to 1.                                             | M3      |
| C3  | A process has a file open; you `rm` its only name. When is the space returned?   | When the process closes it (link count 0 and no open descriptors).         | M3      |
| C4  | `ln -s a b`, then `rm a`. What does `cat b` do?                                  | Fails: `b` points to the name `a`, which no longer exists (dangling link). | M4      |
| C5  | `mv grande.iso copia.iso` on the same file system. What changes?                 | Only the directory entry; the inode and its blocks stay the same.          | M5      |
| C6  | Where is a file's name stored?                                                   | In the directory entry, not in the inode.                                  | M1, M6  |

## Engine behavior

### Inputs and limits

| Field    | Range                                            | Default   |
| -------- | ------------------------------------------------ | --------- |
| `script` | 1–12 operations                                  | _Enlaces_ |
| names    | 1–12 characters from `a–z`, `0–9`, `.`, `_`, `-` | —         |
| text     | 0–12 characters                                  | —         |
| fd       | integer 3–9                                      | —         |

Fixed geometry: 8 inodes (inode 0 is the root directory), 12 data blocks of 4 bytes (block 0 holds the root directory), at most 8 directory entries. A structurally invalid script (unknown operation, bad name, text too long) throws a `RangeError`. Operations that fail at run time (missing name, full disk…) emit an `error.*` key and change nothing.

### Rules

- **Resolve** a name: look up the entry. If its inode is a symbolic link, resolve its target name again, following at most 4 links. A missing name along the way is a dangling link (`error.dangling`, naming the missing name). Needing a fifth link is reported as `error.loop`, like `ELOOP` on Linux (which allows 40): a cycle of links always ends there. `cat.via` names the target stored in the first link.
- `create name`: fails with `error.exists` if the entry exists, `error.dirFull` if 8 entries exist, `error.noInodes` if no inode is free. Else take the lowest free inode: type file, links 1, open 0, size 0, no blocks; add the entry (`create`).
- `write name text`: resolve (`error.missing` / `error.dangling`). Needs ⌈len / 4⌉ blocks; fails with `error.noSpace` if the free blocks plus the file's current blocks are fewer. Else free its current blocks (`free.blocks`, only if it had any), take the lowest free blocks in increasing order, store the text 4 characters per block, size = length (`write`).
- `link old new`: `old` must exist (not resolved: linking a symbolic link links the link itself); `new` must not exist; directory not full. New entry to the same inode, links + 1 (`link`).
- `symlink target new`: `new` must not exist; directory not full; an inode must be free. New inode: type symlink, links 1, content = `target` stored in the inode (no blocks), size = length of `target` (`symlink`). The target need not exist.
- `unlink name`: entry must exist. Remove it; links − 1. Then:
  - symbolic link with links = 0: free its inode (`unlink.symlink`); a symbolic link that still has another name (a hard link to the link) follows the next rule;
  - links > 0: `unlink.keep`;
  - links = 0 and open > 0: the inode stays as an orphan (`unlink.orphan`);
  - links = 0 and open = 0: free the inode and its blocks (`unlink.free`).
- `open name`: resolve; take the lowest unused descriptor from 3; open + 1 (`open`).
- `close fd`: the descriptor must exist (`error.badFd`). Open − 1; if links = 0 and open = 0, free the inode and blocks (`close.free`), else `close.keep`.
- `cat name`: resolve; output the content (`cat`, or `cat.via` when a symbolic link was followed, naming the final target).
- `read fd`: the descriptor must exist; output the content of its inode (`read`).
- `rename old new`: `old` must exist, `new` must not; change the entry's name in place (`rename`).

### Explanation keys

| Key              | Params                               | Example (es)                                                                                                                    | Example (en)                                                                                                                 |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `create`         | `name`, `inode`                      | Se crea el inodo 1, un archivo vacío, y el directorio anota notas.txt → 1.                                                      | Inode 1 is created, an empty file, and the directory records notas.txt → 1.                                                  |
| `free.blocks`    | `inode`, `blocks`                    | Se liberan los bloques 1, 2, 3 del inodo 1.                                                                                     | Blocks 1, 2, 3 of inode 1 are freed.                                                                                         |
| `write`          | `name`, `inode`, `size`, `blocks`    | notas.txt (inodo 1) ahora tiene 10 bytes en los bloques 1, 2, 3.                                                                | notas.txt (inode 1) now holds 10 bytes in blocks 1, 2, 3.                                                                    |
| `link`           | `name`, `target`, `inode`, `links`   | copia.txt es otro nombre para el inodo 1, el mismo de notas.txt. Su contador de enlaces sube a 2. No se copia ningún dato.      | copia.txt is another name for inode 1, the same as notas.txt. Its link count rises to 2. No data is copied.                  |
| `symlink`        | `name`, `target`, `inode`            | atajo es un inodo nuevo (2), un enlace simbólico que guarda el nombre notas.txt, no un número de inodo.                         | atajo is a new inode (2), a symbolic link that stores the name notas.txt, not an inode number.                               |
| `unlink.keep`    | `name`, `inode`, `links`             | Se borra la entrada notas.txt. El inodo 1 sigue vivo: le queda 1 enlace.                                                        | The entry notas.txt is removed. Inode 1 lives on: 1 link left.                                                               |
| `unlink.orphan`  | `name`, `inode`                      | Se borra la entrada log.txt. El inodo 1 ya no tiene nombres, pero está abierto: sus datos siguen hasta que se cierre.           | The entry log.txt is removed. Inode 1 has no names left, but it is open: its data stays until it is closed.                  |
| `unlink.free`    | `name`, `inode`, `blocks`            | Se borra la entrada copia.txt. El inodo 1 ya no tiene nombres ni está abierto: se liberan el inodo y los bloques 1, 2, 3.       | The entry copia.txt is removed. Inode 1 has no names and is not open: the inode and blocks 1, 2, 3 are freed.                |
| `unlink.symlink` | `name`, `inode`                      | Se borra el enlace simbólico atajo y su inodo 2. El archivo al que apuntaba no cambia.                                          | The symbolic link atajo and its inode 2 are removed. The file it pointed to does not change.                                 |
| `open`           | `name`, `inode`, `fd`                | El proceso abre log.txt (inodo 1) y recibe el descriptor 3.                                                                     | The process opens log.txt (inode 1) and gets descriptor 3.                                                                   |
| `close.keep`     | `fd`, `inode`                        | Se cierra el descriptor 3. El inodo 1 sigue: todavía tiene nombres u otros descriptores.                                        | Descriptor 3 is closed. Inode 1 stays: it still has names or other descriptors.                                              |
| `close.free`     | `fd`, `inode`, `blocks`              | Se cierra el descriptor 3, el último del inodo 1, que ya no tenía nombres: se liberan el inodo y los bloques 1, 2.              | Descriptor 3 is closed, the last one for inode 1, which had no names: the inode and blocks 1, 2 are freed.                   |
| `cat`            | `name`, `inode`, `content`           | cat copia.txt sigue el nombre hasta el inodo 1 y lee «hola mundo».                                                              | cat copia.txt follows the name to inode 1 and reads "hola mundo".                                                            |
| `cat.via`        | `name`, `target`, `inode`, `content` | atajo apunta al nombre notas.txt, que lleva al inodo 3: se lee «otra».                                                          | atajo points to the name notas.txt, which leads to inode 3: it reads "otra".                                                 |
| `read`           | `fd`, `inode`, `content`             | Leer por el descriptor 3 llega directo al inodo 1, aunque ya no tenga nombre: «datos».                                          | Reading through descriptor 3 goes straight to inode 1, even with no name left: "datos".                                      |
| `rename`         | `name`, `to`, `inode`                | copia.txt pasa a llamarse final.txt. Solo cambia la entrada del directorio: el inodo 1 y sus bloques no se mueven.              | copia.txt is renamed final.txt. Only the directory entry changes: inode 1 and its blocks stay put.                           |
| `error.exists`   | `name`                               | Error: ya existe una entrada llamada notas.txt.                                                                                 | Error: an entry named notas.txt already exists.                                                                              |
| `error.missing`  | `name`                               | Error: no existe ninguna entrada llamada notas.txt.                                                                             | Error: there is no entry named notas.txt.                                                                                    |
| `error.dangling` | `name`, `target`                     | Error: atajo lleva al nombre notas.txt, pero ese nombre no existe. Es un enlace colgante.                                       | Error: atajo leads to the name notas.txt, but no entry has that name. It is a dangling link.                                 |
| `error.loop`     | `name`, `hops`                       | Error: seguir los enlaces desde a pide más de 4 saltos, probablemente un ciclo. El sistema se rinde (en Linux, el error ELOOP). | Error: following the links from a takes more than 4 hops, probably a cycle. The system gives up (on Linux, the ELOOP error). |
| `error.noInodes` | —                                    | Error: no queda ningún inodo libre.                                                                                             | Error: no inode is free.                                                                                                     |
| `error.noSpace`  | `name`                               | Error: no hay bloques libres suficientes para escribir en notas.txt.                                                            | Error: there are not enough free blocks to write to notas.txt.                                                               |
| `error.dirFull`  | `name`                               | Error: el directorio está lleno; no cabe notas.txt.                                                                             | Error: the directory is full; notas.txt does not fit.                                                                        |
| `error.badFd`    | `fd`                                 | Error: el descriptor 4 no está abierto.                                                                                         | Error: descriptor 4 is not open.                                                                                             |

`blocks` is a comma-separated list such as `1, 2, 3`, or an empty string when the file had no blocks; `content` may be empty. The templates handle both (an empty file reads as "an empty file").

### Result

`outputs`: one entry per `cat` or `read` step (step index, kind `content` or `error`, content). `errors`: steps that ended in an `error.*` key. Final inodes in use, blocks in use and directory entries.

## Expected results (hand-computed)

Steps are numbered from 1. Bitmaps list the numbers in use.

### Preset: Enlaces

| #   | Operation                      | Directory after                   | Inodes in use (links) | Blocks in use | Key / output                       |
| --- | ------------------------------ | --------------------------------- | --------------------- | ------------- | ---------------------------------- |
| 1   | `create notas.txt`             | notas.txt→1                       | 0, 1 (1)              | 0             | `create` notas.txt, inode 1        |
| 2   | `write notas.txt "hola mundo"` | same                              | 0, 1 (1)              | 0, 1, 2, 3    | `write`, size 10, blocks `1, 2, 3` |
| 3   | `link notas.txt copia.txt`     | notas.txt→1, copia.txt→1          | 0, 1 (2)              | 0, 1, 2, 3    | `link`, links 2                    |
| 4   | `symlink notas.txt atajo`      | notas.txt→1, copia.txt→1, atajo→2 | 0, 1 (2), 2 (1)       | 0, 1, 2, 3    | `symlink`, inode 2                 |
| 5   | `unlink notas.txt`             | copia.txt→1, atajo→2              | 0, 1 (1), 2 (1)       | 0, 1, 2, 3    | `unlink.keep`, links 1             |
| 6   | `cat copia.txt`                | same                              | same                  | same          | `cat`, content `hola mundo`        |
| 7   | `cat atajo`                    | same                              | same                  | same          | `error.dangling` atajo → notas.txt |

Block contents after step 2: block 1 `hola`, block 2 ` mun`, block 3 `do`. Inode 2 has size 9 (length of `notas.txt`) and no blocks.

### Preset: Archivo abierto

| #   | Operation               | Inode 1 after (links, open) | Blocks in use | Key / output                         |
| --- | ----------------------- | --------------------------- | ------------- | ------------------------------------ |
| 1   | `create log.txt`        | (1, 0)                      | 0             | `create`                             |
| 2   | `write log.txt "datos"` | (1, 0), size 5              | 0, 1, 2       | `write`, blocks `1, 2` (`dato`, `s`) |
| 3   | `open log.txt`          | (1, 1)                      | 0, 1, 2       | `open`, fd 3                         |
| 4   | `unlink log.txt`        | (0, 1), orphan              | 0, 1, 2       | `unlink.orphan`                      |
| 5   | `read 3`                | (0, 1)                      | 0, 1, 2       | `read`, content `datos`              |
| 6   | `close 3`               | free                        | 0             | `close.free`, blocks `1, 2`          |
| 7   | `create nuevo.txt`      | (1, 0), reused number       | 0             | `create`, inode 1                    |

### Experiment scripts

| Case | Script                                                                              | Expected                                                                                 |
| ---- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| E2   | _Enlaces_ steps 1–5, then `unlink copia.txt`                                        | `unlink.free` inode 1, blocks `1, 2, 3`. In use afterwards: inodes 0, 2; blocks 0.       |
| E3   | _Enlaces_ steps 1–5, then `create notas.txt`, `write notas.txt "otra"`, `cat atajo` | `create` inode 3; `write` block 4; `cat.via` atajo → notas.txt, inode 3, content `otra`. |
| E4   | _Enlaces_ steps 1–5, then `rename copia.txt final.txt`                              | Directory final.txt→1, atajo→2; inode 1 still has blocks 1, 2, 3.                        |

### External cross-check

`src/engines/published-traces.test.ts` replays OSTEP §39.14–39.15: link counts 1, 2, 3, 2, 1 as `file`, `file2`, `file3` are linked and removed, the last name still reads `hello`; a symbolic link to `file` is 4 bytes and fails after `rm file` (a dangling reference).

### Edge cases

| Case                   | Script                                                                                                                                                 | Expected                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Overwrite              | `create a`, `write a "abcdefgh"`, `write a "xy"`                                                                                                       | Step 2 blocks `1, 2`; step 3 `free.blocks` `1, 2`, then `write` block `1` (`xy`).                                                   |
| Empty write            | `create a`, `write a ""`                                                                                                                               | `write` size 0, blocks `` (empty); no blocks in use besides 0.                                                                      |
| Errors change nothing  | `create a`, `create a`, `read 4`, `cat b`                                                                                                              | `error.exists` a, `error.badFd` 4, `error.missing` b; one file, inode 1.                                                            |
| Out of inodes          | `create` 8 different names (`a` … `h`)                                                                                                                 | The first 7 take inodes 1–7; the 8th fails with `error.noInodes`.                                                                   |
| Directory full         | `create a`, then `link a b` … `link a h` (7 links), then `link a i`                                                                                    | 8 entries, inode 1 with 8 links; the last link fails with `error.dirFull`.                                                          |
| Out of blocks          | `create a`, `write a "123456789012"`, `create b`, `write b "123456789012"`, `create c`, `write c "123456789012"`, `create d`, `write d "123456789012"` | a, b, c take 3 blocks each (9 of 11); d needs 3 with 2 free: `error.noSpace` d.                                                     |
| Hard link to a symlink | `create a`, `symlink a s`, `link s t`, `unlink s`, `cat t`                                                                                             | Step 3 `link` t → inode 2 (the symlink), links 2. Step 4 `unlink.keep` s, inode 2, links 1. Step 5 `cat.via` t → a, inode 1, empty. |
| Symlink cycle          | `symlink b a`, `symlink a b`, `cat a`                                                                                                                  | Step 3 `error.loop` a, 4 hops.                                                                                                      |
| Chain of links         | `create x`, then `s1`→x, `s2`→s1 … `sn`→s(n−1), `cat sn`                                                                                               | n = 4: `cat.via` s4, target s3, inode 1. n = 5: `error.loop` s5.                                                                    |
| Invalid script         | `create Notas` (uppercase), or a 13-character text                                                                                                     | `RangeError`.                                                                                                                       |

## Go deeper (optional section)

- Subdirectories, `.` and `..`, and why a directory's link count is 2 plus its subdirectories.
- Journaling and crash consistency: what happens if the power fails between updating the bitmap and the inode.
- ext4 extents and indirect blocks: how big a file can one inode describe.
- Copy-on-write file systems (Btrfs, ZFS) and reflinks: copies that share blocks until written.

## References

- Arpaci-Dusseau and Arpaci-Dusseau, _Operating Systems: Three Easy Pieces_, ch. 39 "Interlude: Files and Directories" (§39.14 "Hard Links", §39.15 "Symbolic Links") and ch. 40 "File System Implementation". Free at https://pages.cs.wisc.edu/~remzi/OSTEP/
- Silberschatz, Galvin and Gagne, _Operating System Concepts_, 10th ed., ch. 13 "File-System Interface" and ch. 14 "File-System Implementation".
- `unlink(2)` and `symlink(7)` manual pages: https://man7.org/linux/man-pages/man2/unlink.2.html
- Linux kernel documentation, "ext4 Data Structures and Algorithms" (inodes, extents, fast symlinks): https://docs.kernel.org/filesystems/ext4/

## Translations

| Language | File                                        | Status               |
| -------- | ------------------------------------------- | -------------------- |
| es       | `src/content/lessons/es/inodos-enlaces.mdx` | Reviewed, 2026-11-04 |
| en       | `src/content/lessons/en/inodos-enlaces.mdx` | Reviewed, 2026-11-04 |
