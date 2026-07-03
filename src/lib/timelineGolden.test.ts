import { describe, expect, it } from "vitest";
import fixture from "../../fixtures/animation-golden.json";
import type { Composition } from "../bindings/Composition";
import type { Project } from "../bindings/Project";
import { recomputeStartTimes } from "./timeline";

function compFrom(i: number, duration: number, overlapNext: number): Composition {
  return {
    id: `c${i}`,
    name: `c${i}`,
    start_time: 0,
    duration,
    elements: [],
    audio_tracks: [],
    transition_in: null,
    transition_out: null,
    overlap_next: overlapNext,
  };
}

/**
 * `recomputeStartTimes` (TS) est un port assumé de `scene_core::timeline::recompute_start_times`
 * (Rust) — voir la doc de `crates/scene-core/src/animate.rs` pour la justification de ne pas
 * unifier via wasm. Valide les deux implémentations contre la même fixture de référence.
 */
describe("recomputeStartTimes golden parity with scene_core::timeline::recompute_start_times (Rust)", () => {
  it("matches Rust output for every fixture case", () => {
    for (const c of fixture.timeline_cases) {
      const project: Project = {
        name: "golden",
        width: 100,
        height: 100,
        fps: 30,
        duration: 0,
        compositions: c.compositions.map((comp, i) => compFrom(i, comp.duration, comp.overlap_next)),
      };
      const result = recomputeStartTimes(project);
      result.compositions.forEach((comp, i) => {
        expect(comp.start_time).toBeCloseTo(c.expected_start_times[i], 9);
      });
      expect(result.duration).toBeCloseTo(c.expected_project_duration, 9);
    }
  });
});
