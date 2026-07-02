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
