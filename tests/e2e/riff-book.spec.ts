import { test, expect, type Page, type Request } from "@playwright/test";
import { readFileSync } from "node:fs";

// The riff-book journey: conquer the sample phrase, save it, survive a reload,
// grow the streak from the book, export, and delete. The mic-device wiring is
// proven in practice.spec.ts; here getUserMedia is stubbed with a Web Audio
// stream that starts the sample riff exactly when the app begins recording, so
// the matched verdict this flow depends on is deterministic, while the real
// capture, pitch-tracking, and grading code still runs on real audio.

async function alignedMic(page: Page) {
  await page.addInitScript(() => {
    let sourceCtx: AudioContext | null = null;
    let dest: MediaStreamAudioDestinationNode | null = null;
    let buffer: AudioBuffer | null = null;
    let lastSrc: AudioBufferSourceNode | null = null;

    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        sourceCtx = new AudioContext();
        const res = await fetch("/sample/riff.wav");
        buffer = await sourceCtx.decodeAudioData(await res.arrayBuffer());
        dest = sourceCtx.createMediaStreamDestination();
        return dest.stream;
      },
    });

    const orig = AudioContext.prototype.createMediaStreamSource;
    AudioContext.prototype.createMediaStreamSource = function (stream) {
      // The recorder pulls from the stream the moment it wires this node, so
      // starting the riff here aligns the take with the phrase's beat 1.
      if (dest && sourceCtx && buffer && stream === dest.stream) {
        try {
          lastSrc?.stop();
        } catch {
          // already stopped
        }
        void sourceCtx.resume();
        const src = sourceCtx.createBufferSource();
        src.buffer = buffer;
        src.connect(dest);
        src.start();
        lastSrc = src;
      }
      return orig.call(this, stream);
    };
  });
}

async function conquerSample(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /play a sample loop/i }).click();
  await page.getByRole("button", { name: /find the notes/i }).click();
  await expect(page.locator("[data-note]").first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: /check my take/i }).click();
  await page.getByRole("button", { name: /turn on mic/i }).click();
  await page.getByRole("button", { name: /^start$/i }).click();
  await expect(page.getByRole("heading", { name: /you played it/i })).toBeVisible({
    timeout: 60_000,
  });
}

test.use({ viewport: { width: 390, height: 844 } });

test("conquer, save, reload, re-practice, export, delete", async ({ page }) => {
  test.setTimeout(300_000);
  await alignedMic(page);
  await conquerSample(page);

  // From here nothing may leave the origin: saving, browsing, exporting.
  const host = new URL(page.url()).host;
  const requests: Request[] = [];
  page.on("request", (req) => requests.push(req));

  // Save the matched pass into the riff-book.
  await page.getByRole("button", { name: /save to riff-book/i }).click();
  await expect(page.getByText(/saved to your riff-book/i)).toBeVisible();

  // The phrase survives a full reload: IndexedDB, not memory.
  await page.reload();
  await page.getByRole("button", { name: "Riff-book" }).click();
  await expect(page.getByRole("heading", { name: /your riff-book/i })).toBeVisible();
  await expect(page.getByText("sample-loop", { exact: true })).toBeVisible();
  await expect(page.getByText(/streak 1/i)).toBeVisible();
  await expect(page.getByText(/first nailed/i)).toBeVisible();

  // The book fits the 390px viewport.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);

  // Re-practice from the book: same cycle against the stored clip and notes.
  await page.getByRole("button", { name: /^practice$/i }).click();
  await page.getByRole("button", { name: /turn on mic/i }).click();
  await page.getByRole("button", { name: /^start$/i }).click();
  await expect(page.getByRole("heading", { name: /you played it/i })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/you still have it\. streak 2\./i)).toBeVisible();

  // Back in the book the streak reads 2.
  await page.getByRole("button", { name: /back to your book/i }).click();
  await expect(page.getByText(/streak 2/i)).toBeVisible();

  // Export downloads one JSON file with notes, metadata, and the clip.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /export book/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("needle-drop-riff-book.json");
  const path = await download.path();
  const book = JSON.parse(readFileSync(path as string, "utf8"));
  expect(book.app).toBe("needle-drop");
  expect(book.exportVersion).toBe(1);
  expect(book.riffs).toHaveLength(1);
  expect(book.riffs[0].title).toBe("sample-loop");
  expect(book.riffs[0].streak).toBe(2);
  expect(book.riffs[0].notes.length).toBeGreaterThan(0);
  expect(book.riffs[0].clipWavBase64.length).toBeGreaterThan(1000);
  expect(Buffer.from(book.riffs[0].clipWavBase64, "base64").subarray(0, 4).toString()).toBe(
    "RIFF",
  );
  await expect(page.getByText(/riff-book exported\./i)).toBeVisible();

  // Nothing left the origin during save, browsing, and export.
  for (const req of requests) {
    expect(new URL(req.url()).host, `external request to ${req.url()}`).toBe(host);
  }

  // Delete asks first, then removes everything; the empty book survives reload.
  await page.getByRole("button", { name: /^delete$/i }).click();
  await expect(page.getByText(/delete this phrase\?/i)).toBeVisible();
  await page.getByRole("button", { name: /^delete$/i }).click();
  await expect(
    page.getByRole("heading", { name: /conquer your first phrase/i }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Riff-book" }).click();
  await expect(
    page.getByRole("heading", { name: /conquer your first phrase/i }),
  ).toBeVisible();
});

test("keep it declines the delete and the loop room survives the round trip", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await alignedMic(page);
  await conquerSample(page);
  await page.getByRole("button", { name: /save to riff-book/i }).click();
  await expect(page.getByText(/saved to your riff-book/i)).toBeVisible();

  // Visit the book and come back: the loaded song and chart are still here.
  await page.getByRole("button", { name: "Riff-book" }).click();
  await expect(page.getByText(/streak 1/i)).toBeVisible();

  // Keep it leaves the phrase alone.
  await page.getByRole("button", { name: /^delete$/i }).click();
  await page.getByRole("button", { name: /keep it/i }).click();
  await expect(page.getByText(/streak 1/i)).toBeVisible();

  await page.getByRole("button", { name: "Loop Room" }).click();
  await expect(page.getByText(/now looping: sample-loop\.wav/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /you played it/i })).toBeVisible();
});
