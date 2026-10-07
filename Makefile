.PHONY: build run run-now first-login docker-build docker-run docker-run-now clean test

build:
	go build -o crash-monitor ./cmd/reporter

run: build
	./crash-monitor --config config.yaml

run-now: build
	./crash-monitor --config config.yaml --run-now

dry-run: build
	./crash-monitor --config config.yaml --run-now --no-sheets --log-level=debug

first-login: build
	@bash scripts/first-login.sh

install-playwright:
	go run github.com/playwright-community/playwright-go/cmd/playwright@latest install chromium

docker-build:
	docker compose build

docker-run:
	docker compose up -d crash-monitor

docker-run-now:
	docker compose run --rm crash-monitor --config /app/config.yaml --run-now

docker-logs:
	docker compose logs -f crash-monitor

docker-stop:
	docker compose down

test:
	go test ./... -v

lint:
	golangci-lint run ./...

tidy:
	go mod tidy

clean:
	rm -f crash-monitor
	rm -rf logs/

# ── Help ──────────────────────────────────────────────────
help:
	@echo "Available targets:"
	@echo "  build           Build the binary"
	@echo "  run             Start as a scheduled daemon"
	@echo "  run-now         Run immediately and exit"
	@echo "  dry-run         Run without uploading to Sheets"
	@echo "  first-login     Open browser for one-time Google login"
	@echo "  install-playwright  Install Chromium for Playwright"
	@echo "  docker-build    Build Docker image"
	@echo "  docker-run      Start as Docker daemon"
	@echo "  docker-run-now  One-shot Docker run"
	@echo "  docker-logs     Tail Docker logs"
	@echo "  clean           Remove build artifacts"
