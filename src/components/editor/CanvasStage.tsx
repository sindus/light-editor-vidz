import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Undo2, Redo2, Maximize2, Minus, Plus, SkipBack, SkipForward, Play, Pause } from "lucide-react";
import type { Project } from "../../bindings/Project";
import type { Composition } from "../../bindings/Composition";
import type { Element } from "../../bindings/Element";
import type { TransitionType } from "../../bindings/TransitionType";
import { formatTimecode } from "../../lib/format";
import { assetUrl } from "../../lib/assetUrl";
import { isElementActive } from "../../lib/timeline";
import {
  resolveCompositionTransition,
  resolveCompositionWipeClip,
  resolveElementAnimations,
  resolveImagePan,
  transformToCss,
} from "../../lib/animate";
import ElementInteraction, { type GeometryPatch, type SnapGuides } from "./ElementInteraction";
import ShapeView from "./ShapeView";

interface Props {
  project: Project;
  projectDir: string;
  composition: Composition;
  localTime: number;
  playing: boolean;
  onTogglePlay: () => void;
  onSeekToStart: () => void;
  selectedIds: string[];
  onSelectElement: (id: string | null, additive: boolean) => void;
  onMarqueeSelect: (ids: string[], additive: boolean) => void;
  onUpdateElement: (elementId: string, patch: Partial<GeometryPatch>) => void;
  onSetTransitionIn: (transitionType: TransitionType | null) => void;
  onSetTransitionOut: (transitionType: TransitionType | null) => void;
  onSeekToNext: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;

const ACCENT_BY_TYPE: Record<Element["type"], string> = {
  text: "var(--color-text)",
  image: "var(--color-image)",
  video: "var(--color-video)",
  shape: "var(--color-shape)",
};

const TRANSITION_OPTIONS: { value: TransitionType | ""; labelKey: string }[] = [
  { value: "", labelKey: "canvas.transitionNone" },
  { value: "fade", labelKey: "canvas.transitionFade" },
  { value: "slide-left", labelKey: "canvas.transitionSlideLeft" },
  { value: "slide-right", labelKey: "canvas.transitionSlideRight" },
  { value: "slide-up", labelKey: "canvas.transitionSlideUp" },
  { value: "slide-down", labelKey: "canvas.transitionSlideDown" },
  { value: "zoom", labelKey: "canvas.transitionZoom" },
  { value: "blur", labelKey: "canvas.transitionBlur" },
  { value: "flip-h", labelKey: "canvas.transitionFlipH" },
  { value: "flip-v", labelKey: "canvas.transitionFlipV" },
  { value: "rotate-cw", labelKey: "canvas.transitionRotateCw" },
  { value: "rotate-ccw", labelKey: "canvas.transitionRotateCcw" },
  { value: "wipe-left", labelKey: "canvas.transitionWipeLeft" },
  { value: "wipe-right", labelKey: "canvas.transitionWipeRight" },
  { value: "wipe-up", labelKey: "canvas.transitionWipeUp" },
  { value: "wipe-down", labelKey: "canvas.transitionWipeDown" },
];

function activeDurationOf(el: Element, composition: Composition): number {
  return el.duration ?? composition.duration - el.start_time;
}

function TextElementView({ element }: { element: Extract<Element, { type: "text" }> }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems:
          element.vertical_alignment === "top"
            ? "flex-start"
            : element.vertical_alignment === "bottom"
              ? "flex-end"
              : "center",
        justifyContent:
          element.alignment === "left" ? "flex-start" : element.alignment === "right" ? "flex-end" : "center",
        textAlign: element.alignment,
        color: element.color,
        background: element.background_color ?? undefined,
        fontSize: `${element.font_size ?? 4}cqw`,
        fontFamily: element.font_family ?? undefined,
        fontWeight: element.font_weight === "bold" ? 800 : 500,
        fontStyle: element.font_style ?? undefined,
        letterSpacing: element.letter_spacing ? `${element.letter_spacing}cqw` : undefined,
        lineHeight: element.line_height ?? undefined,
        textShadow: element.text_shadow ? `2px 2px 4px ${element.text_shadow}` : undefined,
        textDecoration:
          element.underline && element.strikethrough
            ? "underline line-through"
            : element.underline
              ? "underline"
              : element.strikethrough
                ? "line-through"
                : undefined,
        padding: "0 4px",
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {element.content}
    </div>
  );
}

function ImageElementView({
  element,
  projectDir,
  panTransform,
}: {
  element: Extract<Element, { type: "image" }>;
  projectDir: string;
  panTransform: string;
}) {
  const objectFit = element.fit_mode === "stretch" ? "fill" : element.fit_mode === "cover" ? "cover" : "contain";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        borderRadius: element.corner_radius ? `${element.corner_radius}px` : undefined,
        border: element.border_color ? `${element.border_width ?? 2}px solid ${element.border_color}` : undefined,
        boxSizing: "border-box",
      }}
    >
      <img
        src={assetUrl(projectDir, element.src)}
        alt={element.name}
        style={{
          width: "100%",
          height: "100%",
          objectFit,
          background: element.background_color ?? "rgba(255,255,255,0.04)",
          pointerEvents: "none",
          transform: panTransform || undefined,
        }}
      />
    </div>
  );
}

