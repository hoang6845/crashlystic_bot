FROM golang:1.22-bookworm AS builder

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /crash-monitor ./cmd/reporter

FROM mcr.microsoft.com/playwright:v1.50.0-jammy

RUN apt-get update && apt-get install -y \
    tzdata \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /crash-monitor /app/crash-monitor

COPY config.yaml /app/config.yaml

RUN mkdir -p /app/logs /app/browser-profile /app/credentials

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

ENV TZ=Asia/Ho_Chi_Minh
ENV GOOGLE_CREDENTIALS_FILE=/app/credentials/service-account.json

VOLUME ["/app/browser-profile", "/app/logs", "/app/credentials"]

ENTRYPOINT ["/app/crash-monitor"]
CMD ["--config", "/app/config.yaml"]
