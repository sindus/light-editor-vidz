import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  remapGroupIds,
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
  duplicateComposition,
  removeComposition,
  renameComposition,
  reorderComposition,
  resolveActiveComposition,
  setCompositionOverlap,
  setCompositionTransitionIn,
  setCompositionTransitionOut,
  updateCompositionDuration,
} from "../lib/timeline";
import { shouldCoalesce, type LastMutation } from "../lib/history";
import TopBar from "./editor/TopBar";
import SettingsModal from "./editor/SettingsModal";
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
  const { t } = useTranslation();
  const [project, setProject] = useState<Project | null>(null);
  /** Dernière version écrite sur le disque (comparaison par référence) : `project !==
   * savedProject` = modifications non enregistrées, déclenche la sauvegarde automatique. */
  const [savedProject, setSavedProject] = useState<Project | null>(null);
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
  const [showSettings, setShowSettings] = useState(false);

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
      .then((p) => {
        const repaired = p.compositions.length > 0 ? p : addComposition(p);
        setProject(repaired);
        // Si le projet a dû être réparé, il diffère du disque : rester "non enregistré"
        // pour que la sauvegarde automatique persiste la réparation.
        setSavedProject(repaired === p ? p : null);
      })
      .catch((e) => setError(String(e)));
  }, [projectDir]);

  // Sauvegarde automatique : 2,5 s après la dernière modification (chaque nouvelle mutation
  // repousse l'échéance). La lecture ne modifie pas `project`, donc ne déclenche rien.
  useEffect(() => {
    if (!project || project === savedProject) return;
    const timer = setTimeout(async () => {
      try {
        await saveProject(projectDir, project);
        setSavedProject(project);
      } catch (e) {
        setError(String(e));
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [project, savedProject, projectDir]);

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

  const lastMutationRef = useRef<LastMutation>({ key: null, time: 0 });

  /** Applique une mutation au projet en poussant l'état précédent dans l'historique d'annulation.
   * `coalesceKey` : les mutations rapprochées portant la même clé (drag, slider, frappe continue)
   * fusionnent en une seule entrée d'historique — voir `src/lib/history.ts`. */
  const mutate = useCallback((fn: (p: Project) => Project, coalesceKey?: string) => {
    setProject((p) => {
      if (!p) return p;
      const next = fn(p);
      if (next !== p) {
        const now = performance.now();
        if (!shouldCoalesce(lastMutationRef.current, coalesceKey, now)) {
          setPast((prev) => [...prev.slice(-(HISTORY_LIMIT - 1)), p]);
          setFuture([]);
        }
        lastMutationRef.current = { key: coalesceKey ?? null, time: now };
      }
      return next;
    });
  }, []);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const handleUndo = useCallback(() => {
    // Une modification qui suit un undo ne doit jamais fusionner avec une entrée antérieure.
    lastMutationRef.current = { key: null, time: 0 };
    setPast((prev) => {
      if (prev.length === 0 || !projectRef.current) return prev;
      const previous = prev[prev.length - 1];
      setFuture((f) => [projectRef.current as Project, ...f]);
      setProject(previous);
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    lastMutationRef.current = { key: null, time: 0 };
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
      setSavedProject(project);
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
    // Piste globale au projet (non rattachée à une scène), posée au début de la timeline et
    // jouant jusqu'à la fin du projet par défaut.
    const track = createAudioTrack(relativeSrc, name);
    mutate((p) => addAudioTrackToProject(p, track));
    setSelectedIds([track.id]);
  }

  function handleUpdateElement(elementId: string, patch: ElementPatch) {
    mutate(
      (p) => {
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
      },
      // Un drag (x,y en rafale), un slider (volume…) ou la frappe (content) fusionnent en une
      // seule entrée d'annulation ; la clé inclut les champs touchés pour que deux réglages
      // différents restent deux entrées distinctes.
      `el:${elementId}:${Object.keys(patch).sort().join(",")}`,
    );
  }

  function handleUpdateAudio(patch: Partial<AudioTrack>) {
    if (!selectedId) return;
    mutate(
      (p) => updateAudioTrackInProject(p, selectedId, patch),
      `audio:${selectedId}:${Object.keys(patch).sort().join(",")}`,
    );
  }

  /** Déplace tous les éléments sélectionnés de (dx, dy) % du canvas (flèches du clavier). */
  function handleNudge(dx: number, dy: number) {
    if (selectedElementIds.length === 0 || !project) return;
    mutate(
      (p) =>
        selectedElementIds.reduce((acc, id) => {
          const el = findElement(acc, id);
          if (!el) return acc;
          return updateElementInProject(acc, id, {
            x: Math.min(100 - el.width, Math.max(0, el.x + dx)),
            y: Math.min(100 - el.height, Math.max(0, el.y + dy)),
          });
        }, p),
      `nudge:${selectedElementIds.join(",")}`,
    );
  }

  /** Avance/recule le playhead de `deltaSeconds`, borné à la durée du projet. */
  function handleSeekBy(deltaSeconds: number) {
    const duration = projectRef.current?.duration ?? 0;
    setCurrentTime((t2) => Math.min(duration, Math.max(0, t2 + deltaSeconds)));
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
    // Comme pour la duplication : les éléments collés ne doivent pas rejoindre le groupe
    // des originaux.
    mutate(() => remapGroupIds(next, newIds));
    setSelectedIds(newIds);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl+S avant le filtre sur les champs de saisie : la sauvegarde doit marcher aussi
      // pendant l'édition d'un texte (comportement standard, affiché dans le menu Fichier).
      if (e.key.toLowerCase() === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
        return;
      }
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === " ") {
        e.preventDefault();
        if (!e.repeat) setPlaying((p) => !p);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const sign = e.key === "ArrowRight" ? 1 : -1;
        if (selectedElementIds.length > 0) {
          // Sélection active : les flèches déplacent les éléments (1 % du canvas, 5 % avec Maj).
          handleNudge(sign * (e.shiftKey ? 5 : 1), 0);
        } else {
          // Sinon : navigation image par image (1 s avec Maj).
          const fps = projectRef.current?.fps || 30;
          handleSeekBy(sign * (e.shiftKey ? 1 : 1 / fps));
        }
      } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && selectedElementIds.length > 0) {
        e.preventDefault();
        handleNudge(0, (e.key === "ArrowDown" ? 1 : -1) * (e.shiftKey ? 5 : 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setCurrentTime(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setCurrentTime(projectRef.current?.duration ?? 0);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
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

  // Pendant la lecture, `currentTime` change à chaque frame (60 fps) et re-rend tout l'éditeur.
  // Les sous-arbres ci-dessous n'en dépendent pas : on fige leur élément React via useMemo pour
  // que React saute entièrement leur réconciliation (bailout par référence) tant que leurs
  // vraies dépendances ne changent pas. Les handlers capturés sont recréés à chaque rendu mais
  // ne lisent que des valeurs couvertes par les dépendances listées (ou passent par `mutate`
  // en forme fonctionnelle) — d'où le eslint-disable ciblé.
  const activeCompositionId = active?.composition.id ?? null;
  const dirty = project !== null && project !== savedProject;

  const categoryRail = useMemo(() => <CategoryRail active={leftTab} onChange={setLeftTab} />, [leftTab]);

  const topBar = useMemo(
    () =>
      project && (
        <TopBar
          project={project}
          projectDir={projectDir}
          onBack={onBack}
          onSave={handleSave}
          saving={saving}
          dirty={dirty}
          onOpenProject={handleOpenProjectDialog}
          onImportLegacy={handleImportLegacy}
          onOpenSettings={() => setShowSettings(true)}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          onDeleteSelected={handleDeleteSelected}
          onDuplicateSelected={handleDuplicateSelected}
          hasSelection={selectedIds.length > 0}
        />
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, savedProject, saving, canUndo, canRedo, selectedIds, projectDir, onBack],
  );

  const libraryPanel = useMemo(
    () =>
      project && (
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
          onOpenSettings={() => setShowSettings(true)}
        />
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, leftTab, projectDir, activeCompositionId],
  );

  const propertiesPanel = useMemo(() => {
    if (!project || !active) return null;
    return (
      <PropertiesPanel
        element={findElement(project, selectedId)}
        audioTrack={findAudioTrack(project, selectedId)}
        onUpdate={(patch) => selectedId && handleUpdateElement(selectedId, patch)}
        onUpdateAudio={handleUpdateAudio}
        onReorder={handleReorder}
        activeCompositionDuration={active.composition.duration}
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
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, selectedIds, selectedId, activeCompositionId, active?.composition.duration, mutate]);

  if (error) {
    return (
      <main className="editor-root" style={{ alignItems: "center", justifyContent: "center" }}>
        <p className="home-error">{error}</p>
        <button type="button" className="btn-secondary" onClick={onBack}>
          {t("common.back")}
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
        {t("common.loading")}
      </main>
    );
  }

  return (
    <div className="editor-root">
      <AudioPlayer project={project} projectDir={projectDir} currentTime={currentTime} playing={playing} />
      {topBar}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <div className="editor-middle">
        {categoryRail}
        {libraryPanel}
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
        {propertiesPanel}
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
        onResizeComposition={(compId, duration) =>
          mutate((p) => updateCompositionDuration(p, compId, duration), `comp:${compId}:duration`)
        }
        onUpdateOverlap={(compId, overlap) =>
          mutate((p) => setCompositionOverlap(p, compId, overlap), `comp:${compId}:overlap`)
        }
        onRenameComposition={(compId, name) => mutate((p) => renameComposition(p, compId, name))}
        onReorderComposition={(compId, direction) => mutate((p) => reorderComposition(p, compId, direction))}
        onDeleteComposition={(compId) => mutate((p) => removeComposition(p, compId))}
        onDuplicateComposition={(compId) => {
          const { project: next, newId } = duplicateComposition(project, compId);
          mutate(() => next);
          const copy = next.compositions.find((c) => c.id === newId);
          if (copy) setCurrentTime(copy.start_time);
        }}
        onUpdateElementTiming={(elementId, startTime, duration) =>
          mutate((p) => updateElementTiming(p, elementId, startTime, duration), `timing:${elementId}`)
        }
        onUpdateAudioTiming={(trackId, startTime, duration) =>
          mutate((p) => updateAudioTrackInProject(p, trackId, { start_time: startTime, duration }), `timing:${trackId}`)
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
