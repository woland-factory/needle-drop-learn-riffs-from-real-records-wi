import { describe, it, expect } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IdbRiffStore, isValidRecord, type NewRiff } from "../../src/book/store";
import { DAY_MS } from "../../src/book/schedule";

const NOW = 1_750_000_000_000;

function newRiff(overrides: Partial<NewRiff> = {}): NewRiff {
  const clip = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]); // arbitrary bytes
  return {
    title: "my riff",
    sourceName: "my riff.wav",
    clipWav: clip.buffer,
    loopRegion: { startSec: 4, endSec: 8, bars: 2, tempoBpm: 96, speed: 0.75 },
    notes: [
      { midi: 45, startSec: 0, durSec: 0.5, confidence: 0.9, edited: false },
      { midi: 47, startSec: 0.5, durSec: 0.5, confidence: 1, edited: true },
    ],
    stemUsed: "mix",
    ...overrides,
  };
}

describe("IdbRiffStore", () => {
  it("adds a full record via the schedule and lists it back, clip bytes included", async () => {
    const store = new IdbRiffStore(new IDBFactory());
    const added = await store.add(newRiff(), 100, NOW);
    expect(added.v).toBe(1);
    expect(added.id).toBeTruthy();
    expect(added.streak).toBe(1);
    expect(added.bestScore).toBe(100);
    expect(added.dateFirstNailed).toBe(NOW);
    expect(added.reviewDueDate).toBe(NOW + DAY_MS);

    const listed = await store.list();
    expect(listed).toHaveLength(1);
    const rec = listed[0];
    expect(rec.title).toBe("my riff");
    expect(rec.stemUsed).toBe("mix");
    expect(rec.notes).toHaveLength(2);
    expect(rec.loopRegion.tempoBpm).toBe(96);
    expect(Array.from(new Uint8Array(rec.clipWav))).toEqual([82, 73, 70, 70, 1, 2, 3, 4]);
    store.dispose();
  });

  it("persists across store instances on the same database (reload at the unit level)", async () => {
    const factory = new IDBFactory();
    const first = new IdbRiffStore(factory);
    const added = await first.add(newRiff(), 90, NOW);
    first.dispose();

    const second = new IdbRiffStore(factory);
    const listed = await second.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(added.id);
    expect(Array.from(new Uint8Array(listed[0].clipWav))).toEqual(
      Array.from(new Uint8Array(added.clipWav)),
    );
    const got = await second.get(added.id);
    expect(got?.bestScore).toBe(90);
    second.dispose();
  });

  it("recordPass applies the schedule atomically", async () => {
    const store = new IdbRiffStore(new IDBFactory());
    const added = await store.add(newRiff(), 80, NOW);
    const updated = await store.recordPass(added.id, 95, NOW + 2 * DAY_MS);
    expect(updated.streak).toBe(2);
    expect(updated.bestScore).toBe(95);
    expect(updated.lastPracticed).toBe(NOW + 2 * DAY_MS);
    expect(updated.reviewDueDate).toBe(NOW + 2 * DAY_MS + 3 * DAY_MS);

    const stored = await store.get(added.id);
    expect(stored?.streak).toBe(2);
    expect(stored?.bestScore).toBe(95);
    store.dispose();
  });

  it("recordPass rejects with an Error for a missing record", async () => {
    const store = new IdbRiffStore(new IDBFactory());
    await expect(store.recordPass("ghost", 100, NOW)).rejects.toBeInstanceOf(Error);
    store.dispose();
  });

  it("remove deletes the record so nothing remains, clip included", async () => {
    const store = new IdbRiffStore(new IDBFactory());
    const a = await store.add(newRiff(), 100, NOW);
    const b = await store.add(newRiff({ title: "second" }), 100, NOW);
    await store.remove(a.id);
    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(b.id);
    expect(await store.get(a.id)).toBeUndefined();
    store.dispose();
  });

  it("skips a malformed record on read instead of throwing", async () => {
    const factory = new IDBFactory();
    const store = new IdbRiffStore(new IDBFactory());
    // isValidRecord is the read boundary; prove its edges directly.
    expect(isValidRecord(null)).toBe(false);
    expect(isValidRecord({ v: 2, id: "x" })).toBe(false);
    const good = await new IdbRiffStore(factory).add(newRiff(), 100, NOW);
    expect(isValidRecord(good)).toBe(true);
    expect(isValidRecord({ ...good, clipWav: "not-bytes" })).toBe(false);
    expect(isValidRecord({ ...good, streak: Number.NaN })).toBe(false);
    store.dispose();
  });

  it("lists only valid records when a foreign row sits in the store", async () => {
    const factory = new IDBFactory();
    const store = new IdbRiffStore(factory);
    await store.add(newRiff(), 100, NOW);
    // Write a malformed row through a second raw connection.
    await new Promise<void>((resolve, reject) => {
      const req = factory.open("needle-drop", 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("riffs", "readwrite");
        tx.objectStore("riffs").put({ id: "junk", v: 99 });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(new Error("junk write failed"));
      };
      req.onerror = () => reject(new Error("open failed"));
    });
    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).not.toBe("junk");
    store.dispose();
  });
});
