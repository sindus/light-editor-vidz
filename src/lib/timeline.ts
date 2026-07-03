import type { Project } from "../bindings/Project";
import type { Composition } from "../bindings/Composition";
import type { Element } from "../bindings/Element";
import type { TransitionType } from "../bindings/TransitionType";

const DEFAULT_COMPOSITION_DURATION = 5;

/**
 * Port TS de `scene-core::timeline::recompute_start_times` (Rust). Doit rester en
 * synchro avec la version Rust jusqu'à l'introduction d'un pont wasm partagé (Phase 7+).
 */
export function recomputeStartTimes(project: Project): Project {
  let cursor = 0;
  const compositions = project.compositions.map((comp) => {
    const start_time = cursor;
    const overlap = Math.max(0, comp.overlap_next);
    cursor += Math.max(0, comp.duration - overlap);
    return { ...comp, start_time };
  });
  const lastOverlap = compositions.length > 0 ? Math.max(0, compositions[compositions.length - 1].overlap_next) : 0;
  return { ...project, compositions, duration: cursor + lastOverlap };
}

export function addComposition(project: Project): Project {
  const comp: Composition = {
    id: crypto.randomUUID(),
    name: `Scène ${project.compositions.length + 1}`,
    start_time: 0,
    duration: DEFAULT_COMPOSITION_DURATION,
    elements: [],
    audio_tracks: [],
    transition_in: null,
    transition_out: null,
    overlap_next: 0,
  };
  return recomputeStartTimes({ ...project, compositions: [...project.compositions, comp] });
}

export function updateCompositionDuration(project: Project, compId: string, duration: number): Project {
  const clamped = Math.max(0.5, duration);
  return recomputeStartTimes({
    ...project,
    compositions: project.compositions.map((c) => (c.id === compId ? { ...c, duration: clamped } : c)),
  });
}

export function setCompositionTransitionIn(
  project: Project,
  compId: string,
  transitionType: TransitionType | null,
): Project {
  return {
    ...project,
    compositions: project.compositions.map((c) =>
      c.id === compId
        ? {
            ...c,
            transition_in: transitionType
              ? { transition_type: transitionType, duration: 0.6, easing: "power2-in-out" }
              : null,
          }
        : c,
    ),
  };
}

export function setCompositionTransitionOut(
  project: Project,
  compId: string,
  transitionType: TransitionType | null,
): Project {
  return {
    ...project,
    compositions: project.compositions.map((c) =>
      c.id === compId
        ? {
            ...c,
            transition_out: transitionType
              ? { transition_type: transitionType, duration: 0.6, easing: "power2-in-out" }
              : null,
          }
        : c,
    ),
  };
}

const MIN_OVERLAP_GAP = 0.1;

/** Chevauchement (secondes) avec la composition suivante, pour un fondu-enchaîné entre scènes. */
export function setCompositionOverlap(project: Project, compId: string, overlap: number): Project {
  const idx = project.compositions.findIndex((c) => c.id === compId);
  if (idx === -1) return project;
  const comp = project.compositions[idx];
  const next = project.compositions[idx + 1];
  const maxOverlap = next ? Math.max(0, Math.min(comp.duration, next.duration) - MIN_OVERLAP_GAP) : 0;
  const clamped = Math.max(0, Math.min(maxOverlap, overlap));
  return recomputeStartTimes({
    ...project,
    compositions: project.compositions.map((c) => (c.id === compId ? { ...c, overlap_next: clamped } : c)),
  });
}

export function removeComposition(project: Project, compId: string): Project {
  if (project.compositions.length <= 1) return project;
  return recomputeStartTimes({
    ...project,
    compositions: project.compositions.filter((c) => c.id !== compId),
  });
}

/** Composition active à l'instant global `t`, avec le temps local (relatif à son début). */
export function resolveActiveComposition(
  project: Project,
  t: number,
): { composition: Composition; localTime: number } | null {
  for (const comp of project.compositions) {
    if (t >= comp.start_time && t < comp.start_time + comp.duration) {
      return { composition: comp, localTime: t - comp.start_time };
    }
  }
  const last = project.compositions[project.compositions.length - 1];
  if (last && t >= last.start_time + last.duration) {
    return { composition: last, localTime: last.duration };
  }
  return project.compositions[0] ? { composition: project.compositions[0], localTime: 0 } : null;
}

export function isElementActive(el: Element, localTime: number): boolean {
  if (localTime < el.start_time) return false;
  if (el.duration === null) return true;
  return localTime < el.start_time + el.duration;
}
