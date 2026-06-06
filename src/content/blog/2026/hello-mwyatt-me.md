---
title: "Hello, mwyatt.me"
description: "Kicking off the personal site — Astro 6 static export, dark by default, served by nginx in a ~25 MB container, image on GHCR."
pubDatetime: 2026-06-06T06:00:00.000Z
tags: ["meta", "build-log"]
featured: true
---

This is the first post on the new personal site. The goal is simple: a place to publish build logs, post-mortems, and the occasional opinion. No newsletter funnel, no tracking, no CMS to maintain.

## What's here

- **Dark by default.** Toggle in the header if you want light.
- **Static everything.** No server runtime, no DB, no JS framework shipped to the browser beyond what Astro inlines for theme switching.
- **Single container.** Astro builds to `dist/`, nginx serves it. Final image is around 25 MB on `nginx:1.27-alpine`. Pinned to a commit SHA on GHCR — never `:latest`.
- **Posts are markdown in git.** `src/content/blog/*.md`. No separate CMS, no Notion, no Lethe-driven content pipeline (yet — that's a future post).

## What's not here (yet)

These are on the roadmap, mostly tracked in my Lethe memory:

- A live "system status" widget showing this site, the Lethe server, and a couple of sidecars.
- A live "What I'm building" section.
- A /now page.
- Maybe a search index, if I end up with enough posts to need it.

## The stack

| Layer            | Choice                                     |
| ---------------- | ------------------------------------------ |
| Framework        | Astro 6 (static output)                    |
| Styling          | Tailwind v4 via `@tailwindcss/vite`        |
| Content          | Markdown + Astro content collections       |
| RSS              | `@astrojs/rss`                             |
| Sitemap          | `@astrojs/sitemap`                         |
| Build container  | `node:20-alpine`                           |
| Runtime          | `nginxinc/nginx-unprivileged:1.27-alpine`  |
| CI               | TBD — probably a simple GitHub Actions     |
| Image registry   | `ghcr.io/mentholmike/mwyatt.me`            |
| Domain           | `mwyatt.me`                                |

## Why

Peter Steinberger's site ([steipete.me](https://steipete.me)) is the architecture I keep coming back to. It's a clean Astro 6 + Tailwind v4 + content-collections build with a beautiful dark mode. I forked it, stripped what I didn't need (PWA, OG image generator, the dozen social icons I'll never use, the Vercel config), rebranded, and made dark the default. The rest of the build — Crabbox deploy, Lethe-as-CMS, live widgets — is the part that's actually interesting, and it's a series of follow-up posts.

The whole repo is on [GitHub](https://github.com/mentholmike/mwyatt.me). Take what's useful, ignore the rest.
