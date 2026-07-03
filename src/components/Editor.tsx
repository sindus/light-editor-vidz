import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Project } from "../bindings/Project";
import type { ShapeType } from "../bindings/ShapeType";
import type { AudioTrack } from "../bindings/AudioTrack";
import { loadProject, newProject, readTextFile, saveProject } from "../lib/commands";
import { parseLegacyProjectJSON } from "../lib/legacyImport";
import {
  addElementToComposition,
  createImageElement,
  createShapeElement,
  createStyledTextElement,
  createSubtitleElement,
  createTitleElement,
  createVideoElement,
  type TextStylePreset,
  deleteElementFromProject,
  duplicateElementInProject,
  findElement,
  reorderElementInProject,
  splitElementInProject,
  updateElementInProject,
  updateElementTiming,
  type ElementPatch,
} from "../lib/elements";
import {
  addAudioTrackToProject,
  createAudioTrack,
  duplicateAudioTrackInProject,
  findAudioTrack,
  removeAudioTrackFromProject,
  updateAudioTrackInProject,
} from "../lib/audio";
import {
  addComposition,
  resolveActiveComposition,
  setCompositionOverlap,
  setCompositionTransitionIn,
  setCompositionTransitionOut,
  updateCompositionDuration,
} from "../lib/timeline";
import TopBar from "./editor/TopBar";
import CategoryRail from "./editor/CategoryRail";
import LibraryPanel from "./editor/LibraryPanel";
import CanvasStage from "./editor/CanvasStage";
import PropertiesPanel from "./editor/PropertiesPanel";
import Timeline from "./editor/Timeline";
import AudioPlayer from "./editor/AudioPlayer";
import type { LeftTab } from "./editor/types";
import "./editor/editor.css";

interface Props {
  projectDir: string;
  onBack: () => void;
  onOpenProject: (dir: string) => void;
}

