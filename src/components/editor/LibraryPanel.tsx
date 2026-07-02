import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Search,
  Upload,
  Mic,
  Square,
  Circle,
  Triangle,
  Star,
  ArrowRight,
  Minus,
  Video as VideoIcon,
} from "lucide-react";
import type { ShapeType } from "../../bindings/ShapeType";
import type { TextStylePreset } from "../../lib/elements";
import { importAsset, listAssets, type AssetInfo, type AssetKind } from "../../lib/commands";
import { assetUrl } from "../../lib/assetUrl";
import type { LeftTab } from "./types";

interface Props {
  active: LeftTab;
  projectDir: string;
  onAddTitle: () => void;
  onAddSubtitle: () => void;
  onAddStyledText: (preset: TextStylePreset) => void;
  onAddImage: (relativeSrc: string, name: string) => void;
  onAddVideo: (relativeSrc: string, name: string) => void;
  onAddAudio: (relativeSrc: string, name: string) => void;
  onAddShape: (shapeType: ShapeType) => void;
}

const TITLE_KEYS: Record<LeftTab, string> = {
  text: "rail.text",
  video: "rail.video",
  image: "rail.image",
  audio: "rail.audio",
  shape: "rail.shape",
};

function TextLibrary({
  onAddTitle,
  onAddSubtitle,
  onAddStyledText,
}: Pick<Props, "onAddTitle" | "onAddSubtitle" | "onAddStyledText">) {
  const { t } = useTranslation();
  return (
    <>
      <div className="library-tile library-tile-title" onClick={onAddTitle}>
        {t("library.addTitle")}
      </div>
      <div className="library-tile library-tile-subtitle" onClick={onAddSubtitle}>
        {t("library.addSubtitle")}
      </div>
      <div className="library-section-label">{t("library.animatedStyles")}</div>
      <div className="library-grid-2">
        <div className="library-style-tile" onClick={() => onAddStyledText("neon")}>
          <span className="style-preview-neon">{t("library.styleNeon")}</span>
        </div>
        <div className="library-style-tile" onClick={() => onAddStyledText("shadow")}>
          <span className="style-preview-shadow">{t("library.styleShadow")}</span>
        </div>
        <div className="library-style-tile" onClick={() => onAddStyledText("box")}>
          <span className="style-preview-box">{t("library.styleBox")}</span>
        </div>
        <div className="library-style-tile" onClick={() => onAddStyledText("spaced")}>
          <span className="style-preview-spaced">{t("library.styleSpaced")}</span>
        </div>
      </div>
    </>
  );
}

function MediaLibrary({
  kind,
  projectDir,
  onAdd,
  search,
}: {
  kind: AssetKind;
  projectDir: string;
  onAdd: (relativeSrc: string, name: string) => void;
  search: string;
}) {
  const { t } = useTranslation();
  const [allAssets, setAllAssets] = useState<AssetInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    listAssets(projectDir, kind)
      .then(setAllAssets)
      .catch((e) => setError(String(e)));
  }

  useEffect(refresh, [projectDir, kind]);

  const assets = allAssets.filter((a) => a.filename.toLowerCase().includes(search.toLowerCase()));

  async function handleImport() {
    setError(null);
    const filters =
      kind === "image"
        ? [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
        : kind === "video"
          ? [{ name: "Videos", extensions: ["mp4", "webm", "mov"] }]
          : [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a"] }];
    const path = await open({ multiple: false, filters });
    if (!path || Array.isArray(path)) return;
    try {
      const relativeSrc = await importAsset(projectDir, kind, path);
      refresh();
      const name = relativeSrc.split("/").pop() ?? relativeSrc;
      onAdd(relativeSrc, name);
    } catch (e) {
      setError(String(e));
    }
  }

  if (kind === "audio") {
    return (
      <>
        {error && <p className="library-error">{error}</p>}
        <div className="library-audio-list">
          {assets.map((a) => (
            <div
              key={a.relative_path}
              className="library-audio-item"
              onClick={() => onAdd(a.relative_path, a.filename)}
            >
              <Mic size={15} color="var(--color-audio)" />
              <span className="mono">{a.filename}</span>
            </div>
          ))}
        </div>
        <div className="library-audio-hint" onClick={handleImport}>
          <Upload size={16} />
          <span>{t("library.importAudio")}</span>
        </div>
      </>
    );
  }

  return (
    <>
      {error && <p className="library-error">{error}</p>}
      <div className="library-grid-2">
        {assets.map((a) => (
          <div
            key={a.relative_path}
            className="library-media-tile"
            style={{ aspectRatio: kind === "video" ? "16/10" : "1" }}
            onClick={() => onAdd(a.relative_path, a.filename)}
            title={a.filename}
          >
            {kind === "image" ? (
              <img src={assetUrl(projectDir, a.relative_path)} alt={a.filename} />
            ) : (
              <VideoIcon size={20} />
            )}
            <span className="library-media-label mono">{a.filename}</span>
          </div>
        ))}
        <div
          className="library-import-tile"
          style={{ aspectRatio: kind === "video" ? "16/10" : "1" }}
          onClick={handleImport}
        >
          <Upload size={18} />
          <span>{t("library.import")}</span>
        </div>
      </div>
    </>
  );
}

const SHAPES: { type: ShapeType; icon: typeof Square; labelKey: string }[] = [
  { type: "rectangle", icon: Square, labelKey: "shapes.rectangle" },
  { type: "ellipse", icon: Circle, labelKey: "shapes.ellipse" },
  { type: "triangle", icon: Triangle, labelKey: "shapes.triangle" },
  { type: "star", icon: Star, labelKey: "shapes.star" },
  { type: "arrow", icon: ArrowRight, labelKey: "shapes.arrow" },
  { type: "line", icon: Minus, labelKey: "shapes.line" },
];

function ShapeLibrary({ onAddShape, search }: { onAddShape: (shapeType: ShapeType) => void; search: string }) {
  const { t } = useTranslation();
  const shapes = SHAPES.filter((s) => t(s.labelKey).toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="library-grid-3">
      {shapes.map(({ type, icon: Icon, labelKey }) => (
        <div className="library-shape-tile" key={type} onClick={() => onAddShape(type)} title={t(labelKey)}>
          <Icon size={22} color="var(--color-shape)" />
        </div>
      ))}
    </div>
  );
}

export default function LibraryPanel({
  active,
  projectDir,
  onAddTitle,
  onAddSubtitle,
  onAddStyledText,
  onAddImage,
  onAddVideo,
  onAddAudio,
  onAddShape,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  return (
    <aside className="editor-library">
      <div className="library-header">
        <h3>{t(TITLE_KEYS[active])}</h3>
        <span className="mono library-hint">{t("library.clickToAdd")}</span>
      </div>

      <div className="library-search">
        <Search size={14} />
        <input
          placeholder={t("library.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="library-content">
        {active === "text" && (
          <TextLibrary onAddTitle={onAddTitle} onAddSubtitle={onAddSubtitle} onAddStyledText={onAddStyledText} />
        )}
        {active === "video" && <MediaLibrary kind="video" projectDir={projectDir} onAdd={onAddVideo} search={search} />}
        {active === "image" && <MediaLibrary kind="image" projectDir={projectDir} onAdd={onAddImage} search={search} />}
        {active === "audio" && <MediaLibrary kind="audio" projectDir={projectDir} onAdd={onAddAudio} search={search} />}
        {active === "shape" && <ShapeLibrary onAddShape={onAddShape} search={search} />}
      </div>
    </aside>
  );
}
