import type { Project } from "../bindings/Project";
import type { Composition } from "../bindings/Composition";
import type { Element } from "../bindings/Element";
import type { AudioTrack } from "../bindings/AudioTrack";
import type { Animation } from "../bindings/Animation";
import type { AnimationType } from "../bindings/AnimationType";
import type { Easing } from "../bindings/Easing";
import type { Transition } from "../bindings/Transition";
import type { TransitionType } from "../bindings/TransitionType";
import type { FitMode } from "../bindings/FitMode";
import type { ShapeType } from "../bindings/ShapeType";
import type { ImagePanType } from "../bindings/ImagePanType";

/**
 * Convertit le format JSON de l'ancien projet (`/home/sikander/Documents/dev/video`,
 * positions pixel `top/left` + ancre, easing façon GSAP `power2.inOut`) vers notre
 * modèle (`x/y/width/height` en % du canvas, easing kebab-case).
 *
 * Limitation connue : les médias image/vidéo référencés par `src` ne sont PAS
 * re-téléchargés/recopiés — le chemin est repris tel quel et devra être corrigé
 * manuellement (ré-importer le média) si le fichier n'est pas accessible au même
 * chemin depuis ce poste.
 */

const VALID_FIT_MODES: FitMode[] = ["fit-height", "fit-width", "fit-largest", "cover", "stretch"];
const VALID_SHAPE_TYPES: ShapeType[] = ["rectangle", "ellipse", "triangle", "line", "arrow", "star"];
const VALID_PAN_TYPES: ImagePanType[] = ["zoomIn", "zoomOut", "panLeft", "panRight", "panUp", "panDown"];

function newId(): string {
  return crypto.randomUUID();
}

/** "power2.inOut" (GSAP, ancien projet) -> "power2-in-out" (notre schéma kebab-case). */
function convertEasing(raw: unknown): Easing {
  const s = typeof raw === "string" ? raw : "linear";
  const kebab = s
    .replace(/\./g, "-")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase() as Easing;
  const VALID: Easing[] = [
    "linear",
    "power1-in",
    "power1-out",
    "power1-in-out",
    "power2-in",
    "power2-out",
    "power2-in-out",
    "power3-in",
    "power3-out",
    "power3-in-out",
    "bounce",
  ];
  return VALID.includes(kebab) ? kebab : "linear";
}

const VALID_ANIMATION_TYPES: AnimationType[] = [
  "fade",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "zoom-in",
  "zoom-out",
  "rotate",
  "flip",
  "blur",
  "fade-up",
  "fade-down",
  "fade-left",
  "fade-right",
  "skew-left",
  "skew-right",
  "roll",
  "spin",
  "bounce",
  "drop",
  "typewriter",
  "word-reveal",
  "line-reveal",
];

const VALID_TRANSITION_TYPES: TransitionType[] = [
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "zoom",
  "flip-h",
  "flip-v",
  "rotate-cw",
  "rotate-ccw",
  "blur",
  "wipe-left",
  "wipe-right",
  "wipe-up",
  "wipe-down",
  "fade",
];

function convertAnimations(raw: unknown): Animation[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a): Animation[] => {
    if (!a || typeof a !== "object") return [];
    const type = (a as Record<string, unknown>).type;
    if (typeof type !== "string" || !VALID_ANIMATION_TYPES.includes(type as AnimationType)) return [];
    return [
      {
        animation_type: type as AnimationType,
        direction: (a as Record<string, unknown>).direction === "out" ? "out" : "in",
        duration: Number((a as Record<string, unknown>).duration) || 0.6,
        easing: convertEasing((a as Record<string, unknown>).easing),
        with_fade: !!(a as Record<string, unknown>).withFade,
      },
    ];
  });
}

function convertTransition(raw: unknown): Transition | null {
  if (!raw || typeof raw !== "object") return null;
  const type = (raw as Record<string, unknown>).type;
  if (typeof type !== "string" || !VALID_TRANSITION_TYPES.includes(type as TransitionType)) return null;
  return {
    transition_type: type as TransitionType,
    duration: Number((raw as Record<string, unknown>).duration) || 0.6,
    easing: convertEasing((raw as Record<string, unknown>).easing),
  };
}

