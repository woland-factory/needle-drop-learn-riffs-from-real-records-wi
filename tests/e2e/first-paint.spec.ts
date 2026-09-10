import { test, expect } from "@playwright/test";

test("serves branded content in the initial HTML before any script runs", async ({
  request,
}) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain("Needle Drop");
  expect(html).toContain("Drop in a song to start");
  expect(html).toContain("Choose a song");
});

test("falls back to the SPA entry for unknown routes", async ({ request }) => {
  const res = await request.get("/some/deep/link");
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain("Needle Drop");
});
