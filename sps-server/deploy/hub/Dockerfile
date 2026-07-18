# syntax=docker/dockerfile:1.20
FROM node:lts-trixie-slim AS base
ARG USER_UID=1000
ARG USER_GID=1000
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates gosu curl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
RUN usermod -u $USER_UID --non-unique node \
  && groupmod -g $USER_GID --non-unique node \
  && usermod -g $USER_GID -d /sps node

FROM base AS build
WORKDIR /workspace
COPY external/sps-core /workspace/external/sps-core
COPY sps-server/sps-room-chat /workspace/sps-server/sps-room-chat

WORKDIR /workspace/external/sps-core
RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @paperclipai/ui build \
  && pnpm --filter @paperclipai/plugin-sdk build \
  && pnpm --filter @paperclipai/server build \
  && test -f server/dist/index.js

WORKDIR /workspace/sps-server/sps-room-chat
RUN npm ci && npm run build

FROM base AS production
WORKDIR /app
COPY --chown=node:node --from=build /workspace/external/sps-core /app
COPY --chown=node:node --from=build /workspace/sps-server/sps-room-chat/package.json /opt/sps-plugins/room-chat/package.json
COPY --chown=node:node --from=build /workspace/sps-server/sps-room-chat/dist /opt/sps-plugins/room-chat/dist
RUN mkdir -p /sps /opt/sps-plugins/room-chat \
  && chown -R node:node /sps /opt/sps-plugins
COPY external/sps-core/scripts/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production \
  HOME=/sps \
  HOST=0.0.0.0 \
  PORT=3100 \
  SERVE_UI=true \
  PAPERCLIP_HOME=/sps \
  PAPERCLIP_INSTANCE_ID=default \
  PAPERCLIP_DEPLOYMENT_MODE=authenticated \
  PAPERCLIP_DEPLOYMENT_EXPOSURE=private

EXPOSE 3100
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
