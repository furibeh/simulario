import { type CollectionEntry, getCollection } from "astro:content";
import { type Locale, locales, localizedPath } from "../i18n/config";

export type LessonEntry = CollectionEntry<"lessons">;
export type ModuleEntry = CollectionEntry<"modules">;
export type PathEntry = CollectionEntry<"paths">;

/** Lesson entry ids are "<lang>/<slug>". */
export function splitLessonId(id: string): { lang: string; slug: string } {
  const [lang = "", ...rest] = id.split("/");
  return { lang, slug: rest.join("/") };
}

export function lessonHref(lang: Locale, pathId: string, slug: string): string {
  return localizedPath(lang, `${pathId}/${slug}`);
}

export async function getCatalog() {
  const [paths, modules, lessons] = await Promise.all([
    getCollection("paths"),
    getCollection("modules"),
    getCollection("lessons"),
  ]);
  paths.sort((a, b) => a.data.order - b.data.order);
  modules.sort((a, b) => a.data.order - b.data.order);
  lessons.sort((a, b) => a.data.order - b.data.order);
  return { paths, modules, lessons };
}

/** Every lesson slug with the entry to show in each locale (falling back to another language). */
export async function getLessonPages() {
  const { modules, lessons } = await getCatalog();
  const slugs = [...new Set(lessons.map((l) => splitLessonId(l.id).slug))];
  return slugs.flatMap((slug) =>
    locales.map((lang) => {
      const own = lessons.find((l) => l.id === `${lang}/${slug}`);
      const entry = own ?? lessons.find((l) => splitLessonId(l.id).slug === slug);
      if (!entry) throw new Error(`Lesson ${slug} has no content`);
      const module = modules.find((m) => m.id === entry.data.module.id);
      if (!module) throw new Error(`Lesson ${slug} points to a missing module`);
      return {
        lang,
        slug,
        entry,
        module,
        pathId: module.data.path.id,
        contentLang: splitLessonId(entry.id).lang as Locale,
        isFallback: !own,
      };
    }),
  );
}

/** First lesson of a module, in the given locale's slug space (slugs are shared). */
export function firstLessonSlug(lessons: LessonEntry[], moduleId: string): string | undefined {
  const lesson = lessons.find((l) => l.data.module.id === moduleId);
  return lesson ? splitLessonId(lesson.id).slug : undefined;
}