/** Reproduit `reverseAnchor` de l'ancien projet : ancre -> coin haut-gauche, en pixels. */
function reverseAnchor(
  top: number,
  left: number,
  width: number,
  height: number,
  topOrigin: string,
  leftOrigin: string,
): { x: number; y: number } {
  const y = topOrigin === "top" ? top : topOrigin === "center" ? top - height / 2 : top - height;
  const x = leftOrigin === "left" ? left : leftOrigin === "center" ? left - width / 2 : left - width;
  return { x, y };
}

interface GeometryPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

function toPercent(px: GeometryPx, canvasWidth: number, canvasHeight: number) {
  return {
    x: (px.x / canvasWidth) * 100,
    y: (px.y / canvasHeight) * 100,
    width: (px.width / canvasWidth) * 100,
    height: (px.height / canvasHeight) * 100,
  };
}

function convertElement(raw: unknown, canvasWidth: number, canvasHeight: number): Element | null {
  if (!raw || typeof raw !== "object") return null;
  const el = raw as Record<string, unknown>;
  const type = el.type;
  if (type !== "text" && type !== "image" && type !== "video" && type !== "shape") return null;

  const widthPx = Number(el.width) || (type === "shape" ? 200 : 400);
  const heightPx = Number(el.height) || (type === "shape" ? 100 : 300);
  const topOrigin = typeof el.topOrigin === "string" ? el.topOrigin : "center";
  const leftOrigin = typeof el.leftOrigin === "string" ? el.leftOrigin : "center";
  const { x, y } = reverseAnchor(Number(el.top) || 0, Number(el.left) || 0, widthPx, heightPx, topOrigin, leftOrigin);
  const geo = toPercent({ x, y, width: widthPx, height: heightPx }, canvasWidth, canvasHeight);

  const base = {
    id: typeof el.id === "string" ? el.id : newId(),
    name: typeof el.name === "string" ? el.name : type,
    start_time: Number(el.startTime) || 0,
    duration: el.duration != null ? Number(el.duration) : null,
    x: geo.x,
    y: geo.y,
    width: geo.width,
    height: geo.height,
    rotation: el.rotation != null ? Number(el.rotation) : 0,
    animations: convertAnimations(el.animations),
    group_id: null,
    blend_mode: null,
  };

  if (type === "text") {
    return {
      type: "text",
      ...base,
      content: typeof el.content === "string" ? el.content : "",
      alignment: el.alignment === "left" || el.alignment === "right" ? el.alignment : "center",
      vertical_alignment:
        el.verticalAlignment === "top" || el.verticalAlignment === "bottom" ? el.verticalAlignment : "middle",
      color: typeof el.color === "string" ? el.color : "rgba(255,255,255,1)",
      background_color: typeof el.backgroundColor === "string" ? el.backgroundColor : null,
      // Ancien : fontSize en px absolus. Nouveau : cqw (% de la largeur du canvas).
      font_size: el.fontSize != null ? (Number(el.fontSize) / canvasWidth) * 100 : null,
      font_family: typeof el.fontFamily === "string" ? el.fontFamily : null,
      font_weight: el.fontWeight === "bold" ? "bold" : "normal",
      font_style: el.fontStyle === "italic" ? "italic" : "normal",
      letter_spacing: null,
      line_height: null,
      text_shadow: null,
      underline: false,
      strikethrough: false,
    };
  }

  const fitMode: FitMode = VALID_FIT_MODES.includes(el.fitMode as FitMode) ? (el.fitMode as FitMode) : "cover";
  const panRaw = el.imagePan as Record<string, unknown> | undefined;
  const imagePan =
    panRaw && typeof panRaw === "object" && VALID_PAN_TYPES.includes(panRaw.type as ImagePanType)
      ? { pan_type: panRaw.type as ImagePanType, intensity: Number(panRaw.intensity) || 0.5 }
      : null;

  if (type === "image") {
    return {
      type: "image",
      ...base,
      src: typeof el.src === "string" ? el.src : "",
      fit_mode: fitMode,
      background_color: typeof el.backgroundColor === "string" ? el.backgroundColor : null,
      image_pan: imagePan,
      corner_radius: null,
      border_color: null,
      border_width: null,
    };
  }

  if (type === "video") {
    return {
      type: "video",
      ...base,
      src: typeof el.src === "string" ? el.src : "",
      fit_mode: fitMode,
      background_color: typeof el.backgroundColor === "string" ? el.backgroundColor : null,
      image_pan: imagePan,
      video_offset: Number(el.videoOffset) || 0,
      corner_radius: null,
      border_color: null,
      border_width: null,
      volume: 1,
      muted: false,
      playback_speed: 1,
      loop_video: false,
    };
  }

  // shape
  return {
    type: "shape",
    ...base,
    shape_type: VALID_SHAPE_TYPES.includes(el.shapeType as ShapeType) ? (el.shapeType as ShapeType) : "rectangle",
    fill: typeof el.fill === "string" ? el.fill : "rgba(99,102,241,1)",
    stroke: typeof el.stroke === "string" ? el.stroke : "none",
    stroke_width: el.strokeWidth != null ? Number(el.strokeWidth) : 3,
    border_radius: el.borderRadius != null ? Number(el.borderRadius) : null,
    stroke_dash: null,
    gradient_to: null,
    gradient_angle: null,
  };
}

