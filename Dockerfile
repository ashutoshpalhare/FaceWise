# syntax=docker/dockerfile:1
# FaceWise V3 — production image (Next.js standalone-free simple build)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/migrations ./migrations
EXPOSE 3000
# DB readiness + app boot; schema is pushed on first start via the entrypoint.
CMD ["sh", "-c", "npx drizzle-kit push --force 2>/dev/null || true; npm run start"]
