# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM cgr.dev/chainguard/node:latest@sha256:10be2e69be84a55739a6f4e0ab47703746e546006dad2c80494fafc7f5f6c5fd AS runtime
ARG REVISION=development
ARG SOURCE=https://github.com/jorgefprietol/container-cicd-lab
LABEL org.opencontainers.image.title="container-cicd-lab" \
      org.opencontainers.image.source=$SOURCE \
      org.opencontainers.image.revision=$REVISION
ENV NODE_ENV=production PORT=8080 APP_REVISION=$REVISION
WORKDIR /app
COPY --from=build --chown=65532:65532 /app/dist/src ./dist/src
COPY --chown=65532:65532 package.json ./
USER 65532:65532
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/usr/bin/node", "-e", "fetch('http://127.0.0.1:8080/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/bin/node"]
CMD ["dist/src/main.js"]
