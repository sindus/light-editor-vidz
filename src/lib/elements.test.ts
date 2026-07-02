import { describe, expect, it } from "vitest";
import type { Project } from "../bindings/Project";
import type { Composition } from "../bindings/Composition";
import {
  addElementToComposition,
  createImageElement,
  createShapeElement,
  createStyledTextElement,
  createSubtitleElement,
  createTitleElement,
  createVideoElement,
  deleteElementFromProject,
  duplicateElementInProject,
  findElement,
  reorderElementInProject,
  splitElementInProject,
  updateElementInProject,
} from "./elements";

function emptyComposition(id: string, duration = 5): Composition {
  return {
    id,
    name: id,
    start_time: 0,
    duration,
    elements: [],
    transition_in: null,
    transition_out: null,
    overlap_next: 0,
  };
}

function project(compositions: Composition[]): Project {
  return { name: "p", width: 1920, height: 1080, fps: 30, duration: 5, compositions, audio_tracks: [] };
}

describe("element creators", () => {
  it("creates a title text element with sensible defaults", () => {
    const el = createTitleElement();
    expect(el.type).toBe("text");
    expect(el.width).toBeGreaterThan(0);
    expect(el.id).toBeTruthy();
  });

  it("creates distinct elements for each shape type", () => {
    const rect = createShapeElement("rectangle");
    const star = createShapeElement("star");
    expect(rect.type).toBe("shape");
    if (rect.type === "shape") expect(rect.shape_type).toBe("rectangle");
    if (star.type === "shape") expect(star.shape_type).toBe("star");
    expect(rect.id).not.toBe(star.id);
  });

  it("creates styled text presets with distinct visuals", () => {
    const neon = createStyledTextElement("neon");
    const box = createStyledTextElement("box");
    expect(neon.type).toBe("text");
    if (neon.type === "text" && box.type === "text") {
      expect(neon.color).not.toBe(box.color);
    }
  });

  it("creates image/video elements referencing the given source", () => {
    const img = createImageElement("assets/images/a.png", "a.png");
    const vid = createVideoElement("assets/videos/b.mp4", "b.mp4");
    if (img.type === "image") expect(img.src).toBe("assets/images/a.png");
    if (vid.type === "video") expect(vid.src).toBe("assets/videos/b.mp4");
  });
});

describe("addElementToComposition / findElement", () => {
  it("adds an element to the targeted composition only", () => {
    const p = project([emptyComposition("a"), emptyComposition("b")]);
    const el = createTitleElement();
    const next = addElementToComposition(p, "b", el);
    expect(next.compositions[0].elements).toHaveLength(0);
    expect(next.compositions[1].elements).toHaveLength(1);
    expect(findElement(next, el.id)?.id).toBe(el.id);
  });

  it("returns null for an unknown id", () => {
    const p = project([emptyComposition("a")]);
    expect(findElement(p, "does-not-exist")).toBeNull();
    expect(findElement(p, null)).toBeNull();
  });
});

describe("updateElementInProject", () => {
  it("merges a patch into the matching element", () => {
    const el = createTitleElement();
    const p = addElementToComposition(project([emptyComposition("a")]), "a", el);
    const next = updateElementInProject(p, el.id, { x: 42 });
    expect(next.compositions[0].elements[0].x).toBe(42);
  });
});

describe("reorderElementInProject", () => {
  it("swaps z-order with the neighbouring element", () => {
    const elA = createTitleElement();
    const elB = createSubtitleElement();
    let p = addElementToComposition(project([emptyComposition("a")]), "a", elA);
    p = addElementToComposition(p, "a", elB);
    const reordered = reorderElementInProject(p, elA.id, 1);
    expect(reordered.compositions[0].elements.map((e) => e.id)).toEqual([elB.id, elA.id]);
  });

  it("is a no-op at the array boundary", () => {
    const elA = createTitleElement();
    const p = addElementToComposition(project([emptyComposition("a")]), "a", elA);
    const reordered = reorderElementInProject(p, elA.id, -1);
    expect(reordered.compositions[0].elements.map((e) => e.id)).toEqual([elA.id]);
  });
});

describe("deleteElementFromProject / duplicateElementInProject", () => {
  it("removes the element from every composition", () => {
    const el = createTitleElement();
    const p = addElementToComposition(project([emptyComposition("a")]), "a", el);
    const next = deleteElementFromProject(p, el.id);
    expect(next.compositions[0].elements).toHaveLength(0);
  });

  it("duplicates an element with a new id, placed right after the original", () => {
    const el = createTitleElement();
    const p = addElementToComposition(project([emptyComposition("a")]), "a", el);
    const { project: next, newId } = duplicateElementInProject(p, el.id);
    expect(newId).toBeTruthy();
    expect(next.compositions[0].elements).toHaveLength(2);
    expect(next.compositions[0].elements[1].id).toBe(newId);
  });

  it("returns the project unchanged with a null id when the element is not found", () => {
    const p = project([emptyComposition("a")]);
    const { project: next, newId } = duplicateElementInProject(p, "missing");
    expect(newId).toBeNull();
    expect(next).toEqual(p);
  });
});

describe("splitElementInProject", () => {
  it("splits an element into two at the given local time", () => {
    const el = { ...createTitleElement(), start_time: 0, duration: 4 };
    const p = addElementToComposition(project([emptyComposition("a", 5)]), "a", el);
    const next = splitElementInProject(p, "a", el.id, 2);
    const elements = next.compositions[0].elements;
    expect(elements).toHaveLength(2);
    expect(elements[0].duration).toBeCloseTo(2);
    expect(elements[1].start_time).toBeCloseTo(2);
    expect(elements[1].duration).toBeCloseTo(2);
  });

  it("does not split when the cut point is too close to either edge", () => {
    const el = { ...createTitleElement(), start_time: 0, duration: 4 };
    const p = addElementToComposition(project([emptyComposition("a", 5)]), "a", el);
    const next = splitElementInProject(p, "a", el.id, 0.01);
    expect(next.compositions[0].elements).toHaveLength(1);
  });
});
