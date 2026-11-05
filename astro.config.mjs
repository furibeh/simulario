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
  // Emit /es/about.html instead of /es/about/index.html: Cloudflare Pages serves it at
  // /es/acerca with no redirect, matching trailingSlash "never" and the canonical URLs.
  build: { format: "file" },
  integrations: [
    svelte(),
    mdx(),
    sitemap({
      // `/` only picks a language; the 404 and search pages are not content. All are noindex.
      filter: (page) => {
        const { pathname } = new URL(page);
        return pathname !== "/" && !/(^|\/)(404|search)\/?$/.test(pathname);
      },
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
