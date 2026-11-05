import { defineCollection, reference } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const localized = z.object({ es: z.string(), en: z.string() });

const paths = defineCollection({
  loader: glob({ pattern: "*.yaml", base: "./src/content/paths" }),
  schema: z.object({
    order: z.number().int(),
    title: localized,
    summary: localized,
    /** Built by `pnpm dev` only; left out of production with its modules and lessons. */
    draft: z.boolean().default(false),
  }),
});

const modules = defineCollection({
  loader: glob({ pattern: "*.yaml", base: "./src/content/modules" }),
  schema: z.object({
    path: reference("paths"),
    order: z.number().int().positive(),
    title: localized,
    status: z.enum(["planned", "available"]),
  }),
});

/** One MDX file per lesson and language: lessons/<lang>/<id>.mdx. The entry id is "<lang>/<id>". */
const lessons = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/lessons" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    module: reference("modules"),
    order: z.number().int().positive(),
    minutes: z.number().int().positive(),
    prerequisites: z.array(z.string()).default([]),
  }),
});

/** Standalone pages (about, …): pages/<lang>/<id>.mdx. */
const pages = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
  }),
});

export const collections = { paths, modules, lessons, pages };
