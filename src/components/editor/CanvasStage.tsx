import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Undo2, Redo2, Maximize2, Minus, Plus, SkipBack, SkipForward, Play, Pause } from "lucide-react";
import type { Project } from "../../bindings/Project";
import type { Composition } from "../../bindings/Composition";
import type { Element } from "../../bindings/Element";
import type { TransitionType } from "../../bindings/TransitionType";
import { formatTimecode } from "../../lib/format";
import { isElementActive } from "../../lib/timeline";
import {
  resolveCompositionTransition,
  resolveCompositionWipeClip,
  applyTextReveal,
  resolveElementAnimations,
  resolveTextReveal,
  resolveImagePan,
  transformToCss,
} from "../../lib/animate";
import ElementInteraction, { type GeometryPatch, type SnapGuides } from "./ElementInteraction";
import ShapeView from "./ShapeView";
import { ImageElementView, TextElementView, VideoElementView } from "./ElementViews";

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
  const stageRef = useRef<HTMLDivElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState<SnapGuides | null>(null);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  // Dimensions du canvas calculées explicitement en pixels plutôt que via la propriété CSS
  // `aspect-ratio` : certaines versions de WebKitGTK (webview Tauri sur Linux) ne la supportent
  // pas et retombent sur une hauteur de 0, rendant tout le canvas invisible sans erreur visible.
  useEffect(() => {
    const wrap = stageWrapRef.current;
    if (!wrap) return;
    const WRAP_PADDING = 68; // 34px de chaque côté, voir .canvas-stage-wrap
    const MAX_STAGE_WIDTH = 860;
    function recompute() {
      if (!wrap) return;
      const availW = wrap.clientWidth - WRAP_PADDING;
      const availH = wrap.clientHeight - WRAP_PADDING;
      if (availW <= 0 || availH <= 0) return;
      const projectRatio = project.width / project.height;
      let w = Math.min(availW, MAX_STAGE_WIDTH);
      let h = w / projectRatio;
      if (h > availH) {
        h = availH;
        w = h * projectRatio;
      }
      setStageSize({ width: Math.round(w), height: Math.round(h) });
    }
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [project.width, project.height]);

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

      <div className="canvas-stage-wrap" ref={stageWrapRef}>
        <div className="canvas-zoom-wrap" style={{ transform: zoom !== 1 ? `scale(${zoom})` : undefined }}>
          <div
            ref={stageRef}
            className="canvas-stage"
            style={{
              width: stageSize.width || undefined,
              height: stageSize.height || undefined,
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
                      {el.type === "text" && (
                        <TextElementView
                          element={el}
                          content={applyTextReveal(
                            el.content,
                            resolveTextReveal(el.animations, localElementTime, activeDuration),
                          )}
                        />
                      )}
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
