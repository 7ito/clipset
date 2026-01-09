.PHONY: build run dev clean test sqlc migrate help

# Binary name
BINARY=clipset

# Build the application
build:
	go build -o $(BINARY) ./cmd/clipset

# Run the application
run: build
	./$(BINARY)

# Run with hot reload (requires air: go install github.com/air-verse/air@latest)
dev:
	air

# Clean build artifacts
clean:
	rm -f $(BINARY)
	go clean

# Run tests
test:
	go test -v ./...

# Generate sqlc code
sqlc:
	sqlc generate

# Run database migrations only
migrate:
	./$(BINARY) migrate

# Tidy go modules
tidy:
	go mod tidy

# Format code
fmt:
	go fmt ./...

# Lint code (requires golangci-lint)
lint:
	golangci-lint run

# Build for Linux
build-linux:
	GOOS=linux GOARCH=amd64 go build -o $(BINARY)-linux-amd64 ./cmd/clipset

# Build for Docker
docker-build:
	docker build -t clipset .

help:
	@echo "Available targets:"
	@echo "  build        - Build the application"
	@echo "  run          - Build and run the application"
	@echo "  dev          - Run with hot reload (requires air)"
	@echo "  clean        - Clean build artifacts"
	@echo "  test         - Run tests"
	@echo "  sqlc         - Generate sqlc code"
	@echo "  migrate      - Run database migrations"
	@echo "  tidy         - Tidy go modules"
	@echo "  fmt          - Format code"
	@echo "  lint         - Lint code (requires golangci-lint)"
	@echo "  build-linux  - Build for Linux"
	@echo "  docker-build - Build Docker image"
