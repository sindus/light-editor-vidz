import { describe, expect, it } from "vitest";
import type { Project } from "../bindings/Project";
import type { Composition } from "../bindings/Composition";
import {
  addComposition,
  isElementActive,
  recomputeStartTimes,
  removeComposition,
  renameComposition,
  reorderComposition,
  resolveActiveComposition,
  updateCompositionDuration,
} from "./timeline";
import { createTitleElement } from "./elements";

function comp(id: string, duration: number, overlapNext = 0): Composition {
  return {
    id,
    name: id,
    start_time: 0,
    duration,
    elements: [],
    audio_tracks: [],
    transition_in: null,
    transition_out: null,
    overlap_next: overlapNext,
  };
}

function project(compositions: Composition[]): Project {
  return { name: "p", width: 1920, height: 1080, fps: 30, duration: 0, compositions };
}

describe("recomputeStartTimes", () => {
  it("lays out compositions sequentially without overlap", () => {
    const p = recomputeStartTimes(project([comp("a", 3), comp("b", 2)]));
    expect(p.compositions[0].start_time).toBe(0);
    expect(p.compositions[1].start_time).toBe(3);
    expect(p.duration).toBe(5);
  });

  it("shifts the next composition earlier when overlapping", () => {
    const p = recomputeStartTimes(project([comp("a", 3, 1), comp("b", 2)]));
    expect(p.compositions[1].start_time).toBe(2);
    expect(p.duration).toBe(4);
  });
});

describe("addComposition / removeComposition / updateCompositionDuration", () => {
  it("adds a composition with a default duration and recomputes timing", () => {
    const p = addComposition(project([comp("a", 5)]));
    expect(p.compositions).toHaveLength(2);
    expect(p.compositions[1].start_time).toBe(5);
  });

  it("refuses to remove the last remaining composition", () => {
    const p = removeComposition(project([comp("a", 5)]), "a");
    expect(p.compositions).toHaveLength(1);
  });

  it("removes a composition when more than one exists", () => {
    const p = removeComposition(project([comp("a", 5), comp("b", 3)]), "a");
    expect(p.compositions.map((c) => c.id)).toEqual(["b"]);
  });

  it("clamps duration updates to a minimum and recomputes start times", () => {
    const p = updateCompositionDuration(project([comp("a", 5), comp("b", 3)]), "a", 0.01);
    expect(p.compositions[0].duration).toBe(0.5);
    expect(p.compositions[1].start_time).toBe(0.5);
  });
});

describe("renameComposition", () => {
  it("renames only the matching composition", () => {
    const p = renameComposition(project([comp("a", 5), comp("b", 3)]), "b", "Intro");
    expect(p.compositions.map((c) => c.name)).toEqual(["a", "Intro"]);
  });
});

describe("reorderComposition", () => {
  it("swaps with the previous composition and recomputes timing", () => {
    const p = reorderComposition(recomputeStartTimes(project([comp("a", 5), comp("b", 3)])), "b", -1);
    expect(p.compositions.map((c) => c.id)).toEqual(["b", "a"]);
    expect(p.compositions[0].start_time).toBe(0);
    expect(p.compositions[1].start_time).toBe(3);
  });

  it("swaps with the next composition", () => {
    const p = reorderComposition(recomputeStartTimes(project([comp("a", 5), comp("b", 3)])), "a", 1);
    expect(p.compositions.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("is a no-op past either boundary", () => {
    const base = recomputeStartTimes(project([comp("a", 5), comp("b", 3)]));
    expect(reorderComposition(base, "a", -1).compositions.map((c) => c.id)).toEqual(["a", "b"]);
    expect(reorderComposition(base, "b", 1).compositions.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("is a no-op for an unknown composition id", () => {
    const base = recomputeStartTimes(project([comp("a", 5), comp("b", 3)]));
    expect(reorderComposition(base, "missing", 1)).toBe(base);
  });
});

describe("resolveActiveComposition", () => {
  it("finds the composition containing the given global time", () => {
    const p = recomputeStartTimes(project([comp("a", 3), comp("b", 2)]));
    const result = resolveActiveComposition(p, 4);
    expect(result?.composition.id).toBe("b");
    expect(result?.localTime).toBeCloseTo(1);
  });

  it("clamps to the last composition when time exceeds total duration", () => {
    const p = recomputeStartTimes(project([comp("a", 3)]));
    const result = resolveActiveComposition(p, 100);
    expect(result?.composition.id).toBe("a");
    expect(result?.localTime).toBe(3);
  });

  it("returns null for a project with no compositions", () => {
    expect(resolveActiveComposition(project([]), 0)).toBeNull();
  });
});

describe("isElementActive", () => {
  it("is active forever when duration is null", () => {
    const el = createTitleElement();
    expect(isElementActive(el, 0)).toBe(true);
    expect(isElementActive(el, 9999)).toBe(true);
  });

  it("respects start_time and duration bounds", () => {
    const el = { ...createTitleElement(), start_time: 2, duration: 3 };
    expect(isElementActive(el, 1)).toBe(false);
    expect(isElementActive(el, 2)).toBe(true);
    expect(isElementActive(el, 4.9)).toBe(true);
    expect(isElementActive(el, 5)).toBe(false);
  });
});
