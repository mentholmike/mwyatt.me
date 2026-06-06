# syntax=docker/dockerfile:1.7

# --- Build stage -----------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# Install pnpm via corepack (matches Astro/Tailwind ecosystem expectations).
RUN corepack enable && corepack prepare pnpm@10.5.0 --activate

# Copy manifests first for layer caching.
COPY package.json pnpm-lock.yaml* .npmrc ./
RUN pnpm install --frozen-lockfile || pnpm install

# Copy the rest and build.
COPY . .
RUN pnpm run build

# --- Runtime stage ---------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# Drop the default server, ship our own.
USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Tighten perms on the dist tree.
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx /etc/nginx/conf.d

# unprivileged image exposes 8080 — we keep that.
EXPOSE 8080

USER nginx
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
