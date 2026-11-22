# One image for the API (default command), the worker and migrations; see
# docker-compose.yml. Settings come from the environment; .env.defaults is
# baked in, so only secrets (see .env.example) must be passed.

FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./

# Production dependencies only. Cached until the lockfile changes, so code
# changes don't reinstall them.
FROM base AS prod-deps
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

FROM base AS build
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps
WORKDIR /app
# Owned by root and read-only for the app user: the process can't modify
# its own code or dependencies.
COPY package.json .env.defaults ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
# The worker runs `node dist/worker`, migrations
# `node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js`.
CMD ["node", "dist/main"]