function VideoElementView({
  element,
  projectDir,
  localTime,
  playing,
  panTransform,
}: {
  element: Extract<Element, { type: "video" }>;
  projectDir: string;
  localTime: number;
  playing: boolean;
  panTransform: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const objectFit = element.fit_mode === "stretch" ? "fill" : element.fit_mode === "cover" ? "cover" : "contain";

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const speed = element.playback_speed > 0.01 ? element.playback_speed : 1;
    const targetTime = Math.max(0, localTime - element.start_time) * speed + element.video_offset;
    if (Math.abs(video.currentTime - targetTime) > 0.25) {
      video.currentTime = targetTime;
    }
    video.playbackRate = speed;
    if (playing) video.play().catch(() => {});
    else video.pause();
  }, [localTime, playing, element.start_time, element.video_offset, element.playback_speed]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        borderRadius: element.corner_radius ? `${element.corner_radius}px` : undefined,
        border: element.border_color ? `${element.border_width ?? 2}px solid ${element.border_color}` : undefined,
        boxSizing: "border-box",
      }}
    >
      <video
        ref={ref}
        src={assetUrl(projectDir, element.src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit,
          background: element.background_color ?? "rgba(255,255,255,0.04)",
          pointerEvents: "none",
          transform: panTransform || undefined,
        }}
        muted
      />
    </div>
  );
}

