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
  Globe,
  Settings,
  Loader2,
  Play,
  Pause,
  Plus,
  X,
} from "lucide-react";
import type { ShapeType } from "../../bindings/ShapeType";
import { STYLE_PRESETS, type TextStylePreset } from "../../lib/elements";
import {
  importAsset,
  importStockAsset,
  listAssets,
  searchStockAssets,
  type AssetInfo,
  type AssetKind,
  type StockResult,
} from "../../lib/commands";
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
  /** Ouvre les réglages (clés API des moteurs d'assets libres). */
  onOpenSettings: () => void;
}

const TITLE_KEYS: Record<LeftTab, string> = {
  text: "rail.text",
  video: "rail.video",
  image: "rail.image",
  audio: "rail.audio",
  shape: "rail.shape",
};

/** Un style par entrée de `STYLE_PRESETS` (`src/lib/elements.ts`) — l'aperçu de chaque tuile est
 * calculé directement depuis les mêmes données que celles utilisées pour créer l'élément, pas de
 * classe CSS dédiée par style (ne passerait pas à l'échelle pour plusieurs dizaines de styles). */
const TEXT_STYLE_TILES: { preset: TextStylePreset; labelKey: string }[] = [
  { preset: "neon", labelKey: "library.styleNeon" },
  { preset: "shadow", labelKey: "library.styleShadow" },
  { preset: "box", labelKey: "library.styleBox" },
  { preset: "spaced", labelKey: "library.styleSpaced" },
  { preset: "glow", labelKey: "library.styleGlow" },
  { preset: "outline", labelKey: "library.styleOutline" },
  { preset: "impact", labelKey: "library.styleImpact" },
  { preset: "minimal", labelKey: "library.styleMinimal" },
  { preset: "elegant", labelKey: "library.styleElegant" },
  { preset: "highlight", labelKey: "library.styleHighlight" },
  { preset: "underline", labelKey: "library.styleUnderline" },
  { preset: "strike", labelKey: "library.styleStrike" },
  { preset: "retro", labelKey: "library.styleRetro" },
  { preset: "vintage", labelKey: "library.styleVintage" },
  { preset: "neonPink", labelKey: "library.styleNeonPink" },
  { preset: "neonGreen", labelKey: "library.styleNeonGreen" },
  { preset: "warning", labelKey: "library.styleWarning" },
  { preset: "success", labelKey: "library.styleSuccess" },
  { preset: "quote", labelKey: "library.styleQuote" },
  { preset: "caption", labelKey: "library.styleCaption" },
  { preset: "wideSpace", labelKey: "library.styleWideSpace" },
  { preset: "condensed", labelKey: "library.styleCondensed" },
  { preset: "gold", labelKey: "library.styleGold" },
  { preset: "cinema", labelKey: "library.styleCinema" },
];

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
        {TEXT_STYLE_TILES.map(({ preset, labelKey }) => {
          const p = STYLE_PRESETS[preset];
          return (
            <div className="library-style-tile" key={preset} onClick={() => onAddStyledText(preset)}>
              <span
                style={{
                  color: p.color,
                  background: p.background_color ?? undefined,
                  padding: p.background_color ? "2px 7px" : undefined,
                  borderRadius: p.background_color ? 4 : undefined,
                  fontWeight: p.font_weight === "bold" ? 800 : 500,
                  fontStyle: p.font_style,
                  letterSpacing: p.letter_spacing ? `${p.letter_spacing / 10}em` : undefined,
                  textShadow: p.text_shadow ? `2px 2px 4px ${p.text_shadow}` : undefined,
                  textDecoration: p.underline ? "underline" : p.strikethrough ? "line-through" : undefined,
                }}
              >
                {t(labelKey)}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Recherche d'assets libres de droit sur les moteurs configurés (Pexels, Pixabay, Freesound,
 * Openverse) ; au clic, le fichier est téléchargé dans `assets/` du projet puis ajouté à la
 * scène — le projet reste autonome (l'export ne dépend jamais du réseau). */
function OnlineSearch({
  kind,
  projectDir,
  onImported,
  onOpenSettings,
}: {
  kind: AssetKind;
  projectDir: string;
  onImported: (relativeSrc: string, name: string) => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockResult[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [providers, setProviders] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);
  /** `download_url` de l'asset en cours de téléchargement, pour l'état visuel de sa tuile. */
  const [importing, setImporting] = useState<string | null>(null);
  /** URL en pré-écoute (audio) — un seul lecteur partagé, lecture directe du flux distant. */
  const [previewing, setPreviewing] = useState<string | null>(null);
  /** Résultat vidéo ouvert dans la fenêtre d'aperçu (lecture avant import). */
  const [videoPreview, setVideoPreview] = useState<StockResult | null>(null);

  async function runSearch() {
    if (!query.trim() || searching) return;
    setSearching(true);
    setErrors([]);
    setPreviewing(null);
    setVideoPreview(null);
    try {
      const resp = await searchStockAssets(kind, query);
      setResults(resp.results);
      setErrors(resp.errors);
      setProviders(resp.providers);
    } catch (e) {
      setErrors([String(e)]);
    } finally {
      setSearching(false);
    }
  }

  async function handlePick(r: StockResult) {
    if (importing) return;
    setImporting(r.download_url);
    setErrors([]);
    try {
      const relativeSrc = await importStockAsset(projectDir, kind, r.download_url, r.filename);
      setVideoPreview(null);
      onImported(relativeSrc, relativeSrc.split("/").pop() ?? r.filename);
    } catch (e) {
      setErrors([String(e)]);
    } finally {
      setImporting(null);
    }
  }

  const resultTitle = (r: StockResult) =>
    [r.filename, r.author ? t("library.onlineBy", { author: r.author }) : null, `${r.provider} · ${r.license ?? ""}`]
      .filter(Boolean)
      .join(" — ");

  return (
    <div className="library-online">
      <div className="library-section-label library-online-header">
        <span>
          <Globe size={11} /> {t("library.onlineSearch")}
        </span>
        <button
          type="button"
          className="library-online-settings"
          onClick={onOpenSettings}
          title={t("library.onlineConfigure")}
        >
          <Settings size={12} />
        </button>
      </div>
      <div className="library-online-searchbar">
        <input
          placeholder={t("library.onlineSearchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch();
          }}
        />
        <button type="button" onClick={runSearch} disabled={searching || !query.trim()}>
          {searching ? <Loader2 size={13} className="spin" /> : <Search size={13} />}
        </button>
      </div>

      {errors.map((err) => (
        <p className="library-online-warning" key={err}>
          {err}
        </p>
      ))}

      {providers !== null && providers.length === 0 && (
        <button type="button" className="library-online-needs-key" onClick={onOpenSettings}>
          {t("library.onlineNeedsKey")}
        </button>
      )}

      {providers !== null && providers.length > 0 && results.length === 0 && !searching && (
        <p className="library-online-empty">{t("library.onlineNoResults")}</p>
      )}

      {kind === "audio" ? (
        <div className="library-audio-list">
          {/* Lecteur de pré-écoute partagé : lit le flux distant, un seul son à la fois. */}
          {previewing && <audio src={previewing} autoPlay onEnded={() => setPreviewing(null)} />}
          {results.map((r) => (
            <div
              key={`${r.provider}-${r.download_url}`}
              className={`library-audio-item${importing === r.download_url ? " importing" : ""}${previewing === r.download_url ? " previewing" : ""}`}
              onClick={() => setPreviewing((p) => (p === r.download_url ? null : r.download_url))}
              title={resultTitle(r)}
            >
              {previewing === r.download_url ? (
                <Pause size={15} color="var(--color-audio)" />
              ) : (
                <Play size={15} color="var(--color-audio)" />
              )}
              <span className="mono library-online-audio-name">{r.filename}</span>
              {r.duration != null && <span className="mono library-online-duration">{formatDuration(r.duration)}</span>}
              <button
                type="button"
                className="library-online-add"
                title={t("library.onlineAdd")}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePick(r);
                }}
              >
                {importing === r.download_url ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="library-grid-2">
          {results.map((r) => (
            <div
              key={`${r.provider}-${r.download_url}`}
              className={`library-media-tile${importing === r.download_url ? " importing" : ""}`}
              style={{ aspectRatio: kind === "video" ? "16/10" : "1" }}
              // Vidéo : le clic ouvre l'aperçu (lecture avant import) ; image : import direct,
              // la vignette fait déjà office d'aperçu.
              onClick={() => (kind === "video" ? setVideoPreview(r) : handlePick(r))}
              title={resultTitle(r)}
            >
              {r.thumbnail_url ? (
                <img src={r.thumbnail_url} alt={r.filename} loading="lazy" />
              ) : (
                <VideoIcon size={20} />
              )}
              {kind === "video" && importing !== r.download_url && (
                <span className="library-online-tile-play">
                  <Play size={16} fill="#fff" color="#fff" />
                </span>
              )}
              {importing === r.download_url && (
                <span className="library-online-tile-loader">
                  <Loader2 size={18} className="spin" />
                </span>
              )}
              <span className="library-media-label mono">{r.provider}</span>
            </div>
          ))}
        </div>
      )}

      {videoPreview && (
        <div className="modal-backdrop" onClick={() => setVideoPreview(null)}>
          <div className="stock-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stock-preview-header">
              <span className="mono stock-preview-title" title={resultTitle(videoPreview)}>
                {videoPreview.filename}
              </span>
              <button type="button" className="modal-close" onClick={() => setVideoPreview(null)}>
                <X size={16} />
              </button>
            </div>
            {/* Lecture en streaming du fichier distant, avant tout téléchargement. */}
            <video src={videoPreview.download_url} controls autoPlay className="stock-preview-video" />
            <div className="stock-preview-footer">
              <span className="stock-preview-meta">
                {[
                  videoPreview.author ? t("library.onlineBy", { author: videoPreview.author }) : null,
                  videoPreview.provider,
                  videoPreview.license,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <button
                type="button"
                className="btn-primary"
                disabled={importing !== null}
                onClick={() => handlePick(videoPreview)}
              >
                {importing === videoPreview.download_url ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                {t("library.onlineAdd")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MediaLibrary({
  kind,
  projectDir,
  onAdd,
  search,
  onOpenSettings,
}: {
  kind: AssetKind;
  projectDir: string;
  onAdd: (relativeSrc: string, name: string) => void;
  search: string;
  onOpenSettings: () => void;
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

  // Import distant : rafraîchit la liste locale puis ajoute l'élément à la scène, comme un
  // import de fichier local.
  function handleImportedFromOnline(relativeSrc: string, name: string) {
    refresh();
    onAdd(relativeSrc, name);
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
        <OnlineSearch
          kind={kind}
          projectDir={projectDir}
          onImported={handleImportedFromOnline}
          onOpenSettings={onOpenSettings}
        />
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
      <OnlineSearch
        kind={kind}
        projectDir={projectDir}
        onImported={handleImportedFromOnline}
        onOpenSettings={onOpenSettings}
      />
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
  onOpenSettings,
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
        {active === "video" && (
          <MediaLibrary
            kind="video"
            projectDir={projectDir}
            onAdd={onAddVideo}
            search={search}
            onOpenSettings={onOpenSettings}
          />
        )}
        {active === "image" && (
          <MediaLibrary
            kind="image"
            projectDir={projectDir}
            onAdd={onAddImage}
            search={search}
            onOpenSettings={onOpenSettings}
          />
        )}
        {active === "audio" && (
          <MediaLibrary
            kind="audio"
            projectDir={projectDir}
            onAdd={onAddAudio}
            search={search}
            onOpenSettings={onOpenSettings}
          />
        )}
        {active === "shape" && <ShapeLibrary onAddShape={onAddShape} search={search} />}
      </div>
    </aside>
  );
}
