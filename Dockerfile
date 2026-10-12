# Cloud Run image for AapatVani AI.
#
# Three stages, so the runtime carries neither the build toolchain nor the development
# dependencies. Next.js `output: "standalone"` already bundles the server with only the modules it
# uses, so the final stage copies that rather than running `npm install` again.
#
# Node 24 is the current LTS. The local machine runs Node 25, which is not an LTS release and is
# not what we want in production.

# ---------------------------------------------------------------- dependencies
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` honours the lockfile exactly, so the image is built from the versions we tested.
RUN npm ci

# ---------------------------------------------------------------- build
FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# No secrets and no NEXT_PUBLIC_ values are baked in: every setting is read at runtime, so the same
# image runs against the local file store or Firestore without being rebuilt.
RUN npm run build

# ---------------------------------------------------------------- runtime
FROM node:24-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0

# Cloud Run sends SIGTERM before it reclaims an instance; without an init process Node would not
# forward it and in-flight review actions could be cut off mid-write.
RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init \
 && rm -rf /var/lib/apt/lists/*

# Run unprivileged. The node image already ships a `node` user, so nothing has to be created.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

# The regional road datasets and the saved evaluation results are read from disk at runtime. They
# are named in next.config.ts so the tracer copies them; this is the one thing whose absence would
# only show up as a broken map in production.
RUN test -f data/regions/nepal/araniko-corridor/network.json

USER node
EXPOSE 8080

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
