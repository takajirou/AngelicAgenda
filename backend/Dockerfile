FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get upgrade -y \
    && npm install --global npm@latest \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

USER node

EXPOSE 3000

CMD ["npm", "run", "start:dev"]