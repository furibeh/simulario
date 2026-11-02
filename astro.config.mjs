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
  integrations: [
    svelte(),
    mdx(),
    sitemap({
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
