# TA Assistant

.PHONY: all install dev build lint check test test-rust test-frontend clean

# ─── Default ───────────────────────────────────────────
all: install

# ─── Install ────────────────────────────────────────────
install:
	npm install

# ─── Development ────────────────────────────────────────
dev:
	npm run tauri dev

# ─── Build ──────────────────────────────────────────────
build:
	npm run tauri build

# ─── Lint ───────────────────────────────────────────────
lint:
	npm run tauri clippy

# ─── Type Check ─────────────────────────────────────────
check:
	npx tsc --noEmit

# ─── Test ───────────────────────────────────────────────
test: test-rust test-frontend

test-rust:
	cd src-tauri && cargo test

test-frontend:
	npm run test

# ─── Clean ──────────────────────────────────────────────
clean:
	rm -rf node_modules/ dist/ src-tauri/target/

# ─── Rust ───────────────────────────────────────────────
cargo-build:
	cd src-tauri && cargo build

cargo-check:
	cd src-tauri && cargo check

# ─── Help ───────────────────────────────────────────────
help:
	@echo "Usage:"
	@echo "  make install    Install all dependencies"
	@echo "  make dev        Run in development mode"
	@echo "  make build      Build for production"
	@echo "  make lint       Run Rust clippy"
	@echo "  make check      TypeScript type checking"
	@echo "  make test       Run all tests (Rust + frontend)"
	@echo "  make test-rust  Run Rust unit tests"
	@echo "  make test-frontend  Run frontend unit tests"
	@echo "  make clean      Remove all build artifacts"
