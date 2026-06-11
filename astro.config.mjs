// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { SITE } from "./src/consts";

// https://astro.build/config
export default defineConfig({
  site: SITE.website,
  trailingSlash: "ignore",
  output: "static",
  adapter: cloudflare(),
  build: {
    format: "directory",
  },
  markdown: {
    shikiConfig: {
      // Light theme only — site is dark by default. day/night-owl pair kept for inline toggles.
      themes: { light: "github-dark", dark: "github-dark" },
      wrap: true,
    },
  },
  integrations: [
    sitemap({
      filter: (page) => !page.endsWith("/404") && !page.endsWith("/404/"),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    host: "0.0.0.0",
    port: 4321,
  },
});
