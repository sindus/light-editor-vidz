# LightEditorVidz

A desktop video editor built with Tauri (Rust) + React. Create scenes on a canvas with text,
images, videos, audio and shapes, animate them, and export a real `.mp4` — all locally, no
cloud, no watermark.

![license](https://img.shields.io/badge/license-MIT-blue) ![platforms](https://img.shields.io/badge/platforms-Linux%20%7C%20macOS-lightgrey)

## Features

- Multi-scene timeline with a real playback clock (not a fixed-interval hack).
- Text, image, video, audio and shape elements — drag/resize/rotate with one shared interaction
  component.
- Element animations (fade, slide, zoom, rotate, blur, bounce…) that **compose** instead of
  overwriting each other, plus composition transitions and Ken Burns pans.
- Undo/redo, duplicate/split/delete, an import path for the legacy JSON project format.
- **Real mp4 export**: frames are rasterized natively (tiny-skia + cosmic-text) and piped to
  `ffmpeg`, with audio tracks mixed in — not a DOM/CSS replay.
- Signed auto-update (checks GitHub Releases, downloads, installs, relaunches).
- English and French UI.

## Install

```sh
curl -fsSL https://sindus.github.io/light-editor-vidz/install.sh | sh
```

- **macOS**: installs via a personal Homebrew tap (`sindus/homebrew-light-editor-vidz`) and pulls
  in `ffmpeg` as a dependency.
- **Linux**: downloads the latest AppImage from [Releases](https://github.com/sindus/light-editor-vidz/releases)
  into `~/.local/bin` and installs `ffmpeg` via your system package manager if missing.

`ffmpeg` is a **required runtime dependency** (used to encode exports and decode video frames);
it is not bundled inside the app.

To uninstall: `curl -fsSL https://sindus.github.io/light-editor-vidz/uninstall.sh | sh`

## Development

Prerequisites: Rust (stable), Node 20+, `ffmpeg`/`ffprobe` on your `PATH`, and the
[Tauri system dependencies](https://v2.tauri.app/start/prerequisites/) for your OS.

```sh
npm install
npm run tauri dev
```

Useful scripts:

| Command                                                 | What it does                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `npm run tauri dev`                                     | Run the app in dev mode with hot reload                         |
| `npm run gen:types`                                     | Regenerate TS bindings from the Rust model (`scene-core`)       |
| `npm run lint`                                          | ESLint over the frontend                                        |
| `npm run format:check`                                  | Prettier check                                                  |
| `npm run test`                                          | Vitest unit tests (`src/lib/*.ts`)                              |
| `cargo test --workspace`                                | Rust unit + integration tests (includes a real mp4 export test) |
| `cargo clippy --workspace --all-targets -- -D warnings` | Rust lints                                                      |
| `cargo fmt`                                             | Format Rust code                                                |
| `npm run tauri build`                                   | Produce a release bundle (deb/AppImage on Linux, dmg on macOS)  |

## Project structure

```
crates/scene-core/   Rust: data model, animation/timeline resolution, frame rasterizer (export)
src-tauri/            Tauri app: commands (project I/O, assets, export), ffmpeg orchestration
src/                  React frontend: editor UI, i18n, pure logic in src/lib/*.ts
docs/                 GitHub Pages landing site + install.sh / uninstall.sh
```

A project is a `.lvproj/` folder (`project.json` + an `assets/` subfolder for imported media) —
portable, no database.

## Known limitations

- Video export renders each `VideoElement` from frames pre-extracted by `ffmpeg`; very long
  source videos will take a moment to extract on first use in an export.
- Blur is applied to text but not yet to shapes/images at export time.
- `ffmpeg` must be installed and reachable (via `PATH` or `LIGHT_EDITOR_VIDZ_FFMPEG`) — it is not
  bundled as a sidecar binary.

## License

[MIT](LICENSE)