export default function CanvasStage({
  project,
  projectDir,
  composition,
  localTime,
  playing,
  onTogglePlay,
  onSeekToStart,
  selectedIds,
  onSelectElement,
  onMarqueeSelect,
  onUpdateElement,
  onSetTransitionIn,
  onSetTransitionOut,
  onSeekToNext,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  const { t } = useTranslation();
  const ratio = `${project.width}/${project.height}`;
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState<SnapGuides | null>(null);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);

  function startMarquee(e: ReactPointerEvent, additive: boolean) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = ((e.clientX - rect.left) / rect.width) * 100;
    const startY = ((e.clientY - rect.top) / rect.height) * 100;
    let current: MarqueeRect = { x: startX, y: startY, width: 0, height: 0 };
    setMarquee(current);

    function onMove(ev: PointerEvent) {
      const r = stageRef.current?.getBoundingClientRect();
      if (!r) return;
      const x = ((ev.clientX - r.left) / r.width) * 100;
      const y = ((ev.clientY - r.top) / r.height) * 100;
      current = {
        x: Math.min(startX, x),
        y: Math.min(startY, y),
        width: Math.abs(x - startX),
        height: Math.abs(y - startY),
      };
      setMarquee(current);
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setMarquee(null);
      if (current.width < 0.5 && current.height < 0.5) {
        if (!additive) onSelectElement(null, false);
        return;
      }
      const ids = composition.elements
        .filter((el) => isElementActive(el, localTime))
        .filter(
          (el) =>
            el.x < current.x + current.width &&
            el.x + el.width > current.x &&
            el.y < current.y + current.height &&
            el.y + el.height > current.y,
        )
        .map((el) => el.id);
      onMarqueeSelect(ids, additive);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const compTransitionIn = resolveCompositionTransition(
    composition.transition_in,
    "in",
    localTime,
    composition.duration,
  );
  const compTransitionOut = resolveCompositionTransition(
    composition.transition_out,
    "out",
    localTime,
    composition.duration,
  );
  const compCss = transformToCss({
    opacity: compTransitionIn.opacity * compTransitionOut.opacity,
    dxPct: compTransitionIn.dxPct + compTransitionOut.dxPct,
    dyPct: compTransitionIn.dyPct + compTransitionOut.dyPct,
    scale: compTransitionIn.scale * compTransitionOut.scale,
    rotateDeg: compTransitionIn.rotateDeg + compTransitionOut.rotateDeg,
    skewDeg: compTransitionIn.skewDeg + compTransitionOut.skewDeg,
    blurPx: Math.max(compTransitionIn.blurPx, compTransitionOut.blurPx),
  });
  const compClipPath = resolveCompositionWipeClip(
    composition.transition_in,
    composition.transition_out,
    localTime,
    composition.duration,
  );

  return (
    <section className="editor-canvas-col">
      <div className="canvas-toolbar">
        <div className="canvas-toolbar-left">
          <button type="button" className="icon-btn" onClick={onUndo} disabled={!canUndo} title={t("canvas.undo")}>
            <Undo2 size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={onRedo} disabled={!canRedo} title={t("canvas.redo")}>
            <Redo2 size={16} />
          </button>
          <span className="canvas-toolbar-sep" />
          <button type="button" className="icon-btn" onClick={() => setZoom(1)} title={t("canvas.fit")}>
            <Maximize2 size={16} />
          </button>
        </div>
        <div className="canvas-toolbar-right">
          <select
            className="canvas-transition-select mono"
            value={composition.transition_in?.transition_type ?? ""}
            onChange={(e) => onSetTransitionIn(e.target.value ? (e.target.value as TransitionType) : null)}
            title={t("canvas.transitionLabel")}
          >
            {TRANSITION_OPTIONS.map((o) => (
              <option key={`in-${o.labelKey}`} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
          <select
            className="canvas-transition-select mono"
            value={composition.transition_out?.transition_type ?? ""}
            onChange={(e) => onSetTransitionOut(e.target.value ? (e.target.value as TransitionType) : null)}
            title={t("canvas.transitionOutLabel")}
          >
            {TRANSITION_OPTIONS.map((o) => (
              <option key={`out-${o.labelKey}`} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
          <div className="canvas-zoom-controls mono">
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
              title={t("canvas.zoomOut")}
            >
              <Minus size={12} />
            </button>
            <button type="button" className="canvas-zoom-fit" onClick={() => setZoom(1)}>
              {t("canvas.fitLabel")}
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
              title={t("canvas.zoomIn")}
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      </div>

      <div className="canvas-stage-wrap">
        <div className="canvas-zoom-wrap" style={{ transform: zoom !== 1 ? `scale(${zoom})` : undefined }}>
          <div
            ref={stageRef}
            className="canvas-stage"
            style={{
              aspectRatio: ratio,
              transform: compCss.transform || undefined,
              opacity: compCss.opacity,
              filter: compCss.filter || undefined,
              clipPath: compClipPath || undefined,
            }}
            onPointerDown={(e) => {
              if (e.target !== e.currentTarget) return;
              startMarquee(e, e.shiftKey || e.metaKey || e.ctrlKey);
            }}
          >
            {composition.elements
              .filter((el) => isElementActive(el, localTime))
              .map((el) => {
                const activeDuration = activeDurationOf(el, composition);
                const localElementTime = localTime - el.start_time;
                const anim = resolveElementAnimations(el.animations, localElementTime, activeDuration);
                const css = transformToCss(anim);
                const panTransform =
                  el.type === "image" || el.type === "video"
                    ? resolveImagePan(el.image_pan, localElementTime, activeDuration)
                    : "";
                const siblings = composition.elements
                  .filter((other) => other.id !== el.id)
                  .map((other) => ({ x: other.x, y: other.y, width: other.width, height: other.height }));
                return (
                  <ElementInteraction
                    key={el.id}
                    geometry={{ x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation }}
                    selected={selectedIds.includes(el.id)}
                    accentColor={ACCENT_BY_TYPE[el.type]}
                    stageRef={stageRef}
                    siblings={siblings}
                    onSelect={(additive) => onSelectElement(el.id, additive)}
                    onChange={(patch) => onUpdateElement(el.id, patch)}
                    onGuides={setGuides}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        opacity: css.opacity,
                        transform: css.transform || undefined,
                        filter: css.filter || undefined,
                        mixBlendMode: el.blend_mode ?? undefined,
                      }}
                    >
                      {el.type === "text" && <TextElementView element={el} />}
                      {el.type === "image" && (
                        <ImageElementView element={el} projectDir={projectDir} panTransform={panTransform} />
                      )}
                      {el.type === "video" && (
                        <VideoElementView
                          element={el}
                          projectDir={projectDir}
                          localTime={localTime}
                          playing={playing}
                          panTransform={panTransform}
                        />
                      )}
                      {el.type === "shape" && <ShapeView element={el} />}
                    </div>
                  </ElementInteraction>
                );
              })}
            {guides?.vertical.map((x) => (
              <div key={`v-${x}`} className="snap-guide snap-guide-v" style={{ left: `${x}%` }} />
            ))}
            {guides?.horizontal.map((y) => (
              <div key={`h-${y}`} className="snap-guide snap-guide-h" style={{ top: `${y}%` }} />
            ))}
            {marquee && (
              <div
                className="marquee-select"
                style={{
                  left: `${marquee.x}%`,
                  top: `${marquee.y}%`,
                  width: `${marquee.width}%`,
                  height: `${marquee.height}%`,
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div className="playback-bar">
        <button type="button" className="icon-btn" onClick={onSeekToStart} title={t("canvas.restart")}>
          <SkipBack size={16} />
        </button>
        <button type="button" className="play-btn" onClick={onTogglePlay}>
          {playing ? <Pause size={16} fill="#fff" /> : <Play size={16} fill="#fff" />}
        </button>
        <button type="button" className="icon-btn" onClick={onSeekToNext} title={t("canvas.next")}>
          <SkipForward size={16} />
        </button>
        <span className="mono playback-timecode">
          {formatTimecode(composition.start_time + localTime, project.fps)} /{" "}
          {formatTimecode(project.duration, project.fps)}
        </span>
      </div>
    </section>
  );
}
