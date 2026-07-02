import { describe, expect, it } from "vitest";
import {
  applyEase,
  resolveCompositionTransition,
  resolveElementAnimations,
  resolveImagePan,
  transformToCss,
} from "./animate";
import type { Animation } from "../bindings/Animation";
import type { Transition } from "../bindings/Transition";

describe("applyEase", () => {
  it("returns the input unchanged for linear easing", () => {
    expect(applyEase(0.3, "linear")).toBeCloseTo(0.3);
  });

  it("clamps input to [0, 1]", () => {
    expect(applyEase(-1, "linear")).toBe(0);
    expect(applyEase(2, "linear")).toBe(1);
  });

  it("always maps 0 to 0 and 1 to 1 regardless of curve", () => {
    const easings = ["power1-in", "power1-out", "power2-in-out", "power3-in", "bounce"] as const;
    for (const easing of easings) {
      expect(applyEase(0, easing)).toBeCloseTo(0, 5);
      expect(applyEase(1, easing)).toBeCloseTo(1, 5);
    }
  });
});

describe("resolveElementAnimations", () => {
  it("returns identity transform when there are no animations", () => {
    const result = resolveElementAnimations([], 1, 5);
    expect(result).toEqual({ opacity: 1, dxPct: 0, dyPct: 0, scale: 1, rotateDeg: 0, blurPx: 0 });
  });

  it("fades in from 0 to 1 opacity over the animation duration", () => {
    const anims: Animation[] = [
      { animation_type: "fade", direction: "in", duration: 1, easing: "linear", with_fade: false },
    ];
    expect(resolveElementAnimations(anims, 0, 5).opacity).toBeCloseTo(0, 1);
    expect(resolveElementAnimations(anims, 1, 5).opacity).toBeCloseTo(1, 1);
    // Après la fin de l'animation, l'élément reste dans son état final (posé).
    expect(resolveElementAnimations(anims, 3, 5).opacity).toBeCloseTo(1, 1);
  });

  it("fades out during the last `duration` seconds of the active window", () => {
    const anims: Animation[] = [
      { animation_type: "fade", direction: "out", duration: 1, easing: "linear", with_fade: false },
    ];
    // Bien avant la fin : entièrement visible.
    expect(resolveElementAnimations(anims, 1, 5).opacity).toBeCloseTo(1, 1);
    // À la toute fin : quasi invisible.
    expect(resolveElementAnimations(anims, 5, 5).opacity).toBeCloseTo(0, 1);
  });

  it("composes multiple simultaneous animations instead of the last one winning", () => {
    const anims: Animation[] = [
      { animation_type: "slide-left", direction: "in", duration: 1, easing: "linear", with_fade: false },
      { animation_type: "zoom-in", direction: "in", duration: 1, easing: "linear", with_fade: false },
    ];
    const result = resolveElementAnimations(anims, 1, 5);
    // Les deux effets doivent être présents (translation ET échelle), pas seulement le dernier.
    expect(result.dxPct).toBeCloseTo(0, 1);
    expect(result.scale).toBeCloseTo(1, 1);
    const midway = resolveElementAnimations(anims, 0, 5);
    expect(midway.dxPct).not.toBe(0);
    expect(midway.scale).not.toBe(1);
  });
});

describe("transformToCss", () => {
  it("omits transform/filter properties when there is nothing to apply", () => {
    const css = transformToCss({ opacity: 1, dxPct: 0, dyPct: 0, scale: 1, rotateDeg: 0, blurPx: 0 });
    expect(css.transform).toBe("");
    expect(css.filter).toBe("");
    expect(css.opacity).toBe(1);
  });

  it("builds a translate/scale/rotate transform string", () => {
    const css = transformToCss({ opacity: 0.5, dxPct: 10, dyPct: -5, scale: 1.2, rotateDeg: 45, blurPx: 3 });
    expect(css.transform).toContain("translate(10%, -5%)");
    expect(css.transform).toContain("scale(1.2)");
    expect(css.transform).toContain("rotate(45deg)");
    expect(css.filter).toBe("blur(3px)");
  });
});

describe("resolveCompositionTransition", () => {
  it("returns identity when there is no transition configured", () => {
    expect(resolveCompositionTransition(null, "in", 0, 5)).toEqual({
      opacity: 1,
      dxPct: 0,
      dyPct: 0,
      scale: 1,
      rotateDeg: 0,
      blurPx: 0,
    });
  });

  it("fades a scene in over the transition duration", () => {
    const transition: Transition = { transition_type: "fade", duration: 1, easing: "linear" };
    expect(resolveCompositionTransition(transition, "in", 0, 5).opacity).toBeCloseTo(0, 1);
    expect(resolveCompositionTransition(transition, "in", 1, 5).opacity).toBeCloseTo(1, 1);
  });
});

describe("resolveImagePan (Ken Burns)", () => {
  it("returns no transform when there is no pan configured", () => {
    expect(resolveImagePan(null, 0, 5)).toBe("");
  });

  it("produces a scale transform for zoom-in", () => {
    const css = resolveImagePan({ pan_type: "zoomIn", intensity: 1 }, 0, 5);
    expect(css).toContain("scale(");
  });
});
