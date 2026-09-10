import { test, expect, type Request } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, "../fixtures/tone.wav");

test("loads a local file, renders the waveform, and sends no audio", async ({
  page,
}) => {
  const requests: Request[] = [];
  page.on("request", (req) => requests.push(req));

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /drop in a song to start/i }),
  ).toBeVisible();

  const before = requests.length;
  await page.locator('input[type="file"]').setInputFiles(fixture);

  // The waveform and transport appear once decoding finishes.
  await expect(page.getByRole("button", { name: /play loop/i })).toBeVisible();
  await expect(page.locator("canvas.waveform-canvas")).toBeVisible();

  const afterLoad = requests.slice(before);
  const host = new URL(page.url()).host;

  // No request may leave the origin, and none may carry a body (upload).
  for (const req of afterLoad) {
    const url = new URL(req.url());
    expect(url.host, `unexpected external request to ${req.url()}`).toBe(host);
    expect(
      req.postData(),
      `unexpected request body on ${req.method()} ${req.url()}`,
    ).toBeNull();
  }

  // With observability env unset, nothing reaches Sentry or Umami.
  const external = requests.filter((r) => new URL(r.url()).host !== host);
  expect(external).toHaveLength(0);
  expect(consoleErrors).toEqual([]);
});
