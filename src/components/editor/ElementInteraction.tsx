import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

export interface GeometryPatch {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface Props {
  geometry: GeometryPatch;
  selected: boolean;
  accentColor: string;
  stageRef: React.RefObject<HTMLDivElement | null>;
  onChange: (patch: Partial<GeometryPatch>) => void;
  onSelect: () => void;
  children: ReactNode;
}

type HandleId = "nw" | "ne" | "se" | "sw";

const MIN_SIZE = 3;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

const HANDLES: HandleId[] = ["nw", "ne", "se", "sw"];

/** Wrapper générique drag/resize/rotate réutilisé par tous les types d'éléments (texte, image, vidéo, forme). */
export default function ElementInteraction({
  geometry,
  selected,
  accentColor,
  stageRef,
  onChange,
  onSelect,
  children,
}: Props) {
  const dragState = useRef<{
    startX: number;
    startY: number;
    startGeometry: GeometryPatch;
    rectWidth: number;
    rectHeight: number;
    centerX: number;
    centerY: number;
  } | null>(null);

  function startDrag(kind: "move" | "resize" | "rotate", handle: HandleId | undefined, e: ReactPointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startGeometry: geometry,
      rectWidth: rect.width,
      rectHeight: rect.height,
      centerX: rect.left + ((geometry.x + geometry.width / 2) / 100) * rect.width,
      centerY: rect.top + ((geometry.y + geometry.height / 2) / 100) * rect.height,
    };

    function onMove(ev: PointerEvent) {
      const state = dragState.current;
      if (!state) return;
      const dxPct = ((ev.clientX - state.startX) / state.rectWidth) * 100;
      const dyPct = ((ev.clientY - state.startY) / state.rectHeight) * 100;

      if (kind === "move") {
        onChange({
          x: clamp(state.startGeometry.x + dxPct, 0, 100 - state.startGeometry.width),
          y: clamp(state.startGeometry.y + dyPct, 0, 100 - state.startGeometry.height),
        });
      } else if (kind === "resize" && handle) {
        let x = state.startGeometry.x;
        let y = state.startGeometry.y;
        let width: number;
        let height: number;
        const left = handle === "nw" || handle === "sw";
        const top = handle === "nw" || handle === "ne";

        if (left) {
          const newX = clamp(
            state.startGeometry.x + dxPct,
            0,
            state.startGeometry.x + state.startGeometry.width - MIN_SIZE,
          );
          width = state.startGeometry.width - (newX - state.startGeometry.x);
          x = newX;
        } else {
          width = clamp(state.startGeometry.width + dxPct, MIN_SIZE, 100 - state.startGeometry.x);
        }

        if (top) {
          const newY = clamp(
            state.startGeometry.y + dyPct,
            0,
            state.startGeometry.y + state.startGeometry.height - MIN_SIZE,
          );
          height = state.startGeometry.height - (newY - state.startGeometry.y);
          y = newY;
        } else {
          height = clamp(state.startGeometry.height + dyPct, MIN_SIZE, 100 - state.startGeometry.y);
        }

        onChange({ x, y, width, height });
      } else if (kind === "rotate") {
        const angle = (Math.atan2(ev.clientY - state.centerY, ev.clientX - state.centerX) * 180) / Math.PI + 90;
        onChange({ rotation: Math.round(angle) });
      }
    }

    function onUp() {
      dragState.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      className="element-interaction"
      style={{
        position: "absolute",
        left: `${geometry.x}%`,
        top: `${geometry.y}%`,
        width: `${geometry.width}%`,
        height: `${geometry.height}%`,
        transform: geometry.rotation ? `rotate(${geometry.rotation}deg)` : undefined,
        transformOrigin: "center center",
        cursor: "move",
      }}
      onPointerDown={(e) => startDrag("move", undefined, e)}
    >
      {children}
      {selected && (
        <>
          <div className="element-outline" style={{ borderColor: accentColor }} />
          {HANDLES.map((h) => (
            <div
              key={h}
              className={`element-handle element-handle-${h}`}
              style={{ background: accentColor }}
              onPointerDown={(e) => startDrag("resize", h, e)}
            />
          ))}
          <div className="element-rotate-line" style={{ background: accentColor }} />
          <div
            className="element-rotate-handle"
            style={{ borderColor: accentColor }}
            onPointerDown={(e) => startDrag("rotate", undefined, e)}
          />
        </>
      )}
    </div>
  );
}
