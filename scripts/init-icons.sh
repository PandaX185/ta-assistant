mkdir -p src-tauri/icons

# Generate placeholder icons (minimal 1-pixel PNGs — real icons later)
for size in 32x32 128x128 128x128@2x; do
  printf '\x89PNG\r\n\x1a\n' > "src-tauri/icons/${size}.png" 2>/dev/null || true
done
# .icns and .ico are platform-specific — skip for now
touch src-tauri/icons/icon.icns src-tauri/icons/icon.ico

# macOS Info.plist
cat > src-tauri/gen/settings.json 2>/dev/null << 'EOF' || true
{}
EOF
