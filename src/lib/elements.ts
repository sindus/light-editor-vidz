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
  group_id: string | null;
  blend_mode: null;
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
    group_id: null,
    blend_mode: null,
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
    letter_spacing: null,
    line_height: null,
    text_shadow: null,
    underline: false,
    strikethrough: false,
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
    letter_spacing: null,
    line_height: null,
    text_shadow: null,
    underline: false,
    strikethrough: false,
  };
}

export type TextStylePreset =
  | "neon"
  | "shadow"
  | "box"
  | "spaced"
  | "glow"
  | "outline"
  | "impact"
  | "minimal"
  | "elegant"
  | "highlight"
  | "underline"
  | "strike"
  | "retro"
  | "vintage"
  | "neonPink"
  | "neonGreen"
  | "warning"
  | "success"
  | "quote"
  | "caption"
  | "wideSpace"
  | "condensed"
  | "gold"
  | "cinema";

interface StylePreset {
  content: string;
  color: string;
  background_color: string | null;
  font_weight: "bold" | "normal";
  font_style: "normal" | "italic";
  letter_spacing: number | null;
  text_shadow: string | null;
  underline: boolean;
  strikethrough: boolean;
}

const STYLE_DEFAULTS: Omit<StylePreset, "content" | "color"> = {
  background_color: null,
  font_weight: "bold",
  font_style: "normal",
  letter_spacing: null,
  text_shadow: null,
  underline: false,
  strikethrough: false,
};

export const STYLE_PRESETS: Record<TextStylePreset, StylePreset> = {
  neon: { ...STYLE_DEFAULTS, content: "Néon", color: "rgba(92,134,255,1)" },
  shadow: {
    ...STYLE_DEFAULTS,
    content: "Ombre",
    color: "rgba(255,255,255,1)",
    text_shadow: "rgba(92,134,255,1)",
  },
  box: {
    ...STYLE_DEFAULTS,
    content: "Boîte",
    color: "rgba(17,17,17,1)",
    background_color: "rgba(255,255,255,1)",
  },
  spaced: {
    ...STYLE_DEFAULTS,
    content: "S P A C É",
    color: "rgba(255,255,255,1)",
    font_weight: "normal",
  },
  glow: {
    ...STYLE_DEFAULTS,
    content: "Lueur",
    color: "rgba(120,200,255,1)",
    text_shadow: "rgba(120,200,255,0.8)",
  },
  outline: {
    ...STYLE_DEFAULTS,
    content: "Contour",
    color: "rgba(255,255,255,1)",
    text_shadow: "rgba(0,0,0,0.9)",
  },
  impact: {
    ...STYLE_DEFAULTS,
    content: "IMPACT",
    color: "rgba(17,17,17,1)",
    background_color: "rgba(255,214,0,1)",
  },
  minimal: {
    ...STYLE_DEFAULTS,
    content: "Minimal",
    color: "rgba(255,255,255,0.85)",
    font_weight: "normal",
  },
  elegant: {
    ...STYLE_DEFAULTS,
    content: "Élégant",
    color: "rgba(255,255,255,1)",
    font_weight: "normal",
    font_style: "italic",
  },
  highlight: {
    ...STYLE_DEFAULTS,
    content: "Surligné",
    color: "rgba(17,17,17,1)",
    background_color: "rgba(255,235,59,1)",
  },
  underline: {
    ...STYLE_DEFAULTS,
    content: "Souligné",
    color: "rgba(255,255,255,1)",
    font_weight: "normal",
    underline: true,
  },
  strike: {
    ...STYLE_DEFAULTS,
    content: "Barré",
    color: "rgba(255,255,255,1)",
    font_weight: "normal",
    strikethrough: true,
  },
  retro: {
    ...STYLE_DEFAULTS,
    content: "Rétro",
    color: "rgba(255,255,255,1)",
    background_color: "rgba(214,94,39,1)",
  },
  vintage: {
    ...STYLE_DEFAULTS,
    content: "Vintage",
    color: "rgba(214,186,140,1)",
    font_weight: "normal",
    font_style: "italic",
  },
  neonPink: {
    ...STYLE_DEFAULTS,
    content: "Néon rose",
    color: "rgba(255,92,200,1)",
    text_shadow: "rgba(255,92,200,0.8)",
  },
  neonGreen: {
    ...STYLE_DEFAULTS,
    content: "Néon vert",
    color: "rgba(92,255,160,1)",
    text_shadow: "rgba(92,255,160,0.8)",
  },
  warning: {
    ...STYLE_DEFAULTS,
    content: "Alerte",
    color: "rgba(255,255,255,1)",
    background_color: "rgba(220,53,69,1)",
  },
  success: {
    ...STYLE_DEFAULTS,
    content: "Succès",
    color: "rgba(255,255,255,1)",
    background_color: "rgba(56,209,122,1)",
  },
  quote: {
    ...STYLE_DEFAULTS,
    content: "Citation",
    color: "rgba(220,220,220,0.85)",
    font_weight: "normal",
    font_style: "italic",
  },
  caption: {
    ...STYLE_DEFAULTS,
    content: "Légende",
    color: "rgba(255,255,255,1)",
    background_color: "rgba(0,0,0,0.5)",
    font_weight: "normal",
  },
  wideSpace: {
    ...STYLE_DEFAULTS,
    content: "ESPACÉ",
    color: "rgba(255,255,255,1)",
    letter_spacing: 1.5,
  },
  condensed: {
    ...STYLE_DEFAULTS,
    content: "Condensé",
    color: "rgba(255,255,255,1)",
    letter_spacing: -1,
  },
  gold: {
    ...STYLE_DEFAULTS,
    content: "Or",
    color: "rgba(212,175,55,1)",
  },
  cinema: {
    ...STYLE_DEFAULTS,
    content: "CINÉMA",
    color: "rgba(255,255,255,1)",
    background_color: "rgba(0,0,0,0.7)",
    letter_spacing: 0.5,
  },
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
    font_style: p.font_style,
    letter_spacing: p.letter_spacing,
    line_height: null,
    text_shadow: p.text_shadow,
    underline: p.underline,
    strikethrough: p.strikethrough,
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
    corner_radius: null,
    border_color: null,
    border_width: null,
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
    corner_radius: null,
    border_color: null,
    border_width: null,
    volume: 1,
    muted: false,
    playback_speed: 1,
    loop_video: false,
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
    stroke_dash: null,
    gradient_to: null,
    gradient_angle: null,
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
      const right: Element = {
        ...el,
        id: crypto.randomUUID(),
        start_time: el.start_time + cutAt,
        duration: fullDuration - cutAt,
      };
      // Continuité de la source vidéo : la moitié droite doit reprendre là où la coupe a eu
      // lieu dans le fichier source, pas au point d'entrée d'origine.
      if (right.type === "video") {
        right.video_offset += cutAt * (right.playback_speed > 0.01 ? right.playback_speed : 1);
      }
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
  return { project: remapGroupIds(current, newIds), newIds };
}

