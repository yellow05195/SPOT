# SPOT keeper (inventory, rarity, hunt). Build from the repository root:
#   docker build -f keeper/Dockerfile -t spot-keeper .
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /src
COPY keeper/package.json keeper/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY keeper/tsconfig.json ./
COPY keeper/src ./src
RUN pnpm exec tsc -p tsconfig.json && pnpm prune --prod

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/dist ./dist
COPY keeper/package.json ./
VOLUME ["/app/state"]
ENV HUNT_SECRETS_FILE=/app/state/hunt-secrets.json
USER node
CMD ["node", "dist/index.js"]
