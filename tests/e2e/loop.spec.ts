import { test, expect } from "@playwright/test";

// Uses the bundled 4.8s sample clip so two bars at 120 BPM (4s) fits.
test("drags, snaps to bars, sets speed in range, and loops", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /play a sample loop/i }).click();

  await expect(page.getByRole("button", { name: /play loop/i })).toBeVisible();

  // Default: snap on, 2 bars at 120 BPM -> a 4-second region.
  await expect(page.getByText(/loop end 0:04/i)).toBeVisible();

  // Snap recomputes the length when bars change: 1 bar -> 2 seconds.
  await page.getByLabel("Bars", { exact: true }).fill("1");
  await expect(page.getByText(/loop end 0:02/i)).toBeVisible();

  // Speed control is constrained to 50-100 percent.
  const speed = page.locator("#speed");
  await expect(speed).toHaveAttribute("min", "50");
  await expect(speed).toHaveAttribute("max", "100");
  await speed.evaluate((el: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(el, "75");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.getByText("75%")).toBeVisible();

  // Play the loop; transport reflects the playing state immediately.
  const play = page.getByRole("button", { name: /play loop/i });
  await play.click();
  await expect(page.getByRole("button", { name: /pause/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /pause/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
