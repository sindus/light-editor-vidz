#!/usr/bin/env sh
# LightEditorVidz — uninstaller.
#   curl -fsSL https://sindus.github.io/light-editor-vidz/uninstall.sh | sh
set -eu

APP_NAME="light-editor-vidz"
log() { printf '==> %s\n' "$1"; }

os="$(uname -s)"

case "$os" in
  Darwin)
    if command -v brew >/dev/null 2>&1 && brew list --cask "$APP_NAME" >/dev/null 2>&1; then
      log "Uninstalling via Homebrew…"
      brew uninstall --cask "$APP_NAME"
    else
      log "Homebrew cask not found — if you installed manually, remove /Applications/LightEditorVidz.app yourself."
    fi
    ;;
  Linux)
    target="$HOME/.local/bin/$APP_NAME.AppImage"
    desktop_file="$HOME/.local/share/applications/$APP_NAME.desktop"
    [ -f "$target" ] && { rm -f "$target"; log "Removed $target"; }
    [ -f "$desktop_file" ] && { rm -f "$desktop_file"; log "Removed $desktop_file"; }
    log "Done. (ffmpeg and app data/config were left untouched.)"
    ;;
  *)
    log "Unsupported OS: $os."
    ;;
esac