function convertComposition(
  raw: unknown,
  canvasWidth: number,
  canvasHeight: number,
  fallbackDuration: number,
): Composition {
  const comp = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const elements = Array.isArray(comp.elements)
    ? comp.elements.flatMap((e) => {
        const converted = convertElement(e, canvasWidth, canvasHeight);
        return converted ? [converted] : [];
      })
    : [];

  return {
    id: typeof comp.id === "string" ? comp.id : newId(),
    name: typeof comp.name === "string" ? comp.name : "Scène importée",
    start_time: Number(comp.startTime) || 0,
    duration: Number(comp.duration) || fallbackDuration,
    elements,
    transition_in: convertTransition(comp.transitionIn),
    transition_out: convertTransition(comp.transitionOut),
    overlap_next: Number(comp.overlapNext) || 0,
  };
}

function convertAudioTrack(raw: unknown): AudioTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  return {
    id: typeof t.id === "string" ? t.id : newId(),
    name: typeof t.name === "string" ? t.name : "Audio",
    src: typeof t.src === "string" ? t.src : "",
    start_time: Number(t.startTime) || 0,
    duration: t.duration != null ? Number(t.duration) : null,
    volume: t.volume != null ? Math.max(0, Math.min(1, Number(t.volume))) : 1,
    audio_offset: Number(t.audioOffset) || 0,
    fade_in: 0,
    fade_out: 0,
    muted: false,
    solo: false,
  };
}

export function parseLegacyProjectJSON(raw: unknown): Project {
  if (!raw || typeof raw !== "object") throw new Error("JSON invalide");
  const data = raw as Record<string, unknown>;
  const width = Number(data.width) || 1920;
  const height = Number(data.height) || 1080;
  const duration = Number(data.duration) || 5;

  const compositions = Array.isArray(data.compositions)
    ? data.compositions.map((c) => convertComposition(c, width, height, duration))
    : [];

  const audioTracks = Array.isArray(data.audioTracks)
    ? data.audioTracks.flatMap((t) => {
        const converted = convertAudioTrack(t);
        return converted ? [converted] : [];
      })
    : [];

  const finalCompositions = compositions.length > 0 ? compositions : [convertComposition({}, width, height, duration)];

  return {
    name: typeof data.name === "string" ? data.name : "Projet importé",
    width,
    height,
    fps: 30,
    duration,
    compositions: finalCompositions,
    // L'ancien format stockait déjà les pistes au niveau projet avec un startTime absolu —
    // même convention que le modèle actuel, aucune réassignation nécessaire.
    audio_tracks: audioTracks,
  };
}
