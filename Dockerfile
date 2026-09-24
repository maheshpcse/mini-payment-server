# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
# The mongod binary is only needed by the test harness.
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 4000
# Hosts such as Railway inject PORT at runtime.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-4000}/api/v1/health" >/dev/null || exit 1
# Node runs as PID 1 directly so SIGTERM from the platform reaches the graceful-shutdown handler.
CMD ["node", "dist/server.js"]
