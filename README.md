# mwyatt.me

Personal site for Mike Wyatt. Astro 6 static output, dark by default, served by `nginx-unprivileged` in a small container, image on GHCR.

## Stack

- **Framework:** Astro 6 (static, `output: "static"`)
- **Styling:** Tailwind v4 via `@tailwindcss/vite`
- **Content:** Markdown via Astro content collections, glob loader
- **RSS / sitemap:** `@astrojs/rss`, `@astrojs/sitemap`
- **Runtime:** `nginxinc/nginx-unprivileged:1.27-alpine` (port 8080)
- **Build:** `node:20-alpine` + pnpm
- **Domain:** [mwyatt.me](https://mwyatt.me)

The site is forked from [steipete.me](https://github.com/steipete/steipete.me). Architecture, content collection shape, and Tailwind v4 setup are the same; branding, content, and runtime were swapped.

## Local dev

```bash
pnpm install
pnpm run dev          # http://localhost:4321
```

## Local container

```bash
docker compose up --build
# → http://localhost:8088
```

## Build & run (single container)

```bash
docker build -t mwyatt-me:local .
docker run --rm -p 8088:8080 mwyatt-me:local
```

## Build the static site only

```bash
pnpm run build        # writes dist/
pnpm run preview      # serves dist/ on :4321
```

## Deploy

Images are built and pushed to `ghcr.io/mentholmike/mwyatt-site` pinned to the git commit SHA. The VPS pulls and runs the new tag, then verifies the container with a health check.

## License

- **Site content (posts, About copy):** CC BY 4.0
- **Code, configuration, scripts:** MIT
