import { test, expect } from "@playwright/test";

// The loop transport must stay interactive while transcription runs off the
// main thread. This is the binding "never freezes the loop controls" guarantee.
test("keeps the loop controls alive during transcription", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /play a sample loop/i }).click();

  await page.getByRole("button", { name: /find the notes/i }).click();

  // While the progress state is up, the loop transport still responds.
  await expect(page.getByRole("heading", { name: /reading the notes/i })).toBeVisible();
  const play = page.getByRole("button", { name: /play loop/i });
  await play.click();
  await expect(page.getByRole("button", { name: /pause/i })).toBeVisible();
  await page.getByRole("button", { name: /pause/i }).click();
  await expect(page.getByRole("button", { name: /play loop/i })).toBeVisible();

  // A way out of the progress state is always offered.
  await expect(page.getByRole("button", { name: /^cancel$/i })).toBeVisible();
});
