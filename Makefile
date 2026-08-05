# TA Assistant

.PHONY: all install dev build lint check test test-rust test-frontend clean \
	android-dev android-apk android-aab android-clean android-key-setup

# Android SDK location. Auto-detects the user SDK first (Android Studio
# installs to ~/Android/Sdk), then falls back to a system-wide SDK.
# Override per-invocation if needed:
#   make android-apk ANDROID_HOME=/path/to/sdk
ANDROID_HOME ?= $(shell { [ -d "$(HOME)/Android/Sdk" ] && echo "$(HOME)/Android/Sdk"; } || { [ -d /opt/android-sdk ] && echo /opt/android-sdk; })
export ANDROID_HOME

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
clean-deps:
	rm -rf node_modules/ dist/ src-tauri/target/

clean-db:
	rm -rf ~/.local/share/com.pandax185.ta-assistant/

# ─── Rust ───────────────────────────────────────────────
cargo-build:
	cd src-tauri && cargo build

cargo-check:
	cd src-tauri && cargo check

# ─── Android ───────────────────────────────────────────
# Release APKs/AABs are signed with the release keystore via
# src-tauri/gen/android/keystore.properties (gitignored).
# Set up that file on a fresh machine with: make android-key-setup
#   (env: KEYSTORE_PASSWORD, KEY_PASSWORD, KEY_ALIAS optional)

android-dev:  ## Run the app on a connected Android device/emulator (debug)
	npm run tauri android dev

android-apk:  ## Build signed release APK(s)
	npm run tauri android build -- --apk

android-aab:  ## Build signed release AAB (Play Store upload)
	npm run tauri android build -- --aab

android-clean:  ## Clean Android build artifacts
	cd src-tauri/gen/android && ./gradlew clean

android-key-setup:  ## Write gitignored keystore.properties from env vars
	@if [ -f src-tauri/gen/android/keystore.properties ]; then \
		echo "keystore.properties already exists — delete it to regenerate"; \
	else \
		{ \
			echo "storeFile=../../../../release.keystore"; \
			echo "storePassword=$${KEYSTORE_PASSWORD:?set KEYSTORE_PASSWORD}"; \
			echo "keyAlias=$${KEY_ALIAS:-ta-assistant}"; \
			echo "keyPassword=$${KEY_PASSWORD:?set KEY_PASSWORD}"; \
		} > src-tauri/gen/android/keystore.properties; \
		echo "Wrote src-tauri/gen/android/keystore.properties"; \
	fi

# ─── Help ───────────────────────────────────────────────
help:
	@echo "Usage:"
	@echo "  make install          Install all dependencies"
	@echo "  make dev              Run in development mode (desktop)"
	@echo "  make build            Build for production (desktop)"
	@echo "  make lint             Run Rust clippy"
	@echo "  make check            TypeScript type checking"
	@echo "  make test             Run all tests (Rust + frontend)"
	@echo "  make test-rust        Run Rust unit tests"
	@echo "  make test-frontend    Run frontend unit tests"
	@echo "  make clean            Remove all build artifacts"
	@echo "  make android-dev      Run on Android device/emulator (debug)"
	@echo "  make android-apk      Build signed release APK"
	@echo "  make android-aab      Build signed release AAB"
	@echo "  make android-clean    Clean Android build artifacts"
	@echo "  make android-key-setup  Write keystore.properties (needs KEYSTORE_PASSWORD, KEY_PASSWORD)"
