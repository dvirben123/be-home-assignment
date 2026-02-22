# ── Build stage ────────────────────────────────────────────────────────────────
FROM oven/bun:latest AS builder

WORKDIR /app

COPY src/frontend/package.json ./package.json
RUN bun install

COPY src/frontend/index.html ./index.html
COPY src/frontend/vite.config.ts ./vite.config.ts
COPY src/frontend/tsconfig.json ./tsconfig.json
COPY src/frontend/tailwind.config.js ./tailwind.config.js
COPY src/frontend/postcss.config.js ./postcss.config.js
COPY src/frontend/src ./src

RUN bun run build

# ── Runtime stage ───────────────────────────────────────────────────────────────
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY src/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
