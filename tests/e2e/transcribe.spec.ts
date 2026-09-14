import { test, expect, type Request } from "@playwright/test";

// Real Basic Pitch inference in real Chromium, on the bundled bass sample.
// Mobile viewport so the same run also proves the chart panel fits 390px.
test.use({ viewport: { width: 390, height: 844 } });

const REGION_LEN = 4; // 2 bars at 120 BPM on the 4.8s sample

test("transcribes the sample in-browser into a monophonic, in-region chart", async ({
  page,
}) => {
  const requests: Request[] = [];
  page.on("request", (req) => requests.push(req));

  await page.goto("/");
  await page.getByRole("button", { name: /play a sample loop/i }).click();

  const findBtn = page.getByRole("button", { name: /find the notes/i });
  await expect(findBtn).toBeVisible();
  await findBtn.click();

  // The chart appears once the real model finishes. Give the shared host room.
  const firstNote = page.locator("[data-note]").first();
  await expect(firstNote).toBeVisible({ timeout: 90_000 });

  // The scope of belief is stated plainly.
  await expect(page.getByText(/reads one note at a time/i)).toBeVisible();

  // Read the detected notes and prove the monophonic, in-region invariant.
  const notes = await page.locator("[data-note]").evaluateAll((els) =>
    els.map((el) => ({
      start: Number(el.getAttribute("data-start")),
      dur: Number(el.getAttribute("data-dur")),
    })),
  );
  expect(notes.length).toBeGreaterThanOrEqual(1);
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    expect(sorted[i].start).toBeGreaterThanOrEqual(-1e-6);
    expect(sorted[i].start + sorted[i].dur).toBeLessThanOrEqual(REGION_LEN + 1e-3);
    if (i > 0) {
      // No overlap: each note ends no later than the next begins.
      expect(sorted[i - 1].start + sorted[i - 1].dur).toBeLessThanOrEqual(
        sorted[i].start + 1e-6,
      );
    }
  }

  // No audio and no model request left the origin: everything is same-host.
  const host = new URL(page.url()).host;
  for (const req of requests) {
    expect(new URL(req.url()).host, `external request to ${req.url()}`).toBe(host);
    expect(req.postData(), `unexpected body on ${req.url()}`).toBeNull();
  }

  // The chart panel fits a 390px viewport with no horizontal scroll.
  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noOverflow).toBe(true);

  // Audition over the record: starts, then Stop halts it cleanly.
  const chart = page.locator("section.chart");
  const playWith = chart.getByRole("button", { name: /play with the song/i });
  await expect(playWith).toBeVisible();
  await playWith.click();
  const stop = chart.getByRole("button", { name: /^stop$/i });
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(
    chart.getByRole("button", { name: /play with the song/i }),
  ).toBeVisible();
});
