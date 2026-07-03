import type { Easing } from "../bindings/Easing";
import type { Animation } from "../bindings/Animation";
import type { AnimationType } from "../bindings/AnimationType";
import type { Transition } from "../bindings/Transition";
import type { TransitionType } from "../bindings/TransitionType";
import type { ImagePan } from "../bindings/ImagePan";

/**
 * Résolution d'animation — port TS temporaire (même limitation que `timeline.ts` :
 * à terme cette logique doit vivre une seule fois dans `scene-core` et être partagée
 * via wasm avec l'export natif, voir Phase 7 du plan).
 *
 * Contrairement à l'ancien projet, plusieurs animations sur un même élément se
 * COMPOSENT (translation additive, échelle multiplicative) au lieu que la dernière
 * écrase les précédentes.
 */

export function applyEase(t: number, easing: Easing): number {
  const c = Math.min(1, Math.max(0, t));
  switch (easing) {
    case "linear":
      return c;
    case "power1-in":
      return c * c;
    case "power1-out":
      return c * (2 - c);
    case "power1-in-out":
      return c < 0.5 ? 2 * c * c : -1 + (4 - 2 * c) * c;
    case "power2-in":
      return c * c * c;
    case "power2-out": {
      const p = c - 1;
      return p * p * p + 1;
    }
    case "power2-in-out":
      return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
    case "power3-in":
      return c * c * c * c;
    case "power3-out": {
      const p = c - 1;
      return 1 - p * p * p * p;
    }
    case "power3-in-out":
      return c < 0.5 ? 8 * c * c * c * c : 1 - Math.pow(-2 * c + 2, 4) / 2;
    case "bounce": {
      const n1 = 7.5625;
      const d1 = 2.75;
      let x = c;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
      if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
      return n1 * (x -= 2.625 / d1) * x + 0.984375;
    }
    default:
      return c;
  }
}

export interface ResolvedTransform {
  opacity: number;
  dxPct: number;
  dyPct: number;
  scale: number;
  rotateDeg: number;
  skewDeg: number;
  blurPx: number;
}

function identity(): ResolvedTransform {
  return { opacity: 1, dxPct: 0, dyPct: 0, scale: 1, rotateDeg: 0, skewDeg: 0, blurPx: 0 };
}

/** progress: 0 = état caché/décalé, 1 = état final (posé). */
function shapeFor(type: AnimationType, progress: number): ResolvedTransform {
  const p = progress;
  switch (type) {
    case "fade":
      return { ...identity(), opacity: p };
    case "slide-left":
      return { ...identity(), dxPct: (1 - p) * 50 };
    case "slide-right":
      return { ...identity(), dxPct: -(1 - p) * 50 };
    case "slide-up":
      return { ...identity(), dyPct: (1 - p) * 50 };
    case "slide-down":
      return { ...identity(), dyPct: -(1 - p) * 50 };
    case "fade-left":
      return { ...identity(), opacity: p, dxPct: (1 - p) * 30 };
    case "fade-right":
      return { ...identity(), opacity: p, dxPct: -(1 - p) * 30 };
    case "fade-up":
      return { ...identity(), opacity: p, dyPct: (1 - p) * 30 };
    case "fade-down":
      return { ...identity(), opacity: p, dyPct: -(1 - p) * 30 };
    case "zoom-in":
      return { ...identity(), scale: 0.5 + 0.5 * p };
    case "zoom-out":
      return { ...identity(), scale: 1.5 - 0.5 * p };
    case "rotate":
      return { ...identity(), rotateDeg: -180 * (1 - p) };
    case "flip":
      return { ...identity(), scale: Math.max(0.02, p) };
    case "blur":
      return { ...identity(), blurPx: (1 - p) * 12 };
    case "bounce":
      return { ...identity(), scale: 0.3 + 0.7 * p };
    case "drop":
      return { ...identity(), opacity: p, dyPct: -(1 - p) * 120 };
    case "skew-left":
      return { ...identity(), skewDeg: -20 * (1 - p) };
    case "skew-right":
      return { ...identity(), skewDeg: 20 * (1 - p) };
    case "roll":
      return { ...identity(), rotateDeg: -360 * (1 - p), dxPct: (1 - p) * 40 };
    case "spin":
      return { ...identity(), rotateDeg: -720 * (1 - p), scale: Math.max(0.02, p) };
    default:
      return identity();
  }
}

/** Progression (0..1) d'une animation individuelle, easing appliqué. Factorisé pour être
 * réutilisé par `resolveTextReveal` (typewriter/word-reveal/line-reveal). */
