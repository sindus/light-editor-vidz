import { describe, expect, it } from "vitest";
import type { Project } from "../bindings/Project";
import type { Composition } from "../bindings/Composition";
import {
  addAudioTrackToProject,
  createAudioTrack,
  duplicateAudioTrackInProject,
  findAudioTrack,
  isAudioTrackActive,
  isTrackAudible,
  removeAudioTrackFromProject,
  updateAudioTrackInProject,
} from "./audio";

function emptyComposition(id: string, startTime: number, duration = 5): Composition {
  return {
    id,
    name: id,
    start_time: startTime,
    duration,
    elements: [],
    transition_in: null,
    transition_out: null,
    overlap_next: 0,
  };
}

function project(compositions: Composition[] = [emptyComposition("c1", 0)]): Project {
  return { name: "p", width: 1920, height: 1080, fps: 30, duration: 10, compositions, audio_tracks: [] };
}

describe("createAudioTrack", () => {
  it("creates a track with sensible defaults (global, whole project)", () => {
    const track = createAudioTrack("assets/audio/a.mp3", "a.mp3");
    expect(track.src).toBe("assets/audio/a.mp3");
    expect(track.volume).toBe(1);
    expect(track.start_time).toBe(0);
    // duration null = joue jusqu'à la fin du projet.
    expect(track.duration).toBeNull();
  });
});

describe("addAudioTrackToProject / findAudioTrack / removeAudioTrackFromProject", () => {
  it("adds a project-level track (not tied to any scene), finds it, and removes it", () => {
    const p = project([emptyComposition("a", 0), emptyComposition("b", 5)]);
    const track = createAudioTrack("a.mp3", "a.mp3");
    let next = addAudioTrackToProject(p, track);
    expect(next.audio_tracks).toHaveLength(1);
    // Les scènes ne portent aucune piste : une piste peut s'étaler sur plusieurs scènes.
    expect(findAudioTrack(next, track.id)?.id).toBe(track.id);
    next = removeAudioTrackFromProject(next, track.id);
    expect(findAudioTrack(next, track.id)).toBeNull();
  });

  it("returns null when looking up a null id", () => {
    expect(findAudioTrack(project(), null)).toBeNull();
  });
});

describe("updateAudioTrackInProject", () => {
  it("merges a patch into the matching track only", () => {
    const trackA = createAudioTrack("a.mp3", "a");
    const trackB = createAudioTrack("b.mp3", "b");
    let p = addAudioTrackToProject(project(), trackA);
    p = addAudioTrackToProject(p, trackB);
    const next = updateAudioTrackInProject(p, trackA.id, { volume: 0.4 });
    expect(findAudioTrack(next, trackA.id)?.volume).toBe(0.4);
    expect(findAudioTrack(next, trackB.id)?.volume).toBe(1);
  });
});

describe("duplicateAudioTrackInProject", () => {
  it("inserts a copy right after the original with a new id", () => {
    const track = createAudioTrack("a.mp3", "a");
    const p = addAudioTrackToProject(project(), track);
    const { project: next, newId } = duplicateAudioTrackInProject(p, track.id);
    expect(next.audio_tracks).toHaveLength(2);
    expect(next.audio_tracks[1].id).toBe(newId);
    expect(next.audio_tracks[1].id).not.toBe(track.id);
  });

  it("does nothing for an unknown id", () => {
    const p = project();
    const { project: next, newId } = duplicateAudioTrackInProject(p, "zzz");
    expect(newId).toBeNull();
    expect(next).toBe(p);
  });
});

describe("isAudioTrackActive", () => {
  it("is active forever when duration is null", () => {
    expect(isAudioTrackActive(2, null, 1)).toBe(false);
    expect(isAudioTrackActive(2, null, 2)).toBe(true);
    expect(isAudioTrackActive(2, null, 9999)).toBe(true);
  });

  it("respects an explicit duration", () => {
    expect(isAudioTrackActive(0, 3, 2.9)).toBe(true);
    expect(isAudioTrackActive(0, 3, 3)).toBe(false);
  });
});

describe("isTrackAudible", () => {
  it("is audible by default when nothing is muted or solo", () => {
    const a = createAudioTrack("a.mp3", "a");
    const b = createAudioTrack("b.mp3", "b");
    expect(isTrackAudible(a, [a, b])).toBe(true);
  });

  it("a muted track is never audible, even alone", () => {
    const a = { ...createAudioTrack("a.mp3", "a"), muted: true };
    expect(isTrackAudible(a, [a])).toBe(false);
  });

  it("when any track is solo, only solo (and non-muted) tracks are audible", () => {
    const a = { ...createAudioTrack("a.mp3", "a"), solo: true };
    const b = createAudioTrack("b.mp3", "b");
    const c = { ...createAudioTrack("c.mp3", "c"), solo: true, muted: true };
    expect(isTrackAudible(a, [a, b, c])).toBe(true);
    expect(isTrackAudible(b, [a, b, c])).toBe(false);
    expect(isTrackAudible(c, [a, b, c])).toBe(false);
  });
});
