import { describe, expect, it } from "vitest";
import type { Project } from "../bindings/Project";
import {
  addAudioTrackToProject,
  createAudioTrack,
  duplicateAudioTrackInProject,
  findAudioTrack,
  isAudioTrackActive,
  removeAudioTrackFromProject,
  updateAudioTrackInProject,
} from "./audio";

function project(): Project {
  return { name: "p", width: 1920, height: 1080, fps: 30, duration: 10, compositions: [], audio_tracks: [] };
}

describe("createAudioTrack", () => {
  it("creates a track with sensible defaults", () => {
    const track = createAudioTrack("assets/audio/a.mp3", "a.mp3");
    expect(track.src).toBe("assets/audio/a.mp3");
    expect(track.volume).toBe(1);
    expect(track.start_time).toBe(0);
  });
});

describe("addAudioTrackToProject / findAudioTrack / removeAudioTrackFromProject", () => {
  it("adds, finds, and removes a track", () => {
    const track = createAudioTrack("a.mp3", "a.mp3");
    let p = addAudioTrackToProject(project(), track);
    expect(findAudioTrack(p, track.id)?.id).toBe(track.id);
    p = removeAudioTrackFromProject(p, track.id);
    expect(findAudioTrack(p, track.id)).toBeNull();
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
    expect(next.audio_tracks.find((t) => t.id === trackA.id)?.volume).toBe(0.4);
    expect(next.audio_tracks.find((t) => t.id === trackB.id)?.volume).toBe(1);
  });
});

describe("duplicateAudioTrackInProject", () => {
  it("inserts a copy right after the original with a new id", () => {
    const track = createAudioTrack("a.mp3", "a");
    const p = addAudioTrackToProject(project(), track);
    const { project: next, newId } = duplicateAudioTrackInProject(p, track.id);
    expect(next.audio_tracks).toHaveLength(2);
    expect(next.audio_tracks[1].id).toBe(newId);
  });
});

describe("isAudioTrackActive", () => {
  it("is active forever when duration is null", () => {
    const track = { ...createAudioTrack("a.mp3", "a"), start_time: 2 };
    expect(isAudioTrackActive(track, 1)).toBe(false);
    expect(isAudioTrackActive(track, 2)).toBe(true);
    expect(isAudioTrackActive(track, 9999)).toBe(true);
  });

  it("respects an explicit duration", () => {
    const track = { ...createAudioTrack("a.mp3", "a"), start_time: 0, duration: 3 };
    expect(isAudioTrackActive(track, 2.9)).toBe(true);
    expect(isAudioTrackActive(track, 3)).toBe(false);
  });
});
