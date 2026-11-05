/**
 * Draft paths are built by `pnpm dev` and left out of production builds, together with their
 * modules and lessons, so a path can be written in the open without being published.
 * See docs/architecture.md, "Content model".
 */

interface PathLike {
  id: string;
  data: { draft: boolean };
}
interface ModuleLike {
  id: string;
  data: { path: { id: string } };
}
interface LessonLike {
  data: { module: { id: string } };
}

export function withoutDrafts<P extends PathLike, M extends ModuleLike, L extends LessonLike>(
  catalog: { paths: P[]; modules: M[]; lessons: L[] },
  includeDrafts: boolean,
): { paths: P[]; modules: M[]; lessons: L[] } {
  if (includeDrafts) return catalog;
  const paths = catalog.paths.filter((p) => !p.data.draft);
  const pathIds = new Set(paths.map((p) => p.id));
  const modules = catalog.modules.filter((m) => pathIds.has(m.data.path.id));
  const moduleIds = new Set(modules.map((m) => m.id));
  const lessons = catalog.lessons.filter((l) => moduleIds.has(l.data.module.id));
  return { paths, modules, lessons };
}
