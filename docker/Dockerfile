FROM node:22-bookworm-slim
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npx playwright install --with-deps chromium && apt-get update && apt-get install -y --no-install-recommends util-linux && rm -rf /var/lib/apt/lists/*
COPY run-report.js ./
COPY scripts ./scripts
COPY docker ./docker
RUN mkdir -p /data /app/credentials && chmod +x /app/docker/entrypoint.sh
ENV DOCKER_DATA_DIR=/data DOCKER_REPORT_MODE=check TZ=Asia/Ho_Chi_Minh
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["node", "docker/run.js"]
