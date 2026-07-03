import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Scissors, Trash2, Copy, Search, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import type { Project } from "../../bindings/Project";
import type { Composition } from "../../bindings/Composition";
import type { Element } from "../../bindings/Element";
import type { AudioTrack } from "../../bindings/AudioTrack";
import { startHorizontalDrag } from "../../lib/pointerDrag";

interface Props {
  project: Project;
  activeCompositionId: string;
  selectedElementIds: string[];
  currentTime: number;
  onSelectComposition: (id: string) => void;
  onSelectElement: (id: string) => void;
  onAddComposition: () => void;
  onSeek: (t: number) => void;
  onResizeComposition: (compId: string, duration: number) => void;
  onUpdateOverlap: (compId: string, overlap: number) => void;
  onRenameComposition: (compId: string, name: string) => void;
  onReorderComposition: (compId: string, direction: -1 | 1) => void;
  onDeleteComposition: (compId: string) => void;
  onUpdateElementTiming: (elementId: string, startTime: number, duration: number | null) => void;
  onUpdateAudioTiming: (trackId: string, startTime: number, duration: number | null) => void;
  onSplit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const TRACK_TYPES: { type: Element["type"]; labelKey: string; color: string }[] = [
  { type: "text", labelKey: "timeline.text", color: "var(--color-text)" },
  { type: "video", labelKey: "timeline.video", color: "var(--color-video)" },
  { type: "image", labelKey: "timeline.image", color: "var(--color-image)" },
  { type: "shape", labelKey: "timeline.shape", color: "var(--color-shape)" },
];

const MIN_DURATION = 0.2;

function formatRulerLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const COMP_COLORS = ["#5c86ff", "#a45cff", "#2fc4b6", "#ff8a5c", "#38d17a"];

export default function Timeline({
  project,
  activeCompositionId,
  selectedElementIds,
  currentTime,
  onSelectComposition,
  onSelectElement,
  onAddComposition,
  onSeek,
  onResizeComposition,
  onUpdateOverlap,
  onRenameComposition,
  onReorderComposition,
  onDeleteComposition,
  onUpdateElementTiming,
  onUpdateAudioTiming,
  onSplit,
  onDelete,
  onDuplicate,
  searchQuery,
  onSearchChange,
}: Props) {
  const { t } = useTranslation();
  const lanesRef = useRef<HTMLDivElement>(null);
  const [pxPerSec, setPxPerSec] = useState(40);
  const [renamingCompId, setRenamingCompId] = useState<string | null>(null);
  const displayDuration = Math.max(30, Math.ceil(project.duration / 5) * 5);

  const ticks: number[] = [];
  for (let t = 0; t <= displayDuration; t += 5) ticks.push(t);

  function timeFromClientX(clientX: number): number {
    const rect = lanesRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, (clientX - rect.left) / pxPerSec);
  }

  function handleRulerPointerDown(e: ReactPointerEvent) {
    onSeek(timeFromClientX(e.clientX));
  }

  function startCompositionResize(comp: Composition, e: ReactPointerEvent) {
    const startDuration = comp.duration;
    startHorizontalDrag(e, (deltaPx) => {
      onResizeComposition(comp.id, Math.max(MIN_DURATION, startDuration + deltaPx / pxPerSec));
    });
  }

  function startElementDrag(comp: Composition, el: Element, mode: "move" | "resize", e: ReactPointerEvent) {
    onSelectElement(el.id);
    const startStartTime = el.start_time;
    const startDuration = el.duration ?? comp.duration - el.start_time;
    startHorizontalDrag(e, (deltaPx) => {
      const deltaSec = deltaPx / pxPerSec;
      if (mode === "move") {
        const newStart = Math.max(0, Math.min(comp.duration - MIN_DURATION, startStartTime + deltaSec));
        onUpdateElementTiming(el.id, newStart, startDuration);
      } else {
        const newDuration = Math.max(MIN_DURATION, Math.min(comp.duration - startStartTime, startDuration + deltaSec));
        onUpdateElementTiming(el.id, startStartTime, newDuration);
      }
    });
  }