function animationProgress(anim: Animation, localElementTime: number, activeDuration: number): number {
  const duration = Math.max(0.01, anim.duration);
  let raw: number;
  if (anim.direction === "in") {
    raw = localElementTime / duration;
  } else {
    const windowStart = activeDuration - duration;
    raw = (localElementTime - windowStart) / duration;
  }
  const eased = applyEase(Math.min(1, Math.max(0, raw)), anim.easing);
  const progress = anim.direction === "in" ? eased : 1 - eased;
  // En dehors de la fenêtre d'animation, l'élément reste dans son état final (posé).
  return anim.direction === "in"
    ? localElementTime >= duration
      ? 1
      : progress
    : localElementTime <= activeDuration - duration
      ? 1
      : progress;
}

/**
 * @param localElementTime temps écoulé depuis `el.start_time` (peut être négatif si pas encore actif).
 * @param activeDuration durée totale d'activité de l'élément dans la composition.
 */
export function resolveElementAnimations(
  animations: Animation[],
  localElementTime: number,
  activeDuration: number,
): ResolvedTransform {
  const acc = identity();
  for (const anim of animations) {
    const clampedProgress = animationProgress(anim, localElementTime, activeDuration);
    const shape = shapeFor(anim.animation_type, clampedProgress);
    const opacityFactor =
      anim.with_fade ||
      anim.animation_type === "fade" ||
      anim.animation_type === "drop" ||
      anim.animation_type.startsWith("fade-")
        ? shape.opacity
        : 1;

    acc.opacity *= opacityFactor;
    acc.dxPct += shape.dxPct;
    acc.dyPct += shape.dyPct;
    acc.scale *= shape.scale;
    acc.rotateDeg += shape.rotateDeg;
    acc.skewDeg += shape.skewDeg;
    acc.blurPx = Math.max(acc.blurPx, shape.blurPx);
  }
  return acc;
}

export function transformToCss(t: ResolvedTransform): { transform: string; filter: string; opacity: number } {
  const parts: string[] = [];
  if (t.dxPct || t.dyPct) parts.push(`translate(${t.dxPct}%, ${t.dyPct}%)`);
  if (t.scale !== 1) parts.push(`scale(${t.scale})`);
  if (t.rotateDeg) parts.push(`rotate(${t.rotateDeg}deg)`);
  if (t.skewDeg) parts.push(`skew(${t.skewDeg}deg)`);
  return {
    transform: parts.join(" "),
    filter: t.blurPx ? `blur(${t.blurPx}px)` : "",
    opacity: t.opacity,
  };
}

/**
 * Animation de révélation de texte (typewriter/word-reveal/line-reveal), réservée au texte et
 * non exprimable via `ResolvedTransform`. Retourne le premier type de révélation trouvé parmi
 * les animations de l'élément, avec sa progression (0..1). Miroir de `resolve_text_reveal` (Rust).
 */
export function resolveTextReveal(
  animations: Animation[],
  localElementTime: number,
  activeDuration: number,
): { type: "typewriter" | "word-reveal" | "line-reveal"; progress: number } | null {
  for (const anim of animations) {
    if (
      anim.animation_type === "typewriter" ||
      anim.animation_type === "word-reveal" ||
      anim.animation_type === "line-reveal"
    ) {
      return { type: anim.animation_type, progress: animationProgress(anim, localElementTime, activeDuration) };
    }
  }
  return null;
}

/**
 * Applique une révélation de texte au contenu affiché. `line-reveal` est approximé en ne
 * révélant que les sauts de ligne explicites du contenu (pas le retour à la ligne automatique
 * du navigateur, qui dépend de la mise en page réelle — connu comme une divergence mineure
 * avec le rendu natif à l'export, voir `raster::draw_text` côté Rust).
 */
export function applyTextReveal(
  content: string,
  reveal: { type: "typewriter" | "word-reveal" | "line-reveal"; progress: number } | null,
): string {
  if (!reveal) return content;
  const { type, progress } = reveal;
  if (type === "typewriter") {
    const chars = Array.from(content);
    return chars.slice(0, Math.round(chars.length * progress)).join("");
  }
  if (type === "word-reveal") {
    const words = content.split(/\s+/).filter(Boolean);
    return words.slice(0, Math.round(words.length * progress)).join(" ");
  }
  const lines = content.split("\n");
  return lines.slice(0, Math.round(lines.length * progress)).join("\n");
}

/** Transitions de composition (fondu-enchaîné entre scènes), même principe simplifié que les animations d'élément. */
function transitionShape(type: TransitionType, progress: number): ResolvedTransform {
  switch (type) {
    case "fade":
      return { ...identity(), opacity: progress };
    case "slide-left":
      return { ...identity(), opacity: 1, dxPct: (1 - progress) * 100 };
    case "slide-right":
      return { ...identity(), opacity: 1, dxPct: -(1 - progress) * 100 };
    case "slide-up":
      return { ...identity(), opacity: 1, dyPct: (1 - progress) * 100 };
    case "slide-down":
      return { ...identity(), opacity: 1, dyPct: -(1 - progress) * 100 };
    case "zoom":
      return { ...identity(), opacity: progress, scale: 0.85 + 0.15 * progress };
    case "blur":
      return { ...identity(), opacity: progress, blurPx: (1 - progress) * 20 };
    case "flip-h":
    case "flip-v":
      return { ...identity(), opacity: progress, scale: Math.max(0.02, progress) };
    case "rotate-cw":
      return { ...identity(), opacity: progress, rotateDeg: 360 * (1 - progress) };
    case "rotate-ccw":
      return { ...identity(), opacity: progress, rotateDeg: -360 * (1 - progress) };
    default:
      // Les wipes ne sont pas exprimables via une transform affine : voir
      // `resolveCompositionWipeClip`, qui calcule un `clip-path` CSS séparé.
      return identity();
  }
}

