import type { Element } from "../bindings/Element";
import type { TextElement } from "../bindings/TextElement";
import type { ImageElement } from "../bindings/ImageElement";
import type { VideoElement } from "../bindings/VideoElement";
import type { ShapeElement } from "../bindings/ShapeElement";
import type { ShapeType } from "../bindings/ShapeType";
import type { Project } from "../bindings/Project";

/** Patch générique : union des champs de tous les types d'élément (Phase 3 : 4 types). */
export type ElementPatch = Partial<TextElement & ImageElement & VideoElement & ShapeElement>;

function newId(): string {
  return crypto.randomUUID();
}

type BaseFields = {
  id: string;
  name: string;
  start_time: number;
  duration: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  animations: [];
};

function baseDefaults(name: string, overrides: Partial<BaseFields> = {}): BaseFields {
  return {
    id: newId(),
    name,
    start_time: 0,
    duration: null,
    x: 10,
    y: 40,
    width: 80,
    height: 20,
    rotation: 0,
    animations: [],
    ...overrides,
  };
}

export function createTitleElement(): Element {
  return {
    type: "text",
    ...baseDefaults("Titre"),
    content: "Votre titre",
    alignment: "center",
    vertical_alignment: "middle",
    color: "rgba(255,255,255,1)",
    background_color: null,
    font_size: 6.6,
    font_family: "Manrope",
    font_weight: "bold",
    font_style: "normal",
  };
}

export function createSubtitleElement(): Element {
  return {
    type: "text",
    ...baseDefaults("Sous-titre", { x: 10, y: 62, height: 10 }),
    content: "Votre sous-titre",
    alignment: "center",
    vertical_alignment: "middle",
    color: "rgba(255,255,255,1)",
    background_color: "rgba(0,0,0,0.35)",
    font_size: 2.7,
    font_family: "Manrope",
    font_weight: "normal",
    font_style: "normal",
  };
}

export type TextStylePreset = "neon" | "shadow" | "box" | "spaced";

const STYLE_PRESETS: Record<
  TextStylePreset,
  { content: string; color: string; background_color: string | null; font_weight: "bold" | "normal" }
> = {
  neon: { content: "Néon", color: "rgba(92,134,255,1)", background_color: null, font_weight: "bold" },
  shadow: { content: "Ombre", color: "rgba(255,255,255,1)", background_color: null, font_weight: "bold" },
  box: { content: "Boîte", color: "rgba(17,17,17,1)", background_color: "rgba(255,255,255,1)", font_weight: "bold" },
  spaced: { content: "S P A C É", color: "rgba(255,255,255,1)", background_color: null, font_weight: "normal" },
};

export function createStyledTextElement(preset: TextStylePreset): Element {
  const p = STYLE_PRESETS[preset];
  return {
    type: "text",
    ...baseDefaults(p.content),
    content: p.content,
    alignment: "center",
    vertical_alignment: "middle",
    color: p.color,
    background_color: p.background_color,
    font_size: 6,
    font_family: "Manrope",
    font_weight: p.font_weight,
    font_style: "normal",
  };
}

export function createImageElement(relativeSrc: string, name: string): Element {
  return {
    type: "image",
    ...baseDefaults(name, { x: 30, y: 30, width: 40, height: 40 }),
    src: relativeSrc,
    fit_mode: "cover",
    background_color: null,
    image_pan: null,
  };
}

export function createVideoElement(relativeSrc: string, name: string): Element {
  return {
    type: "video",
    ...baseDefaults(name, { x: 10, y: 10, width: 80, height: 80 }),
    src: relativeSrc,
    fit_mode: "cover",
    background_color: null,
    image_pan: null,
    video_offset: 0,
  };
}

const SHAPE_NAMES: Record<ShapeType, string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  line: "Ligne",
  arrow: "Flèche",
  star: "Étoile",
};

export function createShapeElement(shapeType: ShapeType): Element {
  return {
    type: "shape",
    ...baseDefaults(SHAPE_NAMES[shapeType], { x: 30, y: 35, width: 40, height: 30 }),
    shape_type: shapeType,
    fill: "rgba(92,134,255,1)",
    stroke: "none",
    stroke_width: 3,
    border_radius: shapeType === "rectangle" ? 8 : null,
  };
}

