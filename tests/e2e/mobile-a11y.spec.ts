import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("is usable at 390px with keyboard reach and no horizontal scroll", async ({
  page,
}) => {
  await page.goto("/");

  const noOverflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
  expect(await noOverflow()).toBe(true);

  // One obvious primary action on the empty screen.
  await expect(page.getByRole("button", { name: /choose a song/i })).toBeVisible();

  await page.getByRole("button", { name: /play a sample loop/i }).click();
  await expect(page.getByRole("button", { name: /play loop/i })).toBeVisible();
  expect(await noOverflow()).toBe(true);

  // Every control is reachable by keyboard and shows focus.
  const tempo = page.getByLabel(/tempo/i);
  await tempo.focus();
  await expect(tempo).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Bars", { exact: true })).toBeFocused();
});
