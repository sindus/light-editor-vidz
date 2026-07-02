#!/usr/bin/env sh
# LightEditorVidz — one-line installer.
#   curl -fsSL https://sindus.github.io/light-editor-vidz/install.sh | sh
#
# macOS: installs via a personal Homebrew tap (also installs ffmpeg, a runtime dependency).
# Linux: downloads the latest AppImage from GitHub Releases into ~/.local/bin and installs
#        ffmpeg via the detected system package manager if missing.
set -eu

REPO="sindus/light-editor-vidz"
APP_NAME="light-editor-vidz"

log() { printf '==> %s\n' "$1"; }
die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

os="$(uname -s)"

case "$os" in
  Darwin)
    command -v brew >/dev/null 2>&1 || die "Homebrew is required on macOS: https://brew.sh"
    log "Installing $APP_NAME via Homebrew (tap sindus/light-editor-vidz)…"
    brew install "sindus/light-editor-vidz/$APP_NAME"
    log "Done. Launch it from Applications or run: open -a LightEditorVidz"
    ;;
  Linux)
    command -v curl >/dev/null 2>&1 || die "curl is required"

    if ! command -v ffmpeg >/dev/null 2>&1; then
      log "ffmpeg not found, attempting to install it (required for video export)…"
      if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y ffmpeg
      elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y ffmpeg
      elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -S --noconfirm ffmpeg
      else
        log "Could not detect a supported package manager — please install ffmpeg manually."
      fi
    fi

    install_dir="$HOME/.local/bin"
    mkdir -p "$install_dir"
    icon_dir="$HOME/.local/share/icons/hicolor/256x256/apps"
    desktop_dir="$HOME/.local/share/applications"
    mkdir -p "$icon_dir" "$desktop_dir"

    log "Fetching latest release info…"
    download_url=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" |
      grep -o '"browser_download_url": *"[^"]*\.AppImage"' |
      head -n1 |
      sed 's/.*"\(https[^"]*\)"/\1/')

    [ -n "$download_url" ] || die "Could not find an AppImage in the latest release."

    target="$install_dir/$APP_NAME.AppImage"
    log "Downloading $download_url"
    curl -fsSL -o "$target" "$download_url"
    chmod +x "$target"

    cat > "$desktop_dir/$APP_NAME.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=LightEditorVidz
Comment=Desktop video editor
Exec=$target
Terminal=false
Categories=AudioVideo;Video;
EOF

    log "Installed to $target"
    case ":$PATH:" in
      *":$install_dir:"*) ;;
      *) log "Note: $install_dir is not in your PATH. Add it to your shell profile to run '$APP_NAME' directly." ;;
    esac
    log "Done. Launch it from your application menu, or run: $target"
    ;;
  *)
    die "Unsupported OS: $os. See https://github.com/$REPO/releases for manual downloads."
    ;;
esac
