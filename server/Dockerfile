# SPOT claim server. Build from the repository root:
#   docker build -f server/Dockerfile -t spot-server .
# Models (models/clip-vision.onnx, face.onnx, plate.onnx, refs/) are mounted at runtime, not baked in.
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
WORKDIR /app
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/dist ./dist
COPY server/package.json ./
VOLUME ["/app/models"]
EXPOSE 3001
USER node
CMD ["node", "dist/main.js"]
