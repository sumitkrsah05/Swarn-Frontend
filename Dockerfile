# syntax=docker/dockerfile:1
# Production image for the swarn dashboard (Next.js standalone server on :3000).
#
#   docker build --build-arg NEXT_PUBLIC_SWARN_API=http://api-host:8420 -t swarn-frontend .
#   docker run -p 3000:3000 swarn-frontend
#
# NEXT_PUBLIC_* values are inlined at build time, so pass the API base as a
# build argument; changing it later requires a rebuild.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_SWARN_API=http://localhost:8420
ENV NEXT_PUBLIC_SWARN_API=$NEXT_PUBLIC_SWARN_API
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nextjs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
