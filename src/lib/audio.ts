import type { Project } from "../bindings/Project";
import type { AudioTrack } from "../bindings/AudioTrack";

export function createAudioTrack(relativeSrc: string, name: string): AudioTrack {
  return {
    id: crypto.randomUUID(),
    name,
    src: relativeSrc,
    start_time: 0,
    duration: null,
    volume: 1,
    audio_offset: 0,
    fade_in: 0,
    fade_out: 0,
    muted: false,
    solo: false,
  };
}

/** Ajoute une piste dans la composition ciblée (même convention que `addElementToComposition`). */
export function addAudioTrackToProject(project: Project, compId: string, track: AudioTrack): Project {
  return {
    ...project,
    compositions: project.compositions.map((c) =>
      c.id === compId ? { ...c, audio_tracks: [...c.audio_tracks, track] } : c,
    ),
  };
}

/** Met à jour une piste (par id) dans toutes les compositions, en fusionnant `patch`. */
export function updateAudioTrackInProject(project: Project, trackId: string, patch: Partial<AudioTrack>): Project {
  return {
    ...project,
    compositions: project.compositions.map((c) => ({
      ...c,
      audio_tracks: c.audio_tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
    })),
  };
}

export function removeAudioTrackFromProject(project: Project, trackId: string): Project {
  return {
    ...project,
    compositions: project.compositions.map((c) => ({
      ...c,
      audio_tracks: c.audio_tracks.filter((t) => t.id !== trackId),
    })),
  };
}

export function duplicateAudioTrackInProject(
  project: Project,
  trackId: string,
): { project: Project; newId: string | null } {
  const newId = crypto.randomUUID();
  let created = false;
  const compositions = project.compositions.map((comp) => {
    const idx = comp.audio_tracks.findIndex((t) => t.id === trackId);
    if (idx === -1) return comp;
    created = true;
    const copy = { ...comp.audio_tracks[idx], id: newId, name: `${comp.audio_tracks[idx].name} (copie)` };
    const audio_tracks = [...comp.audio_tracks];
    audio_tracks.splice(idx + 1, 0, copy);
    return { ...comp, audio_tracks };
  });
  return { project: { ...project, compositions }, newId: created ? newId : null };
}

export function findAudioTrack(project: Project, trackId: string | null): AudioTrack | null {
  if (!trackId) return null;
  for (const comp of project.compositions) {
    const found = comp.audio_tracks.find((t) => t.id === trackId);
    if (found) return found;
  }
  return null;
}

/** Composition (id) contenant la piste donnée, si elle existe. */
export function findAudioTrackCompositionId(project: Project, trackId: string): string | null {
  for (const comp of project.compositions) {
    if (comp.audio_tracks.some((t) => t.id === trackId)) return comp.id;
  }
  return null;
}

export interface AudioTrackWithTiming {
  track: AudioTrack;
  compositionId: string;
  /** `track.start_time` (relatif à sa composition) converti en position absolue sur la timeline globale. */
  absoluteStartTime: number;
}

/** Aplati les pistes audio de toutes les compositions avec leur position absolue sur la timeline
 * globale — nécessaire pour la lecture (AudioPlayer) et l'affichage dans la timeline. */
export function allAudioTracksWithTiming(project: Project): AudioTrackWithTiming[] {
  return project.compositions.flatMap((comp) =>
    comp.audio_tracks.map((track) => ({
      track,
      compositionId: comp.id,
      absoluteStartTime: comp.start_time + track.start_time,
    })),
  );
}

export function isAudioTrackActive(startTime: number, duration: number | null, globalTime: number): boolean {
  if (globalTime < startTime) return false;
  if (duration === null) return true;
  return globalTime < startTime + duration;
}

/**
 * Audibilité effective d'une piste : mute individuel toujours prioritaire ; si au moins une
 * piste du projet est en solo, seules les pistes solo (et non mute) sont audibles.
 */
export function isTrackAudible(track: AudioTrack, allTracks: AudioTrack[]): boolean {
  if (track.muted) return false;
  const anySolo = allTracks.some((t) => t.solo);
  return anySolo ? track.solo : true;
}