/** Donne un `group_id` neuf (partagé par copie de groupe) aux éléments listés : les copies ne
 * doivent pas rejoindre le groupe des originaux, sinon déplacer une copie déplace l'original. */
export function remapGroupIds(project: Project, elementIds: string[]): Project {
  const idSet = new Set(elementIds);
  const remap = new Map<string, string>();
  return {
    ...project,
    compositions: project.compositions.map((comp) => ({
      ...comp,
      elements: comp.elements.map((el) => {
        if (!idSet.has(el.id) || !el.group_id) return el;
        if (!remap.has(el.group_id)) remap.set(el.group_id, crypto.randomUUID());
        return { ...el, group_id: remap.get(el.group_id)! } as Element;
      }),
    })),
  };
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

/** Groupe au moins 2 éléments : ils partagent désormais un `group_id` commun (nouvel uuid). */
export function groupElements(project: Project, compId: string, elementIds: string[]): Project {
  if (elementIds.length < 2) return project;
  const groupId = crypto.randomUUID();
  return {
    ...project,
    compositions: project.compositions.map((comp) =>
      comp.id === compId
        ? {
            ...comp,
            elements: comp.elements.map((el) =>
              elementIds.includes(el.id) ? ({ ...el, group_id: groupId } as Element) : el,
            ),
          }
        : comp,
    ),
  };
}

/** Dégroupe : efface `group_id` sur tous les éléments des groupes touchés par `elementIds`. */
export function ungroupElements(project: Project, compId: string, elementIds: string[]): Project {
  return {
    ...project,
    compositions: project.compositions.map((comp) => {
      if (comp.id !== compId) return comp;
      const groupIds = new Set(
        comp.elements.filter((el) => elementIds.includes(el.id) && el.group_id).map((el) => el.group_id),
      );
      if (groupIds.size === 0) return comp;
      return {
        ...comp,
        elements: comp.elements.map((el) =>
          el.group_id && groupIds.has(el.group_id) ? ({ ...el, group_id: null } as Element) : el,
        ),
      };
    }),
  };
}

/** Ids de tous les membres du groupe de `elementId` (juste `[elementId]` s'il n'est pas groupé). */
export function groupMembers(project: Project, compId: string, elementId: string): string[] {
  const comp = project.compositions.find((c) => c.id === compId);
  const el = comp?.elements.find((e) => e.id === elementId);
  if (!comp || !el || !el.group_id) return [elementId];
  return comp.elements.filter((e) => e.group_id === el.group_id).map((e) => e.id);
}
