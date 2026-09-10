import { describe, expect, it, vi } from "vitest";
import { LoopPlayer, clampRate } from "../../src/audio/loop-player";

describe("clampRate", () => {
  it("keeps rates within [0.5, 1.0]", () => {
    expect(clampRate(0.75)).toBe(0.75);
    expect(clampRate(0.2)).toBe(0.5);
    expect(clampRate(2)).toBe(1);
  });

  it("falls back to full speed for NaN", () => {
    expect(clampRate(Number.NaN)).toBe(1);
  });
});

interface FakeSource {
  buffer: unknown;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  playbackRate: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

function makeCtx() {
  const sources: FakeSource[] = [];
  const ctx = {
    state: "running" as string,
    resume: vi.fn(async () => {
      ctx.state = "running";
    }),
    createGain: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
    createBufferSource: (): FakeSource => {
      const s: FakeSource = {
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        playbackRate: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      sources.push(s);
      return s;
    },
    destination: {},
  };
  return { ctx, sources };
}

const buffer = { duration: 10 } as unknown as AudioBuffer;

describe("LoopPlayer", () => {
  it("loops the region with loop=true and correct bounds", async () => {
    const { ctx, sources } = makeCtx();
    const player = new LoopPlayer(ctx as unknown as AudioContext, buffer);
    player.setRegion({ startSec: 2, endSec: 6 });
    await player.play();
    const src = sources[0];
    expect(src.loop).toBe(true);
    expect(src.loopStart).toBe(2);
    expect(src.loopEnd).toBe(6);
    expect(src.start).toHaveBeenCalledWith(0, 2);
    expect(player.playing).toBe(true);
  });

  it("clamps and applies playbackRate to the running source", async () => {
    const { ctx, sources } = makeCtx();
    const player = new LoopPlayer(ctx as unknown as AudioContext, buffer);
    await player.play();
    player.setRate(0.6);
    expect(sources[0].playbackRate.value).toBe(0.6);
    player.setRate(0.1);
    expect(sources[0].playbackRate.value).toBe(0.5);
  });

  it("updates loop bounds live without recreating the source (no gap)", async () => {
    const { ctx, sources } = makeCtx();
    const player = new LoopPlayer(ctx as unknown as AudioContext, buffer);
    await player.play();
    expect(sources).toHaveLength(1);
    player.setRegion({ startSec: 3, endSec: 5 });
    // Same source is mutated in place, so the loop never stops.
    expect(sources).toHaveLength(1);
    expect(sources[0].loopStart).toBe(3);
    expect(sources[0].loopEnd).toBe(5);
  });

  it("resumes a suspended context on play", async () => {
    const { ctx } = makeCtx();
    ctx.state = "suspended";
    const player = new LoopPlayer(ctx as unknown as AudioContext, buffer);
    await player.play();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it("stops and clears the source", async () => {
    const { ctx, sources } = makeCtx();
    const player = new LoopPlayer(ctx as unknown as AudioContext, buffer);
    await player.play();
    player.stop();
    expect(sources[0].stop).toHaveBeenCalled();
    expect(player.playing).toBe(false);
  });
});
