import type { Project } from "../bindings/Project";
import type { AudioTrack } from "../bindings/AudioTrack";

/**
 * Les pistes audio sont globales au projet : contrairement aux éléments, elles ne sont pas
 * rattachées à une scène — `start_time` est absolu sur la timeline et une piste peut couvrir
 * plusieurs scènes ou toute la vidéo (`duration: null` = jusqu'à la fin du projet).
 */

export function createAudioTrack(relativeSrc: string, name: string, startTime = 0): AudioTrack {
  return {
    id: crypto.randomUUID(),
    name,
    src: relativeSrc,
    start_time: startTime,
    duration: null,
    volume: 1,
    audio_offset: 0,
    fade_in: 0,
    fade_out: 0,
    muted: false,
    solo: false,
  };
}

export function addAudioTrackToProject(project: Project, track: AudioTrack): Project {
  return { ...project, audio_tracks: [...project.audio_tracks, track] };
}

export function updateAudioTrackInProject(project: Project, trackId: string, patch: Partial<AudioTrack>): Project {
  return {
    ...project,
    audio_tracks: project.audio_tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
  };
}

export function removeAudioTrackFromProject(project: Project, trackId: string): Project {
  return { ...project, audio_tracks: project.audio_tracks.filter((t) => t.id !== trackId) };
}

export function duplicateAudioTrackInProject(
  project: Project,
  trackId: string,
): { project: Project; newId: string | null } {
  const idx = project.audio_tracks.findIndex((t) => t.id === trackId);
  if (idx === -1) return { project, newId: null };
  const copy = {
    ...project.audio_tracks[idx],
    id: crypto.randomUUID(),
    name: `${project.audio_tracks[idx].name} (copie)`,
  };
  const audio_tracks = [...project.audio_tracks];
  audio_tracks.splice(idx + 1, 0, copy);
  return { project: { ...project, audio_tracks }, newId: copy.id };
}

export function findAudioTrack(project: Project, trackId: string | null): AudioTrack | null {
  if (!trackId) return null;
  return project.audio_tracks.find((t) => t.id === trackId) ?? null;
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
