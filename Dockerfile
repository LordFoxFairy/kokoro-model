FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json tsconfig.build.json vitest.config.ts ./
COPY packages ./packages
COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts
COPY database ./database
COPY contract ./contract

RUN pnpm install --frozen-lockfile
RUN pnpm db:generate
RUN pnpm build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=build /app/packages/service-kit/package.json ./packages/service-kit/package.json
COPY --from=build /app/dist/packages/service-kit ./packages/service-kit/dist
RUN node -e 'const fs = require("node:fs"); const file = "packages/service-kit/package.json"; const pkg = JSON.parse(fs.readFileSync(file, "utf8")); pkg.exports = { ".": { "types": "./dist/src/index.d.ts", "import": "./dist/src/index.js" } }; fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");'
RUN pnpm install --prod --ignore-scripts --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./dist/generated

USER node
EXPOSE 4221 4222
CMD ["node", "dist/src/interfaces/http/target-main.js"]
