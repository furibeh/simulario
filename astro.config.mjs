// @ts-check
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import { defineConfig } from "astro/config";

// Final domain is not decided yet (see the site plan). Override with SITE_URL.
const site = process.env.SITE_URL ?? "https://simulario.pages.dev";

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "never",
  // Emit /es/acerca.html instead of /es/acerca/index.html: Cloudflare Pages serves it at
  // /es/acerca with no redirect, matching trailingSlash "never" and the canonical URLs.
  build: { format: "file" },
  integrations: [
    svelte(),
    mdx(),
    sitemap({
      // `/` only picks a language and is noindex.
      filter: (page) => new URL(page).pathname !== "/",
      i18n: {
        defaultLocale: "es",
        locales: { es: "es", en: "en" },
      },
    }),
  ],
  i18n: {
    locales: ["es", "en"],
    defaultLocale: "es",
    routing: {
      prefixDefaultLocale: true,
      // `/` is our own page that picks the language on the client.
      redirectToDefaultLocale: false,
    },
  },
});
