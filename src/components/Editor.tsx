import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Project } from "../bindings/Project";
import type { ShapeType } from "../bindings/ShapeType";
import type { AudioTrack } from "../bindings/AudioTrack";
import { loadProject, newProject, readTextFile, saveProject } from "../lib/commands";
import { parseLegacyProjectJSON } from "../lib/legacyImport";
import type { Element } from "../bindings/Element";
import {
  addElementToComposition,
  alignElements,
  type AlignEdge,
  createImageElement,
  createShapeElement,
  createStyledTextElement,
  createSubtitleElement,
  createTitleElement,
  createVideoElement,
  type TextStylePreset,
  deleteElementsFromProject,
  distributeElements,
  duplicateElementsInProject,
  findElement,
  groupElements,
  groupMembers,
  moveElementToIndex,
  reorderElementInProject,
  splitElementInProject,
  ungroupElements,
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
  removeComposition,
  renameComposition,
  reorderComposition,
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [past, setPast] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);
  const [clipboard, setClipboard] = useState<Element[]>([]);
  const [timelineSearch, setTimelineSearch] = useState("");

  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;

  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const HISTORY_LIMIT = 50;

  useEffect(() => {
    loadProject(projectDir)
      // Un projet sans aucune composition (fichier legacy/corrompu — le flux normal de
      // l'app ne peut jamais y mener : `new_project` en crée toujours une et l'UI refuse
      // de supprimer la dernière) laisserait `resolveActiveComposition` renvoyer `null`
      // indéfiniment, bloquant l'éditeur sur "Chargement…" sans jamais rien afficher.
      // On répare silencieusement en ajoutant une scène vide plutôt que de bloquer.
      .then((p) => setProject(p.compositions.length > 0 ? p : addComposition(p)))
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
  const isAudioSelected = !!project && findAudioTrack(project, selectedId) !== null;
  const selectedAudioIds = project ? selectedIds.filter((id) => findAudioTrack(project, id) !== null) : [];
  const selectedElementIds = selectedIds.filter((id) => !selectedAudioIds.includes(id));

  function addAndSelect(element: ReturnType<typeof createTitleElement>) {
    if (!project || !active) return;
    mutate((p) => addElementToComposition(p, active.composition.id, element));
    setSelectedIds([element.id]);
  }

  function addAndSelectAudio(relativeSrc: string, name: string) {
    if (!active) return;
    const track = createAudioTrack(relativeSrc, name);
    mutate((p) => addAudioTrackToProject(p, active.composition.id, track));
    setSelectedIds([track.id]);
  }

  function handleUpdateElement(elementId: string, patch: ElementPatch) {
    mutate((p) => {
      const next = updateElementInProject(p, elementId, patch);
      // Déplacement groupé : si l'élément fait partie d'un groupe et que x/y a changé,
      // applique le même delta aux autres membres pour qu'ils bougent ensemble.
      if (!active || (patch.x === undefined && patch.y === undefined)) return next;
      const before = findElement(p, elementId);
      const after = findElement(next, elementId);
      if (!before || !after) return next;
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      if (dx === 0 && dy === 0) return next;
      const siblings = groupMembers(p, active.composition.id, elementId).filter((id) => id !== elementId);
      return siblings.reduce(
        (acc, id) =>
          updateElementInProject(acc, id, { x: findElement(acc, id)!.x + dx, y: findElement(acc, id)!.y + dy }),
        next,
      );
    });
  }

  function handleUpdateAudio(patch: Partial<AudioTrack>) {
    if (!selectedId) return;
    mutate((p) => updateAudioTrackInProject(p, selectedId, patch));
  }

  function handleReorder(direction: 1 | -1) {
    if (!selectedId) return;
    mutate((p) => reorderElementInProject(p, selectedId, direction));
  }

  function handleReorderLayer(elementId: string, toIndex: number) {
    mutate((p) => moveElementToIndex(p, elementId, toIndex));
  }

  function handleSelectElement(id: string | null, additive: boolean) {
    if (id === null) {
      if (!additive) setSelectedIds([]);
      return;
    }
    setSelectedIds((prev) => {
      if (additive) return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (project && active) return groupMembers(project, active.composition.id, id);
      return [id];
    });
  }

  function handleGroup() {
    if (!active || selectedElementIds.length < 2) return;
    mutate((p) => groupElements(p, active.composition.id, selectedElementIds));
  }

  function handleUngroup() {
    if (!active || selectedElementIds.length === 0) return;
    mutate((p) => ungroupElements(p, active.composition.id, selectedElementIds));
  }

  function handleMarqueeSelect(ids: string[], additive: boolean) {
    if (ids.length === 0) {
      if (!additive) setSelectedIds([]);
      return;
    }
    setSelectedIds((prev) => (additive ? Array.from(new Set([...prev, ...ids])) : ids));
  }

  function handleDeleteSelected() {
    if (selectedIds.length === 0) return;
    mutate((p) => {
      let next = p;
      if (selectedAudioIds.length > 0) {
        next = selectedAudioIds.reduce((acc, id) => removeAudioTrackFromProject(acc, id), next);
      }
      if (selectedElementIds.length > 0) {
        next = deleteElementsFromProject(next, selectedElementIds);
      }
      return next;
    });
    setSelectedIds([]);
  }

  function handleDuplicateSelected() {
    if (!project || selectedIds.length === 0) return;
    let next = project;
    const newIds: string[] = [];
    for (const id of selectedAudioIds) {
      const result = duplicateAudioTrackInProject(next, id);
      next = result.project;
      if (result.newId) newIds.push(result.newId);
    }
    if (selectedElementIds.length > 0) {
      const result = duplicateElementsInProject(next, selectedElementIds);
      next = result.project;
      newIds.push(...result.newIds);
    }
    mutate(() => next);
    setSelectedIds(newIds);
  }

  function handleSplitSelected() {
    if (!selectedId || !active || isAudioSelected) return;
    mutate((p) => splitElementInProject(p, active.composition.id, selectedId, active.localTime));
  }

  function handleAlign(edge: AlignEdge) {
    if (!active || selectedElementIds.length === 0) return;
    mutate((p) => alignElements(p, active.composition.id, selectedElementIds, edge));
  }

  function handleDistribute(axis: "horizontal" | "vertical") {
    if (!active || selectedElementIds.length < 3) return;
    mutate((p) => distributeElements(p, active.composition.id, selectedElementIds, axis));
  }

  function handleCopy() {
    if (!project || selectedElementIds.length === 0) return;
    const elements = selectedElementIds
      .map((id) => findElement(project, id))
      .filter((el): el is Element => el !== null);
    setClipboard(elements);
  }

  function handlePaste() {
    if (!project || !active || clipboard.length === 0) return;
    let next = project;
    const newIds: string[] = [];
    for (const el of clipboard) {
      const copy = {
        ...el,
        id: crypto.randomUUID(),
        x: Math.min(95, el.x + 3),
        y: Math.min(95, el.y + 3),
      } as Element;
      next = addElementToComposition(next, active.composition.id, copy);
      newIds.push(copy.id);
    }
    mutate(() => next);
    setSelectedIds(newIds);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
        e.preventDefault();
        handleDeleteSelected();
      } else if (e.key.toLowerCase() === "d" && (e.metaKey || e.ctrlKey) && selectedIds.length > 0) {
        e.preventDefault();
        handleDuplicateSelected();
      } else if (e.key.toLowerCase() === "c" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleCopy();
      } else if (e.key.toLowerCase() === "v" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handlePaste();
      } else if (e.key.toLowerCase() === "a" && (e.metaKey || e.ctrlKey) && active) {
        e.preventDefault();
        setSelectedIds(active.composition.elements.map((el) => el.id));
      } else if (e.key.toLowerCase() === "g" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        handleUngroup();
      } else if (e.key.toLowerCase() === "g" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleGroup();
      } else if (e.key === "Escape") {
        setSelectedIds([]);
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
      <AudioPlayer project={project} projectDir={projectDir} currentTime={currentTime} playing={playing} />
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
        hasSelection={selectedIds.length > 0}
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
          selectedIds={selectedIds}
          onSelectElement={handleSelectElement}
          onMarqueeSelect={handleMarqueeSelect}
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
          elements={active.composition.elements}
          selectedIds={selectedIds}
          onSelectLayer={(id, additive) => handleSelectElement(id, additive)}
          onReorderLayer={handleReorderLayer}
          onDeleteLayer={(id) => {
            mutate((p) => deleteElementsFromProject(p, [id]));
            setSelectedIds((prev) => prev.filter((x) => x !== id));
          }}
          onAlign={handleAlign}
          onDistribute={handleDistribute}
          onGroup={handleGroup}
          onUngroup={handleUngroup}
        />
      </div>
      <Timeline
        project={project}
        activeCompositionId={active.composition.id}
        selectedElementIds={selectedIds}
        currentTime={currentTime}
        onSelectComposition={(id) => {
          const comp = project.compositions.find((c) => c.id === id);
          if (comp) setCurrentTime(comp.start_time);
        }}
        onSelectElement={(id) => handleSelectElement(id, false)}
        onAddComposition={() => mutate(addComposition)}
        onSeek={setCurrentTime}
        onResizeComposition={(compId, duration) => mutate((p) => updateCompositionDuration(p, compId, duration))}
        onUpdateOverlap={(compId, overlap) => mutate((p) => setCompositionOverlap(p, compId, overlap))}
        onRenameComposition={(compId, name) => mutate((p) => renameComposition(p, compId, name))}
        onReorderComposition={(compId, direction) => mutate((p) => reorderComposition(p, compId, direction))}
        onDeleteComposition={(compId) => mutate((p) => removeComposition(p, compId))}
        onUpdateElementTiming={(elementId, startTime, duration) =>
          mutate((p) => updateElementTiming(p, elementId, startTime, duration))
        }
        onUpdateAudioTiming={(trackId, startTime, duration) =>
          mutate((p) => updateAudioTrackInProject(p, trackId, { start_time: startTime, duration }))
        }
        onSplit={handleSplitSelected}
        onDelete={handleDeleteSelected}
        onDuplicate={handleDuplicateSelected}
        searchQuery={timelineSearch}
        onSearchChange={setTimelineSearch}
      />
    </div>
  );
}
