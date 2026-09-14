import { test, expect, type Request } from "@playwright/test";

// Real getUserMedia in real Chromium, fed by the fake audio device
// (tests/fixtures/capture-sample.wav, wired in playwright.config.ts). This
// proves the mic verdict wiring end to end. The deterministic accuracy proof in
// both directions lives in the Vitest fixture harness.

async function reachChart(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /play a sample loop/i }).click();
  await page.getByRole("button", { name: /find the notes/i }).click();
  // The real model finishes; give the shared host room.
  await expect(page.locator("[data-note]").first()).toBeVisible({ timeout: 90_000 });
}

test.describe("practice with a granted mic", () => {
  test.use({ permissions: ["microphone"], viewport: { width: 390, height: 844 } });

  test("runs the cycle to a verdict, with nothing leaving the origin", async ({ page }) => {
    test.setTimeout(120_000);
    await reachChart(page);

    // Check my take is the one primary action once the chart is ready.
    await page.getByRole("button", { name: /check my take/i }).click();
    await page.getByRole("button", { name: /turn on mic/i }).click();
    const start = page.getByRole("button", { name: /^start$/i });
    await expect(start).toBeVisible();

    // From here, nothing should leave the origin during the pass and grading.
    const host = new URL(page.url()).host;
    const requests: Request[] = [];
    page.on("request", (req) => requests.push(req));

    await start.click();

    // The count-in / reference / recording indicators appear on phase change.
    await expect(
      page.getByText(/count in|here is the phrase|your turn/i).first(),
    ).toBeVisible();

    // The verdict surface appears with a per-note lights row and a score.
    await expect(
      page.getByRole("heading", { name: /you played it|close|i did not catch that/i }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(".verdict-roll [data-note]").first()).toBeVisible();
    await expect(page.locator(".verdict-score")).toBeVisible();

    // No audio and no take left the origin.
    for (const req of requests) {
      expect(new URL(req.url()).host, `external request to ${req.url()}`).toBe(host);
      expect(req.postData(), `unexpected body on ${req.url()}`).toBeNull();
    }

    // The practice panel fits a 390px viewport with no horizontal scroll.
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(noOverflow).toBe(true);
  });
});

test.describe("practice with a denied mic", () => {
  test.use({ permissions: [] });

  test("shows the denied state with a next step, never a dead end", async ({ page }) => {
    test.setTimeout(120_000);
    await reachChart(page);
    await page.getByRole("button", { name: /check my take/i }).click();
    await page.getByRole("button", { name: /turn on mic/i }).click();
    await expect(page.getByText(/allow mic access in your browser/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /try again/i })).toBeVisible();
  });
});
