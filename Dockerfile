# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS packages
ARG DSH_VERSION=0.2.1-rc.2
ARG PNPM_VERSION=10.32.1

# node-pty and other native dependencies may need compilation on Linux.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global --prefix /opt/dsh --no-audit --no-fund \
      "@deepseek-ai/dsh@${DSH_VERSION}" "pnpm@${PNPM_VERSION}" \
    && /opt/dsh/bin/dsh --version \
    && npm cache clean --force
COPY patch-browser-auth.cjs /tmp/patch-browser-auth.cjs
RUN DSH_VERSION="${DSH_VERSION}" node /tmp/patch-browser-auth.cjs

FROM ${NODE_IMAGE} AS runtime
ARG DSH_VERSION=0.2.1-rc.2
LABEL org.opencontainers.image.title="DeepSeek Harness for NAS" \
      org.opencontainers.image.description="Web UI installed from the official @deepseek-ai/dsh npm package" \
      org.opencontainers.image.version="${DSH_VERSION}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bash bubblewrap ca-certificates curl git openssh-client python3 ripgrep libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /home/node/.dsh /workspace \
    && chown -R node:node /home/node /workspace

COPY --from=packages /opt/dsh /opt/dsh
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY healthcheck.cjs /usr/local/lib/dsh-healthcheck.cjs

ENV PATH="/opt/dsh/bin:${PATH}" \
    HOME=/home/node \
    DSH_HOME=/home/node/.dsh \
    DSH_WORKSPACE_ROOT=/workspace \
    DSH_DISABLE_BROWSER_AUTH=0 \
    NODE_ENV=production

USER node
WORKDIR /workspace
EXPOSE 3080
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD ["node", "/usr/local/lib/dsh-healthcheck.cjs"]
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["dsh", "web", "--no-open", "--port", "3080"]
