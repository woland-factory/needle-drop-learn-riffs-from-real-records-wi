import { describe, it, expect, afterEach } from "vitest";
import { WebMicRecorder, mapMicError, frameRms, FakeMicRecorder } from "../../src/audio/mic";

const original = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

afterEach(() => {
  if (original) Object.defineProperty(navigator, "mediaDevices", original);
  else delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
});

function stubMediaDevices(getUserMedia: unknown) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
}

describe("mapMicError", () => {
  it("maps NotAllowedError and SecurityError to denied", () => {
    expect(mapMicError({ name: "NotAllowedError" })).toBe("denied");
    expect(mapMicError({ name: "SecurityError" })).toBe("denied");
  });
  it("maps a missing device to unavailable", () => {
    expect(mapMicError({ name: "NotFoundError" })).toBe("unavailable");
    expect(mapMicError({})).toBe("unavailable");
  });
});

describe("frameRms", () => {
  it("is zero for silence and positive for a signal", () => {
    expect(frameRms(new Float32Array(64))).toBe(0);
    expect(frameRms(Float32Array.from({ length: 64 }, () => 0.5))).toBeCloseTo(0.5, 6);
  });
});

describe("WebMicRecorder.requestPermission", () => {
  it("resolves granted when getUserMedia succeeds", async () => {
    stubMediaDevices(async () => ({ getTracks: () => [] }));
    expect(await new WebMicRecorder().requestPermission()).toBe("granted");
  });

  it("resolves denied on NotAllowedError", async () => {
    stubMediaDevices(async () => {
      throw Object.assign(new Error("no"), { name: "NotAllowedError" });
    });
    expect(await new WebMicRecorder().requestPermission()).toBe("denied");
  });

  it("resolves unavailable when there is no device", async () => {
    stubMediaDevices(async () => {
      throw Object.assign(new Error("none"), { name: "NotFoundError" });
    });
    expect(await new WebMicRecorder().requestPermission()).toBe("unavailable");
  });

  it("resolves unavailable when mediaDevices is missing", async () => {
    delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
    expect(await new WebMicRecorder().requestPermission()).toBe("unavailable");
  });
});

describe("FakeMicRecorder", () => {
  it("returns its preset take and reports a level", async () => {
    const take = { samples: new Float32Array([0.1, 0.2]), sampleRate: 22050 };
    const rec = new FakeMicRecorder(take);
    let level = 0;
    const got = await rec.record(1, (rms) => (level = rms));
    expect(got).toBe(take);
    expect(level).toBeGreaterThan(0);
    expect(rec.records).toBe(1);
  });
});