  function startAudioDrag(comp: Composition, track: AudioTrack, mode: "move" | "resize", e: ReactPointerEvent) {
    onSelectElement(track.id);
    const startStartTime = track.start_time;
    const startDuration = track.duration ?? Math.max(1, comp.duration - track.start_time);
    startHorizontalDrag(e, (deltaPx) => {
      const deltaSec = deltaPx / pxPerSec;
      if (mode === "move") {
        const newStart = Math.max(0, Math.min(comp.duration - MIN_DURATION, startStartTime + deltaSec));
        onUpdateAudioTiming(track.id, newStart, startDuration);
      } else {
        const newDuration = Math.max(MIN_DURATION, Math.min(comp.duration - startStartTime, startDuration + deltaSec));
        onUpdateAudioTiming(track.id, startStartTime, newDuration);
      }
    });
  }

  const activeComp = project.compositions.find((c) => c.id === activeCompositionId);
  const query = searchQuery.trim().toLowerCase();
  const matchesQuery = (name: string) => query === "" || name.toLowerCase().includes(query);

  return (
    <section className="editor-timeline">
      <div className="timeline-toolbar">
        <div className="timeline-toolbar-left">
          <button
            type="button"
            className="timeline-action"
            onClick={onSplit}
            disabled={selectedElementIds.length !== 1}
          >
            <Scissors size={13} />
            {t("timeline.split")}
          </button>
          <button
            type="button"
            className="timeline-action"
            onClick={onDelete}
            disabled={selectedElementIds.length === 0}
          >
            <Trash2 size={13} />
            {t("timeline.delete")}
          </button>
          <button
            type="button"
            className="timeline-action"
            onClick={onDuplicate}
            disabled={selectedElementIds.length === 0}
          >
            <Copy size={13} />
            {t("timeline.duplicate")}
          </button>
          <span className="timeline-toolbar-divider" />
          <button
            type="button"
            className="timeline-action"
            onClick={() => onReorderComposition(activeCompositionId, -1)}
            disabled={project.compositions.findIndex((c) => c.id === activeCompositionId) <= 0}
            title={t("timeline.moveSceneLeft")}
          >
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            className="timeline-action"
            onClick={() => onReorderComposition(activeCompositionId, 1)}
            disabled={
              project.compositions.findIndex((c) => c.id === activeCompositionId) >= project.compositions.length - 1
            }
            title={t("timeline.moveSceneRight")}
          >
            <ChevronRight size={13} />
          </button>
          <button
            type="button"
            className="timeline-action"
            onClick={() => onDeleteComposition(activeCompositionId)}
            disabled={project.compositions.length <= 1}
            title={t("timeline.deleteScene")}
          >
            <Trash2 size={13} />
            {t("timeline.deleteScene")}
          </button>
        </div>
        <div className="timeline-toolbar-right">
          <Search size={13} />
          <input
            type="text"
            className="timeline-search"
            placeholder={t("library.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <input
            type="range"
            min={15}
            max={120}
            value={pxPerSec}
            onChange={(e) => setPxPerSec(Number(e.target.value))}
            className="timeline-zoom"
          />
        </div>
      </div>

      <div className="timeline-body">
        <div className="timeline-labels">
          <div className="timeline-label-row timeline-label-scenes">{t("timeline.scenes")}</div>
          {TRACK_TYPES.map((trackType) => (
            <div className="timeline-label-row" key={trackType.type}>
              <span className="timeline-label-dot" style={{ background: trackType.color }} />
              {t(trackType.labelKey)}
            </div>
          ))}
          <div className="timeline-label-row">
            <span className="timeline-label-dot" style={{ background: "var(--color-audio)" }} />
            {t("timeline.audio")}
          </div>
        </div>

        <div className="timeline-lanes" ref={lanesRef} style={{ minWidth: displayDuration * pxPerSec }}>
          <div className="timeline-ruler" onPointerDown={handleRulerPointerDown}>
            {ticks.map((t) => (
              <div className="timeline-tick mono" key={t} style={{ left: t * pxPerSec }}>
                {formatRulerLabel(t)}
              </div>
            ))}
          </div>

          <div className="timeline-lane timeline-lane-scenes" onPointerDown={handleRulerPointerDown}>
            {project.compositions.map((comp, i) => (
              <div
                key={comp.id}
                className={`timeline-scene-block${comp.id === activeCompositionId ? " active" : ""}`}
                style={{
                  left: comp.start_time * pxPerSec,
                  width: Math.max(20, comp.duration * pxPerSec - 2),
                  background: COMP_COLORS[i % COMP_COLORS.length],
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectComposition(comp.id);
                }}
              >
                {renamingCompId === comp.id ? (
                  <input
                    autoFocus
                    className="timeline-scene-name-input"
                    defaultValue={comp.name}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      onRenameComposition(comp.id, e.target.value.trim() || comp.name);
                      setRenamingCompId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setRenamingCompId(null);
                    }}
                  />
                ) : (
                  <span
                    className="timeline-scene-name"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setRenamingCompId(comp.id);
                    }}
                    title={t("timeline.renameSceneHint")}
                  >
                    {comp.name}
                  </span>
                )}
                {i < project.compositions.length - 1 && (
                  <input
                    type="number"
                    className="timeline-scene-overlap mono"
                    step={0.1}
                    min={0}
                    value={comp.overlap_next}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onUpdateOverlap(comp.id, Number(e.target.value))}
                    title={t("timeline.overlap")}
                  />
                )}
                <span className="timeline-scene-resize" onPointerDown={(e) => startCompositionResize(comp, e)} />
              </div>
            ))}
            <button
              type="button"
              className="timeline-add-scene"
              style={{
                left:
                  (project.compositions[project.compositions.length - 1]
                    ? project.compositions[project.compositions.length - 1].start_time +
                      project.compositions[project.compositions.length - 1].duration
                    : 0) *
                    pxPerSec +
                  6,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onAddComposition();
              }}
              title={t("timeline.addScene")}
            >
              <Plus size={13} />
            </button>
          </div>

          {TRACK_TYPES.map((trackType) => (
            <div className="timeline-lane" key={trackType.type} onPointerDown={handleRulerPointerDown}>
              {activeComp?.elements
                .filter((el) => el.type === trackType.type && matchesQuery(el.name))
                .map((el) => {
                  const dur = el.duration ?? activeComp.duration - el.start_time;
                  const left = (activeComp.start_time + el.start_time) * pxPerSec;
                  const width = Math.max(10, dur * pxPerSec - 2);
                  return (
                    <div
                      key={el.id}
                      className={`timeline-clip${selectedElementIds.includes(el.id) ? " selected" : ""}`}
                      style={{ left, width, background: trackType.color }}
                      onPointerDown={(e) => startElementDrag(activeComp, el, "move", e)}
                    >
                      <span className="timeline-clip-name">{el.name}</span>
                      <span
                        className="timeline-clip-resize"
                        onPointerDown={(e) => startElementDrag(activeComp, el, "resize", e)}
                      />
                    </div>
                  );
                })}
            </div>
          ))}

          <div className="timeline-lane" onPointerDown={handleRulerPointerDown}>
            {activeComp?.audio_tracks
              .filter((track) => matchesQuery(track.name))
              .map((track) => {
                const dur = track.duration ?? Math.max(1, activeComp.duration - track.start_time);
                const left = (activeComp.start_time + track.start_time) * pxPerSec;
                const width = Math.max(10, dur * pxPerSec - 2);
                return (
                  <div
                    key={track.id}
                    className={`timeline-clip${selectedElementIds.includes(track.id) ? " selected" : ""}`}
                    style={{ left, width, background: "var(--color-audio)" }}
                    onPointerDown={(e) => startAudioDrag(activeComp, track, "move", e)}
                  >
                    <span className="timeline-clip-name">{track.name}</span>
                    <span
                      className="timeline-clip-resize"
                      onPointerDown={(e) => startAudioDrag(activeComp, track, "resize", e)}
                    />
                  </div>
                );
              })}
          </div>

          <div className="timeline-playhead" style={{ left: currentTime * pxPerSec }}>
            <span className="timeline-playhead-handle" />
          </div>
        </div>
      </div>
    </section>
  );
}
