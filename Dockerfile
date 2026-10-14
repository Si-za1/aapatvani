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
# `npm ci` would be stricter — it refuses to install anything the lockfile does not already
# describe. It cannot be used here, and the reason is not this project's: a lockfile generated on
# macOS omits the transitive dependencies of the optional wasm32 fallback packages
# (`@img/sharp-wasm32`, `@tailwindcss/oxide-wasm32-wasi`, `@unrs/resolver-binding-wasm32-wasi`),
# because the macOS resolver prunes those branches entirely. Linux `npm ci` then validates the
# whole tree, finds five of those entries missing, and stops with `EUSAGE` before it compiles
# a line. Regenerating the lockfile on macOS does not help; it just moves which entries are
# missing. `npm install` resolves those gaps for the platform it is running on, and every version
# the build actually installs is still pinned by the lockfile.
RUN npm install --no-audit --no-fund

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
