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
  const newId = crypto.randomUUID();
  const copy = { ...project.audio_tracks[idx], id: newId, name: `${project.audio_tracks[idx].name} (copie)` };
  const audio_tracks = [...project.audio_tracks];
  audio_tracks.splice(idx + 1, 0, copy);
  return { project: { ...project, audio_tracks }, newId };
}

export function findAudioTrack(project: Project, trackId: string | null): AudioTrack | null {
  if (!trackId) return null;
  return project.audio_tracks.find((t) => t.id === trackId) ?? null;
}

export function isAudioTrackActive(track: AudioTrack, globalTime: number): boolean {
  if (globalTime < track.start_time) return false;
  if (track.duration === null) return true;
  return globalTime < track.start_time + track.duration;
}
