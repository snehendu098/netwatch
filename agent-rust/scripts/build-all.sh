#!/bin/bash
# Build script for NetWatch Rust Agent
# Builds for multiple platforms and creates release binaries

set -e

# Source cargo environment
if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RELEASE_DIR="$PROJECT_DIR/release"

# Project info
PROJECT_NAME="netwatch-agent"
VERSION=$(grep '^version' "$PROJECT_DIR/Cargo.toml" | head -1 | sed 's/version = "\(.*\)"/\1/')

# Detect current platform
OS=$(uname -s)
ARCH=$(uname -m)

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  NetWatch Rust Agent Build Script${NC}"
echo -e "${BLUE}  Version: $VERSION${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Create release directory
mkdir -p "$RELEASE_DIR"

# Function to build for a target
build_target() {
    local target=$1
    local output_name=$2

    echo -e "${YELLOW}Building for $target...${NC}"

    cd "$PROJECT_DIR"

    # Check if target is installed
    if ! rustup target list --installed | grep -q "$target"; then
        echo -e "${YELLOW}Installing target $target...${NC}"
        rustup target add "$target" || {
            echo -e "${RED}Failed to add target $target. Skipping.${NC}"
            return 1
        }
    fi

    # Build
    cargo build --release --target "$target" || {
        echo -e "${RED}Build failed for $target${NC}"
        return 1
    }

    # Copy binary
    local binary_name="$PROJECT_NAME"
    if [[ "$target" == *"windows"* ]]; then
        binary_name="$PROJECT_NAME.exe"
    fi

    local src="$PROJECT_DIR/target/$target/release/$binary_name"
    local dst="$RELEASE_DIR/$output_name"

    if [ -f "$src" ]; then
        cp "$src" "$dst"
        echo -e "${GREEN}Built: $dst${NC}"

        # Show binary size
        local size=$(du -h "$dst" | cut -f1)
        echo -e "${GREEN}Size: $size${NC}"
    else
        echo -e "${RED}Binary not found: $src${NC}"
        return 1
    fi

    echo ""
    return 0
}

# Build for current platform (native)
build_native() {
    echo -e "${BLUE}Building native release...${NC}"

    cd "$PROJECT_DIR"
    cargo build --release

    local binary_name="$PROJECT_NAME"
    if [[ "$OS" == "MINGW"* ]] || [[ "$OS" == "CYGWIN"* ]] || [[ "$OS" == "MSYS"* ]]; then
        binary_name="$PROJECT_NAME.exe"
    fi

    local output_name="$PROJECT_NAME-$VERSION-$OS-$ARCH"
    if [[ "$OS" == "Darwin" ]]; then
        output_name="$PROJECT_NAME-$VERSION-darwin-$ARCH"
    elif [[ "$OS" == "Linux" ]]; then
        output_name="$PROJECT_NAME-$VERSION-linux-$ARCH"
    fi

    if [[ "$binary_name" == *.exe ]]; then
        output_name="$output_name.exe"
    fi

    cp "$PROJECT_DIR/target/release/$binary_name" "$RELEASE_DIR/$output_name"
    echo -e "${GREEN}Built: $RELEASE_DIR/$output_name${NC}"

    local size=$(du -h "$RELEASE_DIR/$output_name" | cut -f1)
    echo -e "${GREEN}Size: $size${NC}"
    echo ""
}

# Platform-specific builds
case "$OS" in
    "Darwin")
        echo -e "${BLUE}Detected macOS${NC}"
        echo ""

        # Build native (current architecture)
        build_native

        # Try to build for other macOS architectures
        if [[ "$ARCH" == "arm64" ]]; then
            build_target "x86_64-apple-darwin" "$PROJECT_NAME-$VERSION-darwin-x64" || true
        else
            build_target "aarch64-apple-darwin" "$PROJECT_NAME-$VERSION-darwin-arm64" || true
        fi

        # Cross-compile for Linux if cross is available
        if command -v cross &> /dev/null; then
            echo -e "${YELLOW}Cross compilation available, building Linux targets...${NC}"
            cross build --release --target x86_64-unknown-linux-gnu 2>/dev/null && \
                cp "$PROJECT_DIR/target/x86_64-unknown-linux-gnu/release/$PROJECT_NAME" \
                   "$RELEASE_DIR/$PROJECT_NAME-$VERSION-linux-x64" || true
        fi
        ;;

    "Linux")
        echo -e "${BLUE}Detected Linux${NC}"
        echo ""

        # Build native
        build_native

        # Build for Windows using cross or mingw
        if command -v cross &> /dev/null; then
            echo -e "${YELLOW}Building Windows target with cross...${NC}"
            cross build --release --target x86_64-pc-windows-gnu 2>/dev/null && \
                cp "$PROJECT_DIR/target/x86_64-pc-windows-gnu/release/$PROJECT_NAME.exe" \
                   "$RELEASE_DIR/$PROJECT_NAME-$VERSION-win32-x64.exe" || true
        elif command -v x86_64-w64-mingw32-gcc &> /dev/null; then
            echo -e "${YELLOW}Building Windows target with mingw...${NC}"
            build_target "x86_64-pc-windows-gnu" "$PROJECT_NAME-$VERSION-win32-x64.exe" || true
        fi
        ;;

    "MINGW"*|"CYGWIN"*|"MSYS"*)
        echo -e "${BLUE}Detected Windows${NC}"
        echo ""

        # Build native
        build_native
        ;;

    *)
        echo -e "${YELLOW}Unknown OS: $OS. Building native only.${NC}"
        build_native
        ;;
esac

# Summary
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  Build Complete!${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""
echo -e "${GREEN}Release binaries:${NC}"
ls -lh "$RELEASE_DIR/"
echo ""

# Compare with Electron agent size if available
ELECTRON_RELEASE="../agent/release"
if [ -d "$ELECTRON_RELEASE" ]; then
    echo -e "${BLUE}Comparison with Electron agent:${NC}"
    echo -e "${YELLOW}Rust agent sizes:${NC}"
    du -h "$RELEASE_DIR"/* 2>/dev/null || true
    echo ""
    echo -e "${YELLOW}Electron agent sizes:${NC}"
    du -h "$ELECTRON_RELEASE"/*.dmg "$ELECTRON_RELEASE"/*.exe "$ELECTRON_RELEASE"/*.AppImage 2>/dev/null || true
fi
