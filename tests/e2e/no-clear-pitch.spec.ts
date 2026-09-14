import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const silence = resolve(here, "../fixtures/silence.wav");

// A region with no clear line must show the designed state, never a crash and
// never zero notes presented as a successful chart.
test("shows the no-clear-pitch state for a silent region", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(silence);
  await expect(page.getByRole("button", { name: /find the notes/i })).toBeVisible();

  await page.getByRole("button", { name: /find the notes/i }).click();

  await expect(
    page.getByRole("heading", { name: /this part is hard to read/i }),
  ).toBeVisible({ timeout: 90_000 });

  // No piano-roll notes were presented as success.
  await expect(page.locator("[data-note]")).toHaveCount(0);
  // A next step is offered, and nothing crashed.
  await expect(page.getByRole("button", { name: /pick another part/i })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
