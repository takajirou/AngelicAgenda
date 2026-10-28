FROM rust:1.90-bookworm AS angelic-angel-builder

ARG ANGELIC_ANGEL_REF=169a098e2025cc6e41a50fc8d521c483e21d9b6d

RUN apt-get update \
    && apt-get install --yes --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /source
RUN git clone --filter=blob:none https://github.com/sh1ma/Angelic-Angel.git . \
    && git checkout --detach "${ANGELIC_ANGEL_REF}" \
    && cargo build --release --locked

FROM node:22-bookworm-slim AS backend-builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim

ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force \
    && mkdir -p /var/lib/angelic-angel \
    && chown node:node /var/lib/angelic-angel

COPY --from=backend-builder /app/dist ./dist
COPY --from=angelic-angel-builder /source/target/release/angelic-angel /usr/local/bin/angelic-angel
COPY --from=angelic-angel-builder /source/LICENSE /usr/share/doc/angelic-angel/LICENSE
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh

USER node

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
