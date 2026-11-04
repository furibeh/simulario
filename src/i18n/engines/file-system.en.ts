import type { FsExplainParams } from "../../engines/file-system/types";
import type { ExplainTemplates } from "./types";

const quote = (text: string) => (text === "" ? "an empty file" : `"${text}"`);
const blocksOf = (blocks: string) => (blocks === "" ? "" : ` and blocks ${blocks}`);

export const fileSystemEn: ExplainTemplates<FsExplainParams> = {
  create: ({ name, inode }) =>
    `Inode ${inode} is created, an empty file, and the directory records ${name} → ${inode}.`,
  "free.blocks": ({ inode, blocks }) => `Blocks ${blocks} of inode ${inode} are freed.`,
  write: ({ name, inode, size, blocks }) =>
    size === 0
      ? `${name} (inode ${inode}) is now empty: it uses no blocks.`
      : `${name} (inode ${inode}) now holds ${size} ${size === 1 ? "byte" : "bytes"} in ${blocks.includes(",") ? "blocks" : "block"} ${blocks}.`,
  link: ({ name, target, inode, links }) =>
    `${name} is another name for inode ${inode}, the same as ${target}. Its link count rises to ${links}. No data is copied.`,
  symlink: ({ name, target, inode }) =>
    `${name} is a new inode (${inode}), a symbolic link that stores the name ${target}, not an inode number.`,
  "unlink.keep": ({ name, inode, links }) =>
    `The entry ${name} is removed. Inode ${inode} lives on: ${links === 1 ? "1 link" : `${links} links`} left.`,
  "unlink.orphan": ({ name, inode }) =>
    `The entry ${name} is removed. Inode ${inode} has no names left, but it is open: its data stays until it is closed.`,
  "unlink.free": ({ name, inode, blocks }) =>
    `The entry ${name} is removed. Inode ${inode} has no names and is not open: the inode${blocksOf(blocks)} are freed.`,
  "unlink.symlink": ({ name, inode }) =>
    `The symbolic link ${name} and its inode ${inode} are removed. The file it pointed to does not change.`,
  open: ({ name, inode, fd }) =>
    `The process opens ${name} (inode ${inode}) and gets descriptor ${fd}.`,
  "close.keep": ({ fd, inode }) =>
    `Descriptor ${fd} is closed. Inode ${inode} stays: it still has names or other descriptors.`,
  "close.free": ({ fd, inode, blocks }) =>
    `Descriptor ${fd} is closed, the last one for inode ${inode}, which had no names: the inode${blocksOf(blocks)} are freed.`,
  cat: ({ name, inode, content }) =>
    `cat ${name} follows the name to inode ${inode} and reads ${quote(content)}.`,
  "cat.via": ({ name, target, inode, content }) =>
    `${name} points to the name ${target}, which leads to inode ${inode}: it reads ${quote(content)}.`,
  read: ({ fd, inode, content }) =>
    `Reading through descriptor ${fd} goes straight to inode ${inode}, even with no name left: ${quote(content)}.`,
  rename: ({ name, to, inode }) =>
    `${name} is renamed ${to}. Only the directory entry changes: inode ${inode} and its blocks stay put.`,
  "error.exists": ({ name }) => `Error: an entry named ${name} already exists.`,
  "error.missing": ({ name }) => `Error: there is no entry named ${name}.`,
  "error.dangling": ({ name, target }) =>
    `Error: ${name} leads to the name ${target}, but no entry has that name. It is a dangling link.`,
  "error.loop": ({ name, hops }) =>
    `Error: following the links from ${name} takes more than ${hops} hops, probably a cycle. The system gives up (on Linux, the ELOOP error).`,
  "error.noInodes": () => "Error: no inode is free.",
  "error.noSpace": ({ name }) => `Error: there are not enough free blocks to write to ${name}.`,
  "error.dirFull": ({ name }) => `Error: the directory is full; ${name} does not fit.`,
  "error.badFd": ({ fd }) => `Error: descriptor ${fd} is not open.`,
};
