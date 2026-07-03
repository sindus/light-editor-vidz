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
  Plus,
  X,
  Trash2,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
} from "lucide-react";
import type { Element } from "../../bindings/Element";
import type { AudioTrack } from "../../bindings/AudioTrack";
import type { AnimationType } from "../../bindings/AnimationType";
import type { Animation } from "../../bindings/Animation";
import type { Easing } from "../../bindings/Easing";
import type { TextAlign } from "../../bindings/TextAlign";
import type { VerticalAlign } from "../../bindings/VerticalAlign";
import type { ImagePanType } from "../../bindings/ImagePanType";
import type { ElementPatch, AlignEdge } from "../../lib/elements";
import ColorPickerField from "./ColorPickerField";

const FIT_MODES = ["cover", "stretch", "fit-largest", "fit-width", "fit-height"] as const;

const ANIMATION_OPTIONS: { type: AnimationType; labelKey: string }[] = [
  { type: "fade", labelKey: "properties.animFade" },
  { type: "slide-left", labelKey: "properties.animSlideLeft" },
  { type: "slide-right", labelKey: "properties.animSlideRight" },
  { type: "slide-up", labelKey: "properties.animSlideUp" },
  { type: "slide-down", labelKey: "properties.animSlideDown" },
  { type: "fade-left", labelKey: "properties.animFadeLeft" },
  { type: "fade-right", labelKey: "properties.animFadeRight" },
  { type: "fade-up", labelKey: "properties.animFadeUp" },
  { type: "fade-down", labelKey: "properties.animFadeDown" },
  { type: "zoom-in", labelKey: "properties.animZoomIn" },
  { type: "zoom-out", labelKey: "properties.animZoomOut" },
  { type: "rotate", labelKey: "properties.animRotate" },
  { type: "flip", labelKey: "properties.animFlip" },
  { type: "blur", labelKey: "properties.animBlur" },
  { type: "bounce", labelKey: "properties.animBounce" },
  { type: "drop", labelKey: "properties.animDrop" },
  { type: "skew-left", labelKey: "properties.animSkewLeft" },
  { type: "skew-right", labelKey: "properties.animSkewRight" },
  { type: "roll", labelKey: "properties.animRoll" },
  { type: "spin", labelKey: "properties.animSpin" },
];

const EASING_OPTIONS: { value: Easing; labelKey: string }[] = [
  { value: "linear", labelKey: "properties.easingLinear" },
  { value: "power1-in", labelKey: "properties.easingPower1In" },
  { value: "power1-out", labelKey: "properties.easingPower1Out" },
  { value: "power1-in-out", labelKey: "properties.easingPower1InOut" },
  { value: "power2-in", labelKey: "properties.easingPower2In" },
  { value: "power2-out", labelKey: "properties.easingPower2Out" },
  { value: "power2-in-out", labelKey: "properties.easingPower2InOut" },
  { value: "power3-in", labelKey: "properties.easingPower3In" },
  { value: "power3-out", labelKey: "properties.easingPower3Out" },
  { value: "power3-in-out", labelKey: "properties.easingPower3InOut" },
  { value: "bounce", labelKey: "properties.easingBounce" },
];

const DEFAULT_ANIMATION: Animation = {
  animation_type: "fade",
  direction: "in",
  duration: 0.6,
  easing: "power2-out",
  with_fade: true,
};