export default function Editor({ projectDir, onBack, onOpenProject }: Props) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<LeftTab>("text");
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [past, setPast] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);

  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const HISTORY_LIMIT = 50;

  useEffect(() => {
    loadProject(projectDir)
      .then(setProject)
      .catch((e) => setError(String(e)));
  }, [projectDir]);

  // Horloge de lecture : rAF avec delta-time réel (remplace le setInterval fixe de l'ancien projet).
  useEffect(() => {
    if (!playing) return;
    let raf: number;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setCurrentTime((t) => {
        const duration = projectRef.current?.duration ?? 0;
        const next = t + dt;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const mutate = useCallback((fn: (p: Project) => Project) => {
    setProject((p) => {
      if (!p) return p;
      const next = fn(p);
      if (next !== p) {
        setPast((prev) => [...prev.slice(-(HISTORY_LIMIT - 1)), p]);
        setFuture([]);
      }
      return next;
    });
  }, []);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const handleUndo = useCallback(() => {
    setPast((prev) => {
      if (prev.length === 0 || !projectRef.current) return prev;
      const previous = prev[prev.length - 1];
      setFuture((f) => [projectRef.current as Project, ...f]);
      setProject(previous);
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setFuture((prev) => {
      if (prev.length === 0 || !projectRef.current) return prev;
      const [next, ...rest] = prev;
      setPast((p) => [...p, projectRef.current as Project]);
      setProject(next);
      return rest;
    });
  }, []);

  async function handleSave() {
    if (!project) return;
    setSaving(true);
    try {
      await saveProject(projectDir, project);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenProjectDialog() {
    const dir = await open({ directory: true, multiple: false });
    if (!dir || Array.isArray(dir)) return;
    onOpenProject(dir);
  }

  async function handleImportLegacy() {
    const jsonPath = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!jsonPath || Array.isArray(jsonPath)) return;
    const parentDir = await open({ directory: true, multiple: false });
    if (!parentDir || Array.isArray(parentDir)) return;

    try {
      const text = await readTextFile(jsonPath);
      const legacyProject = parseLegacyProjectJSON(JSON.parse(text));
      const newDir = await newProject({
        parent_dir: parentDir,
        name: legacyProject.name,
        width: legacyProject.width,
        height: legacyProject.height,
        fps: legacyProject.fps,
      });
      await saveProject(newDir, legacyProject);
      onOpenProject(newDir);
    } catch (e) {
      setError(String(e));
    }
  }

  const active = project ? resolveActiveComposition(project, currentTime) : null;
  const isAudioSelected = !!project?.audio_tracks.some((t) => t.id === selectedId);

  function addAndSelect(element: ReturnType<typeof createTitleElement>) {
    if (!project || !active) return;
    mutate((p) => addElementToComposition(p, active.composition.id, element));
    setSelectedId(element.id);
  }

  function addAndSelectAudio(relativeSrc: string, name: string) {
    const track = createAudioTrack(relativeSrc, name);
    mutate((p) => addAudioTrackToProject(p, track));
    setSelectedId(track.id);
  }

  function handleUpdateElement(elementId: string, patch: ElementPatch) {
    mutate((p) => updateElementInProject(p, elementId, patch));
  }

  function handleUpdateAudio(patch: Partial<AudioTrack>) {
    if (!selectedId) return;
    mutate((p) => updateAudioTrackInProject(p, selectedId, patch));
  }

  function handleReorder(direction: 1 | -1) {
    if (!selectedId) return;
    mutate((p) => reorderElementInProject(p, selectedId, direction));
  }

  function handleDeleteSelected() {
    if (!selectedId) return;
    if (isAudioSelected) {
      mutate((p) => removeAudioTrackFromProject(p, selectedId));
    } else {
      mutate((p) => deleteElementFromProject(p, selectedId));
    }
    setSelectedId(null);
  }

  function handleDuplicateSelected() {
    if (!selectedId) return;
    setProject((p) => {
      if (!p) return p;
      if (isAudioSelected) {
        const { project: next, newId } = duplicateAudioTrackInProject(p, selectedId);
        if (newId) setSelectedId(newId);
        return next;
      }
      const { project: next, newId } = duplicateElementInProject(p, selectedId);
      if (newId) setSelectedId(newId);
      return next;
    });
  }

  function handleSplitSelected() {
    if (!selectedId || !active || isAudioSelected) return;
    mutate((p) => splitElementInProject(p, active.composition.id, selectedId, active.localTime));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        handleDeleteSelected();
      } else if (e.key.toLowerCase() === "d" && (e.metaKey || e.ctrlKey) && selectedId) {
        e.preventDefault();
        handleDuplicateSelected();
      } else if (e.key.toLowerCase() === "z" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      } else if (e.key.toLowerCase() === "z" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleUndo();
      } else if (e.key.toLowerCase() === "y" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleRedo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (error) {
    return (
      <main className="editor-root" style={{ alignItems: "center", justifyContent: "center" }}>
        <p className="home-error">{error}</p>
        <button type="button" className="btn-secondary" onClick={onBack}>
          Retour
        </button>
      </main>
    );
  }

  if (!project || !active) {
    return (
      <main
        className="editor-root"
        style={{ alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}
      >
        Chargement…
      </main>
    );
  }

  const selectedElement = findElement(project, selectedId);
  const selectedAudioTrack = findAudioTrack(project, selectedId);

  return (
    <div className="editor-root">
      <AudioPlayer tracks={project.audio_tracks} projectDir={projectDir} currentTime={currentTime} playing={playing} />
      <TopBar
        project={project}
        projectDir={projectDir}
        onBack={onBack}
        onSave={handleSave}
        saving={saving}
        onOpenProject={handleOpenProjectDialog}
        onImportLegacy={handleImportLegacy}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onDeleteSelected={handleDeleteSelected}
        onDuplicateSelected={handleDuplicateSelected}
        hasSelection={!!selectedId}
      />
      <div className="editor-middle">
        <CategoryRail active={leftTab} onChange={setLeftTab} />
        <LibraryPanel
          active={leftTab}
          projectDir={projectDir}
          onAddTitle={() => addAndSelect(createTitleElement())}
          onAddSubtitle={() => addAndSelect(createSubtitleElement())}
          onAddStyledText={(preset: TextStylePreset) => addAndSelect(createStyledTextElement(preset))}
          onAddImage={(src, name) => addAndSelect(createImageElement(src, name))}
          onAddVideo={(src, name) => addAndSelect(createVideoElement(src, name))}
          onAddAudio={addAndSelectAudio}
          onAddShape={(shapeType: ShapeType) => addAndSelect(createShapeElement(shapeType))}
        />
        <CanvasStage
          project={project}
          projectDir={projectDir}
          composition={active.composition}
          localTime={active.localTime}
          playing={playing}
          onTogglePlay={() => setPlaying((p) => !p)}
          onSeekToStart={() => setCurrentTime(active.composition.start_time)}
          selectedId={selectedId}
          onSelectElement={setSelectedId}
          onUpdateElement={handleUpdateElement}
          onSetTransitionIn={(transitionType) =>
            mutate((p) => setCompositionTransitionIn(p, active.composition.id, transitionType))
          }
          onSetTransitionOut={(transitionType) =>
            mutate((p) => setCompositionTransitionOut(p, active.composition.id, transitionType))
          }
          onSeekToNext={() => {
            const idx = project.compositions.findIndex((c) => c.id === active.composition.id);
            const next = project.compositions[idx + 1];
            setCurrentTime(next ? next.start_time : project.duration);
          }}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
        <PropertiesPanel
          element={selectedElement}
          audioTrack={selectedAudioTrack}
          onUpdate={(patch) => selectedId && handleUpdateElement(selectedId, patch)}
          onUpdateAudio={handleUpdateAudio}
          onReorder={handleReorder}
        />
      </div>
      <Timeline
        project={project}
        activeCompositionId={active.composition.id}
        selectedElementId={selectedId}
        currentTime={currentTime}
        onSelectComposition={(id) => {
          const comp = project.compositions.find((c) => c.id === id);
          if (comp) setCurrentTime(comp.start_time);
        }}
        onSelectElement={setSelectedId}
        onAddComposition={() => mutate(addComposition)}
        onSeek={setCurrentTime}
        onResizeComposition={(compId, duration) => mutate((p) => updateCompositionDuration(p, compId, duration))}
        onUpdateOverlap={(compId, overlap) => mutate((p) => setCompositionOverlap(p, compId, overlap))}
        onUpdateElementTiming={(elementId, startTime, duration) =>
          mutate((p) => updateElementTiming(p, elementId, startTime, duration))
        }
        onUpdateAudioTiming={(trackId, startTime, duration) =>
          mutate((p) => updateAudioTrackInProject(p, trackId, { start_time: startTime, duration }))
        }
        onSplit={handleSplitSelected}
        onDelete={handleDeleteSelected}
        onDuplicate={handleDuplicateSelected}
      />
    </div>
  );
}
