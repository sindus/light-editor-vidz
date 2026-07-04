import { describe, expect, it } from "vitest";
import { COALESCE_WINDOW_MS, shouldCoalesce } from "./history";

describe("shouldCoalesce", () => {
  it("fusionne deux mutations rapprochées portant la même clé", () => {
    expect(shouldCoalesce({ key: "el:1:x,y", time: 1000 }, "el:1:x,y", 1200)).toBe(true);
  });

  it("ne fusionne pas quand la clé diffère", () => {
    expect(shouldCoalesce({ key: "el:1:x,y", time: 1000 }, "el:2:x,y", 1200)).toBe(false);
    expect(shouldCoalesce({ key: "el:1:x,y", time: 1000 }, "el:1:volume", 1200)).toBe(false);
  });

  it("ne fusionne pas une mutation sans clé (action discrète)", () => {
    expect(shouldCoalesce({ key: "el:1:x,y", time: 1000 }, undefined, 1200)).toBe(false);
    // Une action discrète ne doit pas non plus servir de base de fusion à la suivante.
    expect(shouldCoalesce({ key: null, time: 1000 }, undefined, 1200)).toBe(false);
  });

  it("ne fusionne plus au-delà de la fenêtre temporelle", () => {
    expect(shouldCoalesce({ key: "a", time: 1000 }, "a", 1000 + COALESCE_WINDOW_MS + 1)).toBe(false);
  });
});
