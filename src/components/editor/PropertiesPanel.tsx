import { useTranslation } from "react-i18next";
import {
  MousePointer2,
  Type,
  Image as ImageIcon,
  Video as VideoIcon,
  Shapes,
  Music,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { Element } from "../../bindings/Element";
import type { AudioTrack } from "../../bindings/AudioTrack";
import type { AnimationType } from "../../bindings/AnimationType";
import type { ImagePanType } from "../../bindings/ImagePanType";
import type { ElementPatch } from "../../lib/elements";

const COLOR_SWATCHES = [
  "rgba(255,255,255,1)",
  "rgba(15,15,21,1)",
  "rgba(92,134,255,1)",
  "rgba(164,92,255,1)",
  "rgba(56,209,122,1)",
];

const FIT_MODES = ["cover", "stretch", "fit-largest", "fit-width", "fit-height"] as const;

const ANIMATION_OPTIONS: { type: AnimationType; labelKey: string }[] = [
  { type: "fade", labelKey: "properties.animFade" },
  { type: "slide-left", labelKey: "properties.animSlideLeft" },
  { type: "slide-up", labelKey: "properties.animSlideUp" },
  { type: "zoom-in", labelKey: "properties.animZoomIn" },
  { type: "zoom-out", labelKey: "properties.animZoomOut" },
  { type: "rotate", labelKey: "properties.animRotate" },
  { type: "blur", labelKey: "properties.animBlur" },
  { type: "bounce", labelKey: "properties.animBounce" },
];

function AnimationFields({ element, onUpdate }: { element: Element; onUpdate: Props["onUpdate"] }) {
  const { t } = useTranslation();
  const current = element.animations[0]?.animation_type ?? null;

  function toggle(type: AnimationType) {
    if (current === type) {
      onUpdate({ animations: [] });
    } else {
      onUpdate({
        animations: [{ animation_type: type, direction: "in", duration: 0.6, easing: "power2-out", with_fade: true }],
      });
    }
  }

  return (
    <div className="properties-section">
      <span className="properties-label">{t("properties.animation")}</span>
      <div className="properties-grid-2">
        {ANIMATION_OPTIONS.map((opt) => (
          <button
            type="button"
            key={opt.type}
            className={`properties-anim-tile${current === opt.type ? " active" : ""}`}
            onClick={() => toggle(opt.type)}
          >
            {t(opt.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

const PAN_OPTIONS: { value: ImagePanType | ""; labelKey: string }[] = [
  { value: "", labelKey: "properties.kenBurnsNone" },
  { value: "zoomIn", labelKey: "properties.panZoomIn" },
  { value: "zoomOut", labelKey: "properties.panZoomOut" },
  { value: "panLeft", labelKey: "properties.panLeft" },
  { value: "panRight", labelKey: "properties.panRight" },
  { value: "panUp", labelKey: "properties.panUp" },
  { value: "panDown", labelKey: "properties.panDown" },
];

function ImagePanFields({
  element,
  onUpdate,
}: {
  element: Extract<Element, { type: "image" | "video" }>;
  onUpdate: Props["onUpdate"];
}) {
  const { t } = useTranslation();
  const pan = element.image_pan;
  return (
    <div className="properties-section">
      <span className="properties-label">{t("properties.kenBurns")}</span>
      <select
        className="properties-input"
        value={pan?.pan_type ?? ""}
        onChange={(e) =>
          onUpdate({
            image_pan: e.target.value
              ? { pan_type: e.target.value as ImagePanType, intensity: pan?.intensity ?? 0.5 }
              : null,
          })
        }
      >
        {PAN_OPTIONS.map((o) => (
          <option key={o.labelKey} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>
      {pan && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={pan.intensity}
          onChange={(e) => onUpdate({ image_pan: { ...pan, intensity: Number(e.target.value) } })}
        />
      )}
    </div>
  );
}

interface Props {
  element: Element | null;
  audioTrack: AudioTrack | null;
  onUpdate: (patch: ElementPatch) => void;
  onUpdateAudio: (patch: Partial<AudioTrack>) => void;
  onReorder: (direction: 1 | -1) => void;
}

function AudioProperties({ track, onUpdate }: { track: AudioTrack; onUpdate: Props["onUpdateAudio"] }) {
  const { t } = useTranslation();
  return (
    <>
      <Header color="var(--color-audio)" icon={<Music size={13} />} title="Audio" subtitle={track.name} />

      <div className="properties-section">
        <span className="properties-label">Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={track.volume}
          onChange={(e) => onUpdate({ volume: Number(e.target.value) })}
        />
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.position")} (s)</span>
        <input
          className="properties-input mono"
          type="number"
          step={0.1}
          value={track.audio_offset}
          onChange={(e) => onUpdate({ audio_offset: Number(e.target.value) })}
        />
      </div>
    </>
  );
}

function PositionFields({ element, onUpdate }: { element: Element; onUpdate: Props["onUpdate"] }) {
  const { t } = useTranslation();
  return (
    <div className="properties-section">
      <span className="properties-label">{t("properties.position")}</span>
      <div className="properties-grid-2">
        <label className="properties-mini-field">
          X
          <input
            className="properties-input mono"
            type="number"
            value={Math.round(element.x)}
            onChange={(e) => onUpdate({ x: Number(e.target.value) })}
          />
        </label>
        <label className="properties-mini-field">
          Y
          <input
            className="properties-input mono"
            type="number"
            value={Math.round(element.y)}
            onChange={(e) => onUpdate({ y: Number(e.target.value) })}
          />
        </label>
        <label className="properties-mini-field">
          W
          <input
            className="properties-input mono"
            type="number"
            value={Math.round(element.width)}
            onChange={(e) => onUpdate({ width: Number(e.target.value) })}
          />
        </label>
        <label className="properties-mini-field">
          H
          <input
            className="properties-input mono"
            type="number"
            value={Math.round(element.height)}
            onChange={(e) => onUpdate({ height: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}

function Header({
  color,
  icon,
  title,
  subtitle,
}: {
  color: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="properties-header">
      <span className="properties-badge" style={{ background: color }}>
        {icon}
      </span>
      <div>
        <div className="properties-title">{title}</div>
        <div className="properties-subtitle">{subtitle}</div>
      </div>
    </div>
  );
}

function TextProperties({
  element,
  onUpdate,
}: {
  element: Extract<Element, { type: "text" }>;
  onUpdate: Props["onUpdate"];
}) {
  const { t } = useTranslation();
  return (
    <>
      <Header
        color="var(--color-text)"
        icon={<Type size={13} />}
        title={t("properties.textTitle")}
        subtitle={t("properties.layerSelected")}
      />

      <div className="properties-section">
        <span className="properties-label">{t("properties.content")}</span>
        <textarea
          className="properties-textarea"
          value={element.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          rows={2}
        />
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.font")}</span>
        <input
          className="properties-input"
          value={element.font_family ?? ""}
          onChange={(e) => onUpdate({ font_family: e.target.value })}
        />
        <div className="properties-row">
          <input
            className="properties-input mono"
            type="number"
            step={0.1}
            value={element.font_size ?? 0}
            onChange={(e) => onUpdate({ font_size: Number(e.target.value) })}
          />
          <button
            type="button"
            className={`properties-toggle${element.font_weight === "bold" ? " active" : ""}`}
            onClick={() => onUpdate({ font_weight: element.font_weight === "bold" ? "normal" : "bold" })}
          >
            B
          </button>
          <button
            type="button"
            className={`properties-toggle${element.font_style === "italic" ? " active" : ""}`}
            onClick={() => onUpdate({ font_style: element.font_style === "italic" ? "normal" : "italic" })}
          >
            I
          </button>
        </div>
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.color")}</span>
        <div className="properties-swatches">
          {COLOR_SWATCHES.map((c) => (
            <button
              type="button"
              key={c}
              className={`properties-swatch${element.color === c ? " selected" : ""}`}
              style={{ background: c }}
              onClick={() => onUpdate({ color: c })}
            />
          ))}
        </div>
      </div>

      <PositionFields element={element} onUpdate={onUpdate} />
      <AnimationFields element={element} onUpdate={onUpdate} />
    </>
  );
}

function MediaProperties({
  element,
  onUpdate,
}: {
  element: Extract<Element, { type: "image" | "video" }>;
  onUpdate: Props["onUpdate"];
}) {
  const { t } = useTranslation();
  return (
    <>
      <Header
        color={element.type === "image" ? "var(--color-image)" : "var(--color-video)"}
        icon={element.type === "image" ? <ImageIcon size={13} /> : <VideoIcon size={13} />}
        title={element.type === "image" ? t("properties.imageTitle") : t("properties.videoTitle")}
        subtitle={element.name}
      />

      <div className="properties-section">
        <span className="properties-label">{t("properties.fit")}</span>
        <select
          className="properties-input"
          value={element.fit_mode}
          onChange={(e) => onUpdate({ fit_mode: e.target.value as (typeof FIT_MODES)[number] })}
        >
          {FIT_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <ImagePanFields element={element} onUpdate={onUpdate} />
      <PositionFields element={element} onUpdate={onUpdate} />
      <AnimationFields element={element} onUpdate={onUpdate} />
    </>
  );
}

function ShapeProperties({
  element,
  onUpdate,
}: {
  element: Extract<Element, { type: "shape" }>;
  onUpdate: Props["onUpdate"];
}) {
  const { t } = useTranslation();
  return (
    <>
      <Header
        color="var(--color-shape)"
        icon={<Shapes size={13} />}
        title={t("properties.shapeTitle")}
        subtitle={element.name}
      />

      <div className="properties-section">
        <span className="properties-label">{t("properties.fillColor")}</span>
        <div className="properties-swatches">
          {COLOR_SWATCHES.map((c) => (
            <button
              type="button"
              key={c}
              className={`properties-swatch${element.fill === c ? " selected" : ""}`}
              style={{ background: c }}
              onClick={() => onUpdate({ fill: c })}
            />
          ))}
        </div>
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.stroke")}</span>
        <div className="properties-row">
          <input
            className="properties-input mono"
            type="number"
            min={0}
            value={element.stroke_width}
            onChange={(e) => onUpdate({ stroke_width: Number(e.target.value) })}
          />
          <button
            type="button"
            className={`properties-toggle${element.stroke !== "none" ? " active" : ""}`}
            onClick={() => onUpdate({ stroke: element.stroke === "none" ? "rgba(255,255,255,1)" : "none" })}
          >
            S
          </button>
        </div>
      </div>

      <PositionFields element={element} onUpdate={onUpdate} />
      <AnimationFields element={element} onUpdate={onUpdate} />
    </>
  );
}

export default function PropertiesPanel({ element, audioTrack, onUpdate, onUpdateAudio, onReorder }: Props) {
  const { t } = useTranslation();

  if (audioTrack) {
    return (
      <aside className="editor-properties">
        <div className="properties-content">
          <AudioProperties track={audioTrack} onUpdate={onUpdateAudio} />
        </div>
      </aside>
    );
  }

  return (
    <aside className="editor-properties">
      {element ? (
        <div className="properties-content">
          <div className="properties-reorder">
            <button type="button" className="icon-btn" onClick={() => onReorder(1)} title={t("properties.advance")}>
              <ArrowUp size={14} />
            </button>
            <button type="button" className="icon-btn" onClick={() => onReorder(-1)} title={t("properties.sendBack")}>
              <ArrowDown size={14} />
            </button>
          </div>
          {element.type === "text" && <TextProperties element={element} onUpdate={onUpdate} />}
          {(element.type === "image" || element.type === "video") && (
            <MediaProperties element={element} onUpdate={onUpdate} />
          )}
          {element.type === "shape" && <ShapeProperties element={element} onUpdate={onUpdate} />}
        </div>
      ) : (
        <div className="properties-empty">
          <MousePointer2 size={22} color="var(--text-faint)" />
          <p className="properties-empty-title">{t("properties.empty")}</p>
          <p className="properties-empty-hint">{t("properties.emptyHint")}</p>
        </div>
      )}
    </aside>
  );
}
