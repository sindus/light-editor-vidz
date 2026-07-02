import { describe, expect, it } from "vitest";
import { parseLegacyProjectJSON } from "./legacyImport";

describe("parseLegacyProjectJSON", () => {
  it("throws on invalid input", () => {
    expect(() => parseLegacyProjectJSON(null)).toThrow();
    expect(() => parseLegacyProjectJSON("not an object")).toThrow();
  });

  it("falls back to sensible defaults for a minimal legacy project", () => {
    const result = parseLegacyProjectJSON({});
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.compositions).toHaveLength(1);
  });

  it("converts a text element from top/left anchor pixels to x/y percentages", () => {
    const legacy = {
      name: "Legacy video",
      width: 1000,
      height: 500,
      duration: 5,
      compositions: [
        {
          id: "c1",
          name: "Scene 1",
          startTime: 0,
          duration: 5,
          elements: [
            {
              id: "t1",
              type: "text",
              // Ancre centrée : top/left pointent le centre de l'élément.
              top: 250,
              left: 500,
              width: 200,
              height: 100,
              topOrigin: "center",
              leftOrigin: "center",
              content: "Hello",
              fontSize: 50,
            },
          ],
        },
      ],
    };

    const result = parseLegacyProjectJSON(legacy);
    expect(result.name).toBe("Legacy video");
    const comp = result.compositions[0];
    expect(comp.elements).toHaveLength(1);
    const el = comp.elements[0];
    expect(el.type).toBe("text");
    // Coin haut-gauche attendu : (500 - 200/2, 250 - 100/2) = (400, 200) px -> 40%/40% de 1000x500.
    expect(el.x).toBeCloseTo(40);
    expect(el.y).toBeCloseTo(40);
    expect(el.width).toBeCloseTo(20);
    expect(el.height).toBeCloseTo(20);
    if (el.type === "text") {
      // fontSize 50px sur une largeur de canvas de 1000px -> 5 cqw.
      expect(el.font_size).toBeCloseTo(5);
      expect(el.content).toBe("Hello");
    }
  });

  it("converts GSAP-style dotted easing names to our kebab-case schema", () => {
    const legacy = {
      width: 1000,
      height: 500,
      duration: 5,
      compositions: [
        {
          id: "c1",
          duration: 5,
          elements: [
            {
              id: "t1",
              type: "text",
              top: 0,
              left: 0,
              width: 100,
              height: 100,
              content: "x",
              animations: [{ type: "fade", direction: "in", duration: 1, easing: "power2.inOut" }],
            },
          ],
        },
      ],
    };

    const result = parseLegacyProjectJSON(legacy);
    const el = result.compositions[0].elements[0];
    expect(el.animations[0].easing).toBe("power2-in-out");
  });

  it("drops elements with an unknown type instead of throwing", () => {
    const legacy = {
      width: 1000,
      height: 500,
      duration: 5,
      compositions: [
        {
          id: "c1",
          duration: 5,
          elements: [
            { id: "x", type: "unknown-type" },
            { id: "t1", type: "shape", shapeType: "star" },
          ],
        },
      ],
    };

    const result = parseLegacyProjectJSON(legacy);
    expect(result.compositions[0].elements).toHaveLength(1);
    expect(result.compositions[0].elements[0].type).toBe("shape");
  });
});
