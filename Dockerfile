# =============================================================================
# Two images from one file.
#
#   runner    the application. Next's standalone output, so it carries only the
#             dependencies actually reached at runtime.
#   migrator  everything needed to change the database: the dev dependencies
#             drizzle-kit and tsx need. Run once on deploy, then exits.
#
# Splitting them keeps migration tooling — and the owner credentials it needs —
# out of the image that serves requests.
# =============================================================================

ARG NODE_VERSION=22-alpine

# --- dependencies ------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build -------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build never touches the database: every page is server-rendered on demand
# and the connections are created lazily.
ENV BUILD_STANDALONE=true
RUN npm run build

# --- the application ---------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# The standalone bundle does not include static assets; they are copied in
# beside it, at the paths the server expects. `public/` is tracked even when
# empty so this COPY cannot fail.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

# --- migrations --------------------------------------------------------------
FROM node:${NODE_VERSION} AS migrator
WORKDIR /app

ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle
COPY scripts ./scripts

CMD ["npm", "run", "db:setup"]