export function resolveCompositionTransition(
  transition: Transition | null,
  kind: "in" | "out",
  localCompTime: number,
  compDuration: number,
): ResolvedTransform {
  if (!transition) return identity();
  const duration = Math.max(0.01, transition.duration);
  let raw: number;
  if (kind === "in") {
    raw = localCompTime / duration;
    if (localCompTime >= duration) return identity();
  } else {
    const windowStart = compDuration - duration;
    raw = (localCompTime - windowStart) / duration;
    if (localCompTime <= windowStart) return identity();
  }
  const eased = applyEase(Math.min(1, Math.max(0, raw)), transition.easing);
  const progress = kind === "in" ? eased : 1 - eased;
  return transitionShape(transition.transition_type, progress);
}

/** Progression (0..1) d'un wipe actif (entrée ou sortie), si la transition en est un. Miroir
 * de `resolve_wipe` (Rust, `animate.rs`) — exporté pour le test de parité croisée
 * (`animateGolden.test.ts`), sinon utilisé uniquement en interne par `resolveCompositionWipeClip`. */
export function resolveWipeProgress(
  transition: Transition | null,
  kind: "in" | "out",
  localCompTime: number,
  compDuration: number,
): { type: TransitionType; progress: number } | null {
  if (!transition || !transition.transition_type.startsWith("wipe-")) return null;
  const duration = Math.max(0.01, transition.duration);
  let raw: number;
  if (kind === "in") {
    if (localCompTime >= duration) return null;
    raw = localCompTime / duration;
  } else {
    const windowStart = compDuration - duration;
    if (localCompTime <= windowStart) return null;
    raw = (localCompTime - windowStart) / duration;
  }
  const eased = applyEase(Math.min(1, Math.max(0, raw)), transition.easing);
  const progress = kind === "in" ? eased : 1 - eased;
  return { type: transition.transition_type, progress };
}

/**
 * `clip-path` CSS pour la transition de composition active, si c'est un wipe (balayage à bord
 * dur) — non exprimable via une transform affine, contrairement aux autres transitions.
 * Miroir de `wipe_rect` (Rust, `raster.rs`).
 */
export function resolveCompositionWipeClip(
  transitionIn: Transition | null,
  transitionOut: Transition | null,
  localCompTime: number,
  compDuration: number,
): string {
  const wipe =
    resolveWipeProgress(transitionOut, "out", localCompTime, compDuration) ??
    resolveWipeProgress(transitionIn, "in", localCompTime, compDuration);
  if (!wipe) return "";
  const pct = Math.min(1, Math.max(0, wipe.progress)) * 100;
  const hidden = 100 - pct;
  switch (wipe.type) {
    case "wipe-right":
      return `inset(0 ${hidden}% 0 0)`;
    case "wipe-left":
      return `inset(0 0 0 ${hidden}%)`;
    case "wipe-down":
      return `inset(0 0 ${hidden}% 0)`;
    case "wipe-up":
      return `inset(${hidden}% 0 0 0)`;
    default:
      return "";
  }
}

/** Ken Burns : transform continu appliqué au média sur toute sa durée active (pas in/out). */
export function resolveImagePan(pan: ImagePan | null, localElementTime: number, activeDuration: number): string {
  if (!pan) return "";
  const progress = Math.min(1, Math.max(0, activeDuration > 0 ? localElementTime / activeDuration : 0));
  const i = pan.intensity;
  switch (pan.pan_type) {
    case "zoomIn":
      return `scale(${1 + i * 0.1 + i * 0.1 * progress})`;
    case "zoomOut":
      return `scale(${1 + i * 0.2 - i * 0.1 * progress})`;
    case "panLeft":
      return `scale(${1 + i * 0.15}) translateX(${i * 8 * (1 - 2 * progress)}%)`;
    case "panRight":
      return `scale(${1 + i * 0.15}) translateX(${-i * 8 * (1 - 2 * progress)}%)`;
    case "panUp":
      return `scale(${1 + i * 0.15}) translateY(${i * 8 * (1 - 2 * progress)}%)`;
    case "panDown":
      return `scale(${1 + i * 0.15}) translateY(${-i * 8 * (1 - 2 * progress)}%)`;
    default:
      return "";
  }
}
