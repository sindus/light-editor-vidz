import { describe, expect, it } from "vitest";
import fixture from "../../fixtures/animation-golden.json";
import type { Animation } from "../bindings/Animation";
import type { Easing } from "../bindings/Easing";
import type { Transition } from "../bindings/Transition";
import { applyEase, resolveCompositionTransition, resolveElementAnimations, resolveWipeProgress } from "./animate";

/**
 * `animate.ts` est un port TS assumé de `scene-core::animate` (Rust) — pas de pont wasm sur ce
 * chemin chaud, voir la doc de `crates/scene-core/src/animate.rs`. Ces tests valident les deux
 * implémentations contre la même fixture de référence (`fixtures/animation-golden.json`,
 * générée par `crates/scene-core/tests/golden_fixture.rs`) pour détecter toute divergence.
 */
describe("animate.ts golden parity with scene-core::animate (Rust)", () => {
  it("applyEase matches apply_ease for every easing/t case", () => {
    for (const c of fixture.easing_cases) {
      expect(applyEase(c.t, c.easing as Easing)).toBeCloseTo(c.expected, 9);
    }
  });

  it("resolveElementAnimations matches resolve_element_animations for every case", () => {
    for (const c of fixture.element_animation_cases) {
      const result = resolveElementAnimations(c.animations as Animation[], c.local_element_time, c.active_duration);
      expect(result.opacity).toBeCloseTo(c.expected.opacity, 9);
      expect(result.dxPct).toBeCloseTo(c.expected.dx_pct, 9);
      expect(result.dyPct).toBeCloseTo(c.expected.dy_pct, 9);
      expect(result.scale).toBeCloseTo(c.expected.scale, 9);
      expect(result.rotateDeg).toBeCloseTo(c.expected.rotate_deg, 9);
      expect(result.skewDeg).toBeCloseTo(c.expected.skew_deg, 9);
      expect(result.blurPx).toBeCloseTo(c.expected.blur_px, 9);
    }
  });

  it("resolveCompositionTransition matches resolve_composition_transition for every case", () => {
    for (const c of fixture.composition_transition_cases) {
      const result = resolveCompositionTransition(
        c.transition as Transition,
        c.kind as "in" | "out",
        c.local_comp_time,
        c.comp_duration,
      );
      expect(result.opacity).toBeCloseTo(c.expected.opacity, 9);
      expect(result.dxPct).toBeCloseTo(c.expected.dx_pct, 9);
      expect(result.dyPct).toBeCloseTo(c.expected.dy_pct, 9);
      expect(result.scale).toBeCloseTo(c.expected.scale, 9);
      expect(result.rotateDeg).toBeCloseTo(c.expected.rotate_deg, 9);
      expect(result.skewDeg).toBeCloseTo(c.expected.skew_deg, 9);
      expect(result.blurPx).toBeCloseTo(c.expected.blur_px, 9);
    }
  });

  it("resolveWipeProgress matches resolve_wipe for every case", () => {
    for (const c of fixture.wipe_cases) {
      const result = resolveWipeProgress(
        c.transition as Transition,
        c.kind as "in" | "out",
        c.local_comp_time,
        c.comp_duration,
      );
      if (c.expected === null) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result?.type).toBe(c.expected.type);
        expect(result?.progress).toBeCloseTo(c.expected.progress, 9);
      }
    }
  });
});
