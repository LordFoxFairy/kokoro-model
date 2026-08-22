FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json vitest.config.ts ./
COPY packages ./packages
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts
COPY database ./database
COPY contract ./contract
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate
