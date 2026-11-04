import type { FsExplainParams } from "../../engines/file-system/types";
import type { ExplainTemplates } from "./types";

const quote = (text: string) => (text === "" ? "un archivo vacío" : `«${text}»`);
const blocksOf = (blocks: string) => (blocks === "" ? "" : ` y los bloques ${blocks}`);

export const fileSystemEs: ExplainTemplates<FsExplainParams> = {
  create: ({ name, inode }) =>
    `Se crea el inodo ${inode}, un archivo vacío, y el directorio anota ${name} → ${inode}.`,
  "free.blocks": ({ inode, blocks }) => `Se liberan los bloques ${blocks} del inodo ${inode}.`,
  write: ({ name, inode, size, blocks }) =>
    size === 0
      ? `${name} (inodo ${inode}) queda vacío: no ocupa ningún bloque.`
      : `${name} (inodo ${inode}) ahora tiene ${size} ${size === 1 ? "byte" : "bytes"} en ${blocks.includes(",") ? "los bloques" : "el bloque"} ${blocks}.`,
  link: ({ name, target, inode, links }) =>
    `${name} es otro nombre para el inodo ${inode}, el mismo de ${target}. Su contador de enlaces sube a ${links}. No se copia ningún dato.`,
  symlink: ({ name, target, inode }) =>
    `${name} es un inodo nuevo (${inode}), un enlace simbólico que guarda el nombre ${target}, no un número de inodo.`,
  "unlink.keep": ({ name, inode, links }) =>
    `Se borra la entrada ${name}. El inodo ${inode} sigue vivo: le ${links === 1 ? "queda 1 enlace" : `quedan ${links} enlaces`}.`,
  "unlink.orphan": ({ name, inode }) =>
    `Se borra la entrada ${name}. El inodo ${inode} ya no tiene nombres, pero está abierto: sus datos siguen hasta que se cierre.`,
  "unlink.free": ({ name, inode, blocks }) =>
    `Se borra la entrada ${name}. El inodo ${inode} ya no tiene nombres ni está abierto: se liberan el inodo${blocksOf(blocks)}.`,
  "unlink.symlink": ({ name, inode }) =>
    `Se borra el enlace simbólico ${name} y su inodo ${inode}. El archivo al que apuntaba no cambia.`,
  open: ({ name, inode, fd }) =>
    `El proceso abre ${name} (inodo ${inode}) y recibe el descriptor ${fd}.`,
  "close.keep": ({ fd, inode }) =>
    `Se cierra el descriptor ${fd}. El inodo ${inode} sigue: todavía tiene nombres u otros descriptores.`,
  "close.free": ({ fd, inode, blocks }) =>
    `Se cierra el descriptor ${fd}, el último del inodo ${inode}, que ya no tenía nombres: se liberan el inodo${blocksOf(blocks)}.`,
  cat: ({ name, inode, content }) =>
    `cat ${name} sigue el nombre hasta el inodo ${inode} y lee ${quote(content)}.`,
  "cat.via": ({ name, target, inode, content }) =>
    `${name} apunta al nombre ${target}, que lleva al inodo ${inode}: se lee ${quote(content)}.`,
  read: ({ fd, inode, content }) =>
    `Leer por el descriptor ${fd} llega directo al inodo ${inode}, aunque ya no tenga nombre: ${quote(content)}.`,
  rename: ({ name, to, inode }) =>
    `${name} pasa a llamarse ${to}. Solo cambia la entrada del directorio: el inodo ${inode} y sus bloques no se mueven.`,
  "error.exists": ({ name }) => `Error: ya existe una entrada llamada ${name}.`,
  "error.missing": ({ name }) => `Error: no existe ninguna entrada llamada ${name}.`,
  "error.dangling": ({ name, target }) =>
    `Error: ${name} apunta a ${target}, pero ese nombre ya no existe. Es un enlace colgante.`,
  "error.noInodes": () => "Error: no queda ningún inodo libre.",
  "error.noSpace": ({ name }) =>
    `Error: no hay bloques libres suficientes para escribir en ${name}.`,
  "error.dirFull": ({ name }) => `Error: el directorio está lleno; no cabe ${name}.`,
  "error.badFd": ({ fd }) => `Error: el descriptor ${fd} no está abierto.`,
};
