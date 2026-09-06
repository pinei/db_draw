# ─── Build (Vue + typecheck) ────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY public ./public
COPY src ./src
COPY server ./server
RUN npm run build

# ─── Runtime (Express + /api) ───────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Reachable from the Docker host / Caddy. Override with -e if needed.
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package.json package-lock.json ./
# tsx is a devDependency (npm start) — keep it in the image without Vite/vue-tsc
RUN npm ci --omit=dev && npm install tsx@4.23.13 --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/public/logo.png ./public/logo.png

RUN mkdir -p /app/data && chown -R node:node /app
USER node

VOLUME ["/app/data"]
EXPOSE 3000

# Env at runtime (docker run -e / --env-file, Compose environment:):
#   RESEND_API_KEY  MAIL_FROM  SITE_URL  PORT  HOST
CMD ["npx", "tsx", "server/prod.ts"]
