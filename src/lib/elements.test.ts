import { describe, expect, it } from "vitest";
import type { Project } from "../bindings/Project";
import type { Composition } from "../bindings/Composition";
import {
  addElementToComposition,
  alignElements,
  createImageElement,
  createShapeElement,
  createStyledTextElement,
  createSubtitleElement,
  createTitleElement,
  createVideoElement,
  deleteElementFromProject,
  deleteElementsFromProject,
  distributeElements,
  duplicateElementInProject,
  duplicateElementsInProject,
  findElement,
  groupElements,
  groupMembers,
  moveElementToIndex,
  reorderElementInProject,
  splitElementInProject,
  ungroupElements,
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

describe("deleteElementsFromProject / duplicateElementsInProject", () => {
  it("deletes multiple elements in one call", () => {
    const elA = createTitleElement();
    const elB = createSubtitleElement();
    let p = addElementToComposition(project([emptyComposition("a")]), "a", elA);
    p = addElementToComposition(p, "a", elB);
    const next = deleteElementsFromProject(p, [elA.id, elB.id]);
    expect(next.compositions[0].elements).toHaveLength(0);
  });

  it("duplicates multiple elements, returning every new id", () => {
    const elA = createTitleElement();
    const elB = createSubtitleElement();
    let p = addElementToComposition(project([emptyComposition("a")]), "a", elA);
    p = addElementToComposition(p, "a", elB);
    const { project: next, newIds } = duplicateElementsInProject(p, [elA.id, elB.id]);
    expect(newIds).toHaveLength(2);
    expect(next.compositions[0].elements).toHaveLength(4);
  });
});

describe("alignElements", () => {
  it("aligns a single element's left edge to the canvas edge", () => {
    const el = { ...createTitleElement(), x: 40, width: 20 };
    const p = addElementToComposition(project([emptyComposition("a")]), "a", el);
    const next = alignElements(p, "a", [el.id], "left");
    expect(next.compositions[0].elements[0].x).toBe(0);
  });

  it("aligns multiple elements to their shared bounding box", () => {
    const elA = { ...createTitleElement(), x: 10, width: 20 };
    const elB = { ...createSubtitleElement(), x: 50, width: 20 };
    let p = addElementToComposition(project([emptyComposition("a")]), "a", elA);
    p = addElementToComposition(p, "a", elB);
    const next = alignElements(p, "a", [elA.id, elB.id], "left");
    // bbox left = min(10, 50) = 10 → both elements' x becomes 10.
    for (const el of next.compositions[0].elements) {
      expect(el.x).toBe(10);
    }
  });
});

describe("distributeElements", () => {
  it("spaces out at least 3 elements evenly along an axis", () => {
    const elA = { ...createTitleElement(), x: 0, width: 10 };
    const elB = { ...createSubtitleElement(), x: 30, width: 10 };
    const elC = { ...createShapeElement("rectangle"), x: 80, width: 10 };
    let p = addElementToComposition(project([emptyComposition("a")]), "a", elA);
    p = addElementToComposition(p, "a", elB);
    p = addElementToComposition(p, "a", elC);
    const next = distributeElements(p, "a", [elA.id, elB.id, elC.id], "horizontal");
    const byId = new Map(next.compositions[0].elements.map((el) => [el.id, el]));
    // Span 0..90, total width 30, gap = (90-30)/2 = 30 → x positions 0, 40, 80.
    expect(byId.get(elA.id)?.x).toBeCloseTo(0);
    expect(byId.get(elB.id)?.x).toBeCloseTo(40);
    expect(byId.get(elC.id)?.x).toBeCloseTo(80);
  });

  it("is a no-op with fewer than 3 elements", () => {
    const elA = { ...createTitleElement(), x: 0 };
    const elB = { ...createSubtitleElement(), x: 30 };
    let p = addElementToComposition(project([emptyComposition("a")]), "a", elA);
    p = addElementToComposition(p, "a", elB);
    const next = distributeElements(p, "a", [elA.id, elB.id], "horizontal");
    expect(next).toEqual(p);
  });
});

describe("moveElementToIndex", () => {
  it("moves an element to an arbitrary z-order index", () => {
    const elA = createTitleElement();
    const elB = createSubtitleElement();
    const elC = createShapeElement("rectangle");
    let p = addElementToComposition(project([emptyComposition("a")]), "a", elA);
    p = addElementToComposition(p, "a", elB);
    p = addElementToComposition(p, "a", elC);
    const next = moveElementToIndex(p, elC.id, 0);
    expect(next.compositions[0].elements.map((el) => el.id)).toEqual([elC.id, elA.id, elB.id]);
  });
});

describe("groupElements / ungroupElements / groupMembers", () => {
  it("assigns a shared group_id to at least 2 elements", () => {
    const elA = createTitleElement();
    const elB = createSubtitleElement();
    let p = addElementToComposition(project([emptyComposition("a")]), "a", elA);
    p = addElementToComposition(p, "a", elB);
    const next = groupElements(p, "a", [elA.id, elB.id]);
    const groupIdA = next.compositions[0].elements[0].group_id;
    expect(groupIdA).toBeTruthy();
    expect(next.compositions[0].elements[1].group_id).toBe(groupIdA);
  });

  it("is a no-op with fewer than 2 elements", () => {
    const elA = createTitleElement();
    const p = addElementToComposition(project([emptyComposition("a")]), "a", elA);
    const next = groupElements(p, "a", [elA.id]);
    expect(next).toEqual(p);
  });

  it("groupMembers returns just the element itself when not grouped", () => {
    const elA = createTitleElement();
    const p = addElementToComposition(project([emptyComposition("a")]), "a", elA);
    expect(groupMembers(p, "a", elA.id)).toEqual([elA.id]);
  });

  it("groupMembers returns every element sharing the same group_id", () => {
    const elA = createTitleElement();
    const elB = createSubtitleElement();
    const elC = createShapeElement("rectangle");
    let p = addElementToComposition(project([emptyComposition("a")]), "a", elA);
    p = addElementToComposition(p, "a", elB);
    p = addElementToComposition(p, "a", elC);
    p = groupElements(p, "a", [elA.id, elB.id]);
    expect(groupMembers(p, "a", elA.id).sort()).toEqual([elA.id, elB.id].sort());
    expect(groupMembers(p, "a", elC.id)).toEqual([elC.id]);
  });

  it("ungroupElements clears group_id for every member of the touched group(s)", () => {
    const elA = createTitleElement();
    const elB = createSubtitleElement();
    let p = addElementToComposition(project([emptyComposition("a")]), "a", elA);
    p = addElementToComposition(p, "a", elB);
    p = groupElements(p, "a", [elA.id, elB.id]);
    const next = ungroupElements(p, "a", [elA.id]);
    for (const el of next.compositions[0].elements) {
      expect(el.group_id).toBeNull();
    }
  });
});