/** Ajoute un élément dans la composition ciblée (composition active de la timeline). */
export function addElementToComposition(project: Project, compId: string, element: Element): Project {
  return {
    ...project,
    compositions: project.compositions.map((c) => (c.id === compId ? { ...c, elements: [...c.elements, element] } : c)),
  };
}

/** Met à jour un élément (par id) dans toutes les compositions, en fusionnant `patch`. */
export function updateElementInProject(project: Project, elementId: string, patch: ElementPatch): Project {
  return {
    ...project,
    compositions: project.compositions.map((comp) => ({
      ...comp,
      elements: comp.elements.map((el) => (el.id === elementId ? ({ ...el, ...patch } as Element) : el)),
    })),
  };
}

/** Avance (+1) ou recule (-1) un élément dans l'ordre d'empilement (z-index = ordre du tableau). */
export function reorderElementInProject(project: Project, elementId: string, direction: 1 | -1): Project {
  return {
    ...project,
    compositions: project.compositions.map((comp) => {
      const idx = comp.elements.findIndex((el) => el.id === elementId);
      const targetIdx = idx + direction;
      if (idx === -1 || targetIdx < 0 || targetIdx >= comp.elements.length) return comp;
      const elements = [...comp.elements];
      [elements[idx], elements[targetIdx]] = [elements[targetIdx], elements[idx]];
      return { ...comp, elements };
    }),
  };
}

export function deleteElementFromProject(project: Project, elementId: string): Project {
  return {
    ...project,
    compositions: project.compositions.map((comp) => ({
      ...comp,
      elements: comp.elements.filter((el) => el.id !== elementId),
    })),
  };
}

export function duplicateElementInProject(
  project: Project,
  elementId: string,
): { project: Project; newId: string | null } {
  const newId = crypto.randomUUID();
  let created = false;
  const compositions = project.compositions.map((comp) => {
    const idx = comp.elements.findIndex((el) => el.id === elementId);
    if (idx === -1) return comp;
    created = true;
    const copy = { ...comp.elements[idx], id: newId, name: `${comp.elements[idx].name} (copie)` };
    const elements = [...comp.elements];
    elements.splice(idx + 1, 0, copy);
    return { ...comp, elements };
  });
  return { project: { ...project, compositions }, newId: created ? newId : null };
}

/** Coupe un élément en deux au temps local `at` (relatif au début de la composition). */
export function splitElementInProject(project: Project, compId: string, elementId: string, at: number): Project {
  return {
    ...project,
    compositions: project.compositions.map((comp) => {
      if (comp.id !== compId) return comp;
      const idx = comp.elements.findIndex((el) => el.id === elementId);
      if (idx === -1) return comp;
      const el = comp.elements[idx];
      const fullDuration = el.duration ?? comp.duration - el.start_time;
      const cutAt = at - el.start_time;
      if (cutAt <= 0.05 || cutAt >= fullDuration - 0.05) return comp;
      const left = { ...el, duration: cutAt };
      const right = {
        ...el,
        id: crypto.randomUUID(),
        start_time: el.start_time + cutAt,
        duration: fullDuration - cutAt,
      };
      const elements = [...comp.elements];
      elements.splice(idx, 1, left, right);
      return { ...comp, elements };
    }),
  };
}

export function updateElementTiming(
  project: Project,
  elementId: string,
  startTime: number,
  duration: number | null,
): Project {
  return updateElementInProject(project, elementId, { start_time: startTime, duration } as ElementPatch);
}

export function findElement(project: Project, elementId: string | null): Element | null {
  if (!elementId) return null;
  for (const comp of project.compositions) {
    const found = comp.elements.find((el) => el.id === elementId);
    if (found) return found;
  }
  return null;
}

/** Duplique plusieurs éléments d'un coup, en conservant leur ordre relatif. */
export function duplicateElementsInProject(
  project: Project,
  elementIds: string[],
): { project: Project; newIds: string[] } {
  let current = project;
  const newIds: string[] = [];
  for (const id of elementIds) {
    const { project: next, newId } = duplicateElementInProject(current, id);
    current = next;
    if (newId) newIds.push(newId);
  }
  return { project: current, newIds };
}

