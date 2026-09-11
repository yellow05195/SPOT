# SPOT claim server. Build from the repository root:
#   docker build -f server/Dockerfile -t spot-server .
# The three .onnx models are downloaded at build time (scripts/fetch-models.mjs) and baked into the
# image with the reference corpus (models/refs). The schema is applied at start (scripts/migrate.mjs).
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /src
COPY server/package.json server/pnpm-lock.yaml server/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY server/tsconfig.json ./
COPY server/src ./src
RUN pnpm exec tsc -p tsconfig.json && pnpm prune --prod

FROM node:22-bookworm-slim
ENV NODE_ENV=production
ENV MODELS_DIR=/app/models
WORKDIR /app
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/dist ./dist
COPY server/package.json ./
COPY server/scripts ./scripts
COPY server/drizzle ./drizzle
COPY server/models/refs ./models/refs
# Models are fetched once, at build time, so the container starts without network access to the hubs.
# CLIP_MODEL_URL (build arg or env) selects the CLIP variant; the quantized one fits a 512 MB host.
ARG CLIP_MODEL_URL=
ENV CLIP_MODEL_URL=$CLIP_MODEL_URL
RUN node scripts/fetch-models.mjs && chown -R node:node /app/models
EXPOSE 3001
USER node
CMD ["sh", "-c", "node scripts/migrate.mjs && node dist/main.js"]
