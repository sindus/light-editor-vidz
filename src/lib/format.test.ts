import { describe, expect, it } from "vitest";
import { formatTimecode } from "./format";

describe("formatTimecode", () => {
  it("formats zero as 00:00:00", () => {
    expect(formatTimecode(0, 30)).toBe("00:00:00");
  });

  it("formats minutes, seconds and frames", () => {
    // 65.4s at 30fps = 1min 5s 12frames
    expect(formatTimecode(65.4, 30)).toBe("01:05:12");
  });

  it("falls back to 30fps when fps is zero or negative", () => {
    expect(formatTimecode(1, 0)).toBe(formatTimecode(1, 30));
    expect(formatTimecode(1, -5)).toBe(formatTimecode(1, 30));
  });

  it("never produces a frame count equal to or above fps", () => {
    const result = formatTimecode(0.999999, 30);
    const frames = Number(result.split(":")[2]);
    expect(frames).toBeLessThan(30);
  });
});