/** Supprime plusieurs éléments (par id) de toutes les compositions. */
export function deleteElementsFromProject(project: Project, elementIds: string[]): Project {
  const idSet = new Set(elementIds);
  return {
    ...project,
    compositions: project.compositions.map((comp) => ({
      ...comp,
      elements: comp.elements.filter((el) => !idSet.has(el.id)),
    })),
  };
}

export type AlignEdge = "left" | "center-h" | "right" | "top" | "center-v" | "bottom";

/** Aligne les éléments donnés entre eux (bbox englobante) ou, si un seul, sur le canvas (0-100). */
export function alignElements(project: Project, compId: string, elementIds: string[], edge: AlignEdge): Project {
  return {
    ...project,
    compositions: project.compositions.map((comp) => {
      if (comp.id !== compId) return comp;
      const targets = comp.elements.filter((el) => elementIds.includes(el.id));
      if (targets.length === 0) return comp;
      const bboxLeft = targets.length > 1 ? Math.min(...targets.map((el) => el.x)) : 0;
      const bboxRight = targets.length > 1 ? Math.max(...targets.map((el) => el.x + el.width)) : 100;
      const bboxTop = targets.length > 1 ? Math.min(...targets.map((el) => el.y)) : 0;
      const bboxBottom = targets.length > 1 ? Math.max(...targets.map((el) => el.y + el.height)) : 100;
      return {
        ...comp,
        elements: comp.elements.map((el) => {
          if (!elementIds.includes(el.id)) return el;
          switch (edge) {
            case "left":
              return { ...el, x: bboxLeft };
            case "right":
              return { ...el, x: bboxRight - el.width };
            case "center-h":
              return { ...el, x: bboxLeft + (bboxRight - bboxLeft) / 2 - el.width / 2 };
            case "top":
              return { ...el, y: bboxTop };
            case "bottom":
              return { ...el, y: bboxBottom - el.height };
            case "center-v":
              return { ...el, y: bboxTop + (bboxBottom - bboxTop) / 2 - el.height / 2 };
            default:
              return el;
          }
        }),
      };
    }),
  };
}

/** Distribue uniformément l'espacement entre au moins 3 éléments, sur l'axe donné. */
export function distributeElements(
  project: Project,
  compId: string,
  elementIds: string[],
  axis: "horizontal" | "vertical",
): Project {
  return {
    ...project,
    compositions: project.compositions.map((comp) => {
      if (comp.id !== compId) return comp;
      const targets = comp.elements.filter((el) => elementIds.includes(el.id));
      if (targets.length < 3) return comp;
      const sorted = [...targets].sort((a, b) => (axis === "horizontal" ? a.x - b.x : a.y - b.y));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const span = axis === "horizontal" ? last.x + last.width - first.x : last.y + last.height - first.y;
      const totalSize = sorted.reduce((sum, el) => sum + (axis === "horizontal" ? el.width : el.height), 0);
      const gap = (span - totalSize) / (sorted.length - 1);
      let cursor = axis === "horizontal" ? first.x : first.y;
      const newPositions = new Map<string, number>();
      for (const el of sorted) {
        newPositions.set(el.id, cursor);
        cursor += (axis === "horizontal" ? el.width : el.height) + gap;
      }
      return {
        ...comp,
        elements: comp.elements.map((el) => {
          const pos = newPositions.get(el.id);
          if (pos === undefined) return el;
          return axis === "horizontal" ? { ...el, x: pos } : { ...el, y: pos };
        }),
      };
    }),
  };
}

/** Déplace un élément à un index précis dans le tableau (ordre d'empilement = z-order). */
export function moveElementToIndex(project: Project, elementId: string, toIndex: number): Project {
  return {
    ...project,
    compositions: project.compositions.map((comp) => {
      const fromIndex = comp.elements.findIndex((el) => el.id === elementId);
      if (fromIndex === -1) return comp;
      const elements = [...comp.elements];
      const [moved] = elements.splice(fromIndex, 1);
      elements.splice(Math.max(0, Math.min(elements.length, toIndex)), 0, moved);
      return { ...comp, elements };
    }),
  };
}
