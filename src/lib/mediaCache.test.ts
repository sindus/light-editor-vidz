import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./commands", () => ({
  readMediaFile: vi.fn(),
}));

import { readMediaFile } from "./commands";
import { acquireMediaObjectUrl, cacheSizeForTests } from "./mediaCache";

const readMediaFileMock = vi.mocked(readMediaFile);
let urlCounter = 0;

beforeEach(() => {
  urlCounter = 0;
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => `blob:mock-${++urlCounter}`),
    revokeObjectURL: vi.fn(),
  });
  readMediaFileMock.mockReset();
  readMediaFileMock.mockResolvedValue(new ArrayBuffer(8));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("acquireMediaObjectUrl", () => {
  it("ne lit le fichier qu'une fois pour deux consommateurs de la même source", async () => {
    const a = acquireMediaObjectUrl("/p", "assets/videos/v.mp4");
    const b = acquireMediaObjectUrl("/p", "assets/videos/v.mp4");
    const [urlA, urlB] = await Promise.all([a.promise, b.promise]);
    expect(urlA).toBe(urlB);
    expect(readMediaFileMock).toHaveBeenCalledTimes(1);
    a.release();
    b.release();
  });

  it("révoque l'URL quand le dernier consommateur la relâche", async () => {
    const a = acquireMediaObjectUrl("/p", "assets/videos/v.mp4");
    const b = acquireMediaObjectUrl("/p", "assets/videos/v.mp4");
    const url = await a.promise;
    a.release();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    b.release();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    expect(cacheSizeForTests()).toBe(0);
    // Un release répété ne doit rien décrémenter de plus.
    b.release();
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledTimes(1);
  });

  it("révoque l'URL si tous les consommateurs sont partis avant la fin du chargement", async () => {
    let resolveRead: (b: ArrayBuffer) => void = () => {};
    readMediaFileMock.mockImplementation(() => new Promise((res) => (resolveRead = res)));
    const a = acquireMediaObjectUrl("/p", "assets/videos/v.mp4");
    a.release();
    resolveRead(new ArrayBuffer(8));
    await a.promise;
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("ne met pas en cache un échec de lecture (nouvelle tentative possible)", async () => {
    readMediaFileMock.mockRejectedValueOnce(new Error("missing"));
    const a = acquireMediaObjectUrl("/p", "assets/videos/v.mp4");
    await expect(a.promise).rejects.toThrow("missing");
    // Laisse le .catch interne purger l'entrée.
    await Promise.resolve();
    const b = acquireMediaObjectUrl("/p", "assets/videos/v.mp4");
    await expect(b.promise).resolves.toMatch(/^blob:mock-/);
    expect(readMediaFileMock).toHaveBeenCalledTimes(2);
    a.release();
    b.release();
  });

  it("des sources différentes ont des entrées distinctes", async () => {
    const a = acquireMediaObjectUrl("/p", "assets/videos/a.mp4");
    const b = acquireMediaObjectUrl("/p", "assets/videos/b.mp4");
    const [urlA, urlB] = await Promise.all([a.promise, b.promise]);
    expect(urlA).not.toBe(urlB);
    a.release();
    b.release();
  });
});
