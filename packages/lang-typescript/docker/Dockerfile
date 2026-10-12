# Pinned, not a floating tag, so build/test don't silently change out from under us (same
# reasoning as oasdiff's image pin, see DECISIONS.md). pnpm is baked in at build time so
# build/test can run with --network none; only the install step (a separate container, with
# network access) needs anything from the registry.
FROM node:24.21.0-slim
# COREPACK_HOME must be fixed and baked in, not left at its $HOME-relative default: a non-root
# `--user` run overrides HOME (see docker-exec.ts), which would otherwise hide the pnpm this
# RUN already prepared and make corepack re-fetch it - with --network none, that fetch fails.
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