function AnimationFields({ element, onUpdate }: { element: Element; onUpdate: Props["onUpdate"] }) {
  const { t } = useTranslation();

  function addAnimation() {
    onUpdate({ animations: [...element.animations, { ...DEFAULT_ANIMATION }] });
  }

  function updateAnimation(index: number, patch: Partial<Animation>) {
    onUpdate({ animations: element.animations.map((a, i) => (i === index ? { ...a, ...patch } : a)) });
  }

  function removeAnimation(index: number) {
    onUpdate({ animations: element.animations.filter((_, i) => i !== index) });
  }

  return (
    <div className="properties-section">
      <div className="properties-row properties-row-header">
        <span className="properties-label">{t("properties.animation")}</span>
        <button type="button" className="properties-toggle" onClick={addAnimation} title={t("properties.animAdd")}>
          <Plus size={12} />
        </button>
      </div>
      {element.animations.map((anim, i) => (
        <div key={i} className="animation-entry">
          <div className="properties-row">
            <select
              className="properties-input"
              value={anim.animation_type}
              onChange={(e) => updateAnimation(i, { animation_type: e.target.value as AnimationType })}
            >
              {ANIMATION_OPTIONS.map((opt) => (
                <option key={opt.type} value={opt.type}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="properties-toggle"
              onClick={() => removeAnimation(i)}
              title={t("properties.animRemove")}
            >
              <X size={12} />
            </button>
          </div>
          <div className="properties-row">
            <button
              type="button"
              className={`properties-toggle${anim.direction === "in" ? " active" : ""}`}
              onClick={() => updateAnimation(i, { direction: "in" })}
            >
              {t("properties.animIn")}
            </button>
            <button
              type="button"
              className={`properties-toggle${anim.direction === "out" ? " active" : ""}`}
              onClick={() => updateAnimation(i, { direction: "out" })}
            >
              {t("properties.animOut")}
            </button>
            <button
              type="button"
              className={`properties-toggle${anim.with_fade ? " active" : ""}`}
              onClick={() => updateAnimation(i, { with_fade: !anim.with_fade })}
              title={t("properties.animFadeToggle")}
            >
              {t("properties.animFadeShort")}
            </button>
          </div>
          <div className="properties-row">
            <input
              className="properties-input mono"
              type="number"
              step={0.1}
              min={0.1}
              value={anim.duration}
              onChange={(e) => updateAnimation(i, { duration: Number(e.target.value) })}
            />
            <select
              className="properties-input"
              value={anim.easing}
              onChange={(e) => updateAnimation(i, { easing: e.target.value as Easing })}
            >
              {EASING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
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
  elements: Element[];
  selectedIds: string[];
  onSelectLayer: (id: string, additive: boolean) => void;
  onReorderLayer: (id: string, toIndex: number) => void;
  onDeleteLayer: (id: string) => void;
  onAlign: (edge: AlignEdge) => void;
  onDistribute: (axis: "horizontal" | "vertical") => void;
}

const ICON_BY_TYPE: Record<Element["type"], React.ReactNode> = {
  text: <Type size={12} />,
  image: <ImageIcon size={12} />,
  video: <VideoIcon size={12} />,
  shape: <Shapes size={12} />,
};

/** Liste des calques de la composition active (ordre du tableau = z-order), réorganisable par drag. */
function LayersPanel({
  elements,
  selectedIds,
  onSelectLayer,
  onReorderLayer,
  onDeleteLayer,
}: {
  elements: Element[];
  selectedIds: string[];
  onSelectLayer: Props["onSelectLayer"];
  onReorderLayer: Props["onReorderLayer"];
  onDeleteLayer: Props["onDeleteLayer"];
}) {
  const { t } = useTranslation();
  if (elements.length === 0) return null;
  // Affiché du dessus (dernier du tableau) vers le dessous, comme la plupart des éditeurs.
  const reversed = [...elements].reverse();

  return (
    <div className="properties-section layers-panel">
      <span className="properties-label">{t("properties.layers")}</span>
      <div className="layers-list">
        {reversed.map((el, i) => {
          const layerIndex = elements.length - 1 - i;
          return (
            <div
              key={el.id}
              className={`layers-row${selectedIds.includes(el.id) ? " selected" : ""}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/layer-id", el.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData("text/layer-id");
                if (draggedId) onReorderLayer(draggedId, layerIndex);
              }}
              onClick={(e) => onSelectLayer(el.id, e.shiftKey || e.metaKey || e.ctrlKey)}
            >
              <span className="layers-row-icon">{ICON_BY_TYPE[el.type]}</span>
              <span className="layers-row-name">{el.name}</span>
              <button
                type="button"
                className="layers-row-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteLayer(el.id);
                }}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MultiSelectionProperties({
  count,
  onAlign,
  onDistribute,
}: {
  count: number;
  onAlign: Props["onAlign"];
  onDistribute: Props["onDistribute"];
}) {
  const { t } = useTranslation();
  return (
    <>
      <Header
        color="var(--accent)"
        icon={<MousePointer2 size={13} />}
        title={t("properties.multiSelection", { count })}
        subtitle={t("properties.multiSelectionHint")}
      />
      <div className="properties-section">
        <span className="properties-label">{t("properties.align")}</span>
        <div className="properties-row">
          <button type="button" className="icon-btn" onClick={() => onAlign("left")} title={t("properties.alignLeft")}>
            <AlignStartVertical size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onAlign("center-h")}
            title={t("properties.alignCenterH")}
          >
            <AlignCenterVertical size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onAlign("right")}
            title={t("properties.alignRight")}
          >
            <AlignEndVertical size={15} />
          </button>
        </div>
        <div className="properties-row">
          <button type="button" className="icon-btn" onClick={() => onAlign("top")} title={t("properties.alignTop")}>
            <AlignStartHorizontal size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onAlign("center-v")}
            title={t("properties.alignCenterV")}
          >
            <AlignCenterHorizontal size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onAlign("bottom")}
            title={t("properties.alignBottom")}
          >
            <AlignEndHorizontal size={15} />
          </button>
        </div>
      </div>
      <div className="properties-section">
        <span className="properties-label">{t("properties.distribute")}</span>
        <div className="properties-row">
          <button
            type="button"
            className="icon-btn"
            disabled={count < 3}
            onClick={() => onDistribute("horizontal")}
            title={t("properties.distributeH")}
          >
            <AlignHorizontalSpaceAround size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={count < 3}
            onClick={() => onDistribute("vertical")}
            title={t("properties.distributeV")}
          >
            <AlignVerticalSpaceAround size={15} />
          </button>
        </div>
      </div>
    </>
  );
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
        <label className="properties-mini-field">
          {t("properties.rotation")}
          <input
            className="properties-input mono"
            type="number"
            value={Math.round(element.rotation)}
            onChange={(e) => onUpdate({ rotation: Number(e.target.value) })}
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

function BackgroundColorField({
  value,
  onChange,
  defaultColor = "rgba(0,0,0,0.35)",
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  defaultColor?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="properties-section">
      <div className="properties-row properties-row-header">
        <span className="properties-label">{t("properties.backgroundColor")}</span>
        <button
          type="button"
          className={`properties-toggle${value ? " active" : ""}`}
          onClick={() => onChange(value ? null : defaultColor)}
        >
          {value ? t("properties.backgroundColorOn") : t("properties.backgroundColorOff")}
        </button>
      </div>
      {value && <ColorPickerField value={value} onChange={onChange} />}
    </div>
  );
}

const TEXT_ALIGN_OPTIONS: TextAlign[] = ["left", "center", "right"];
const TEXT_ALIGN_LABELS: Record<TextAlign, string> = { left: "⟵", center: "•", right: "⟶" };
const VERTICAL_ALIGN_OPTIONS: VerticalAlign[] = ["top", "middle", "bottom"];
const VERTICAL_ALIGN_LABELS: Record<VerticalAlign, string> = { top: "⤒", middle: "•", bottom: "⤓" };

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
        <span className="properties-label">{t("properties.alignment")}</span>
        <div className="properties-row">
          {TEXT_ALIGN_OPTIONS.map((a) => (
            <button
              type="button"
              key={a}
              className={`properties-toggle${element.alignment === a ? " active" : ""}`}
              onClick={() => onUpdate({ alignment: a })}
            >
              {TEXT_ALIGN_LABELS[a]}
            </button>
          ))}
        </div>
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.verticalAlignment")}</span>
        <div className="properties-row">
          {VERTICAL_ALIGN_OPTIONS.map((a) => (
            <button
              type="button"
              key={a}
              className={`properties-toggle${element.vertical_alignment === a ? " active" : ""}`}
              onClick={() => onUpdate({ vertical_alignment: a })}
            >
              {VERTICAL_ALIGN_LABELS[a]}
            </button>
          ))}
        </div>
      </div>

      <div className="properties-section">
        <span className="properties-label">{t("properties.color")}</span>
        <ColorPickerField value={element.color} onChange={(color) => onUpdate({ color })} />
      </div>

      <BackgroundColorField
        value={element.background_color}
        onChange={(background_color) => onUpdate({ background_color })}
      />

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

      {element.type === "video" && (
        <div className="properties-section">
          <span className="properties-label">{t("properties.videoOffset")}</span>
          <input
            className="properties-input mono"
            type="number"
            step={0.1}
            min={0}
            value={element.video_offset}
            onChange={(e) => onUpdate({ video_offset: Number(e.target.value) })}
          />
        </div>
      )}

      <BackgroundColorField
        value={element.background_color}
        onChange={(background_color) => onUpdate({ background_color })}
        defaultColor="rgba(0,0,0,1)"
      />

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
        <ColorPickerField value={element.fill} onChange={(fill) => onUpdate({ fill })} />
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
        {element.stroke !== "none" && (
          <ColorPickerField value={element.stroke} onChange={(stroke) => onUpdate({ stroke })} />
        )}
      </div>

      {element.shape_type === "rectangle" && (
        <div className="properties-section">
          <span className="properties-label">{t("properties.borderRadius")}</span>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={element.border_radius ?? 0}
            onChange={(e) => onUpdate({ border_radius: Number(e.target.value) })}
          />
        </div>
      )}

      <PositionFields element={element} onUpdate={onUpdate} />
      <AnimationFields element={element} onUpdate={onUpdate} />
    </>
  );
}

export default function PropertiesPanel({
  element,
  audioTrack,
  onUpdate,
  onUpdateAudio,
  onReorder,
  elements,
  selectedIds,
  onSelectLayer,
  onReorderLayer,
  onDeleteLayer,
  onAlign,
  onDistribute,
}: Props) {
  const { t } = useTranslation();
  const layers = (
    <LayersPanel
      elements={elements}
      selectedIds={selectedIds}
      onSelectLayer={onSelectLayer}
      onReorderLayer={onReorderLayer}
      onDeleteLayer={onDeleteLayer}
    />
  );

  if (audioTrack) {
    return (
      <aside className="editor-properties">
        <div className="properties-content">
          <AudioProperties track={audioTrack} onUpdate={onUpdateAudio} />
          {layers}
        </div>
      </aside>
    );
  }

  if (selectedIds.length > 1) {
    return (
      <aside className="editor-properties">
        <div className="properties-content">
          <MultiSelectionProperties count={selectedIds.length} onAlign={onAlign} onDistribute={onDistribute} />
          {layers}
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
            <button
              type="button"
              className="icon-btn"
              onClick={() => onDeleteLayer(element.id)}
              title={t("timeline.delete")}
            >
              <Trash2 size={14} />
            </button>
          </div>
          {element.type === "text" && <TextProperties element={element} onUpdate={onUpdate} />}
          {(element.type === "image" || element.type === "video") && (
            <MediaProperties element={element} onUpdate={onUpdate} />
          )}
          {element.type === "shape" && <ShapeProperties element={element} onUpdate={onUpdate} />}
          {layers}
        </div>
      ) : (
        <div className="properties-content">
          <div className="properties-empty">
            <MousePointer2 size={22} color="var(--text-faint)" />
            <p className="properties-empty-title">{t("properties.empty")}</p>
            <p className="properties-empty-hint">{t("properties.emptyHint")}</p>
          </div>
          {layers}
        </div>
      )}
    </aside>
  );
}
