# ── Build stage ──────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
# B5 — no `|| npm install` fallback: a broken lockfile must fail the build.
RUN npm ci

# B4 — use the Postgres schema for the production image so that
# prisma generate / migrate deploy match a postgresql:// DATABASE_URL.
COPY prisma/schema.postgres.prisma ./prisma/schema.prisma
COPY prisma ./prisma
RUN npx prisma generate --schema prisma/schema.postgres.prisma

COPY . .
RUN npm run build
# Keep only production deps (prisma is in "dependencies", so the CLI stays).
RUN npm prune --omit=dev

# ── Runtime stage ────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 3000

# B5 — production image: only production dependencies (dev deps never reach runtime).
# `prisma` stays in dependencies so `migrate deploy` works at runtime.
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs

# B5 — migrations instead of db push (no silent column/data drops).
# B5 — non-root user.
USER node
# B5 — healthcheck on a public route that returns 200.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.postgres.prisma && npx next start -p 3000"]
