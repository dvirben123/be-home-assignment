# ── Build stage ────────────────────────────────────────────────────────────────
FROM oven/bun:latest AS builder

WORKDIR /app

COPY src/services/dashboard/package.json ./package.json
RUN bun install

COPY src/services/dashboard/index.html ./index.html
COPY src/services/dashboard/vite.config.ts ./vite.config.ts
COPY src/services/dashboard/tsconfig.json ./tsconfig.json
COPY src/services/dashboard/tailwind.config.js ./tailwind.config.js
COPY src/services/dashboard/postcss.config.js ./postcss.config.js
COPY src/services/dashboard/src ./src

RUN bun run build

# ── Runtime stage ───────────────────────────────────────────────────────────────
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY src/services/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
