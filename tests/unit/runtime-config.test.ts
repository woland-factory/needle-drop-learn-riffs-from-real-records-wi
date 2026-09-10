import { afterEach, describe, expect, it } from "vitest";
import { getRuntimeConfig } from "../../src/runtime-config";

afterEach(() => {
  delete window.__NEEDLE_DROP_ENV__;
});

describe("getRuntimeConfig", () => {
  it("returns empty strings when the global is absent", () => {
    delete window.__NEEDLE_DROP_ENV__;
    expect(getRuntimeConfig()).toEqual({
      SENTRY_DSN: "",
      UMAMI_WEBSITE_ID: "",
      UMAMI_URL: "",
    });
  });

  it("fills missing keys with empty strings when the global is partial", () => {
    window.__NEEDLE_DROP_ENV__ = { SENTRY_DSN: "https://example.test/1" };
    expect(getRuntimeConfig()).toEqual({
      SENTRY_DSN: "https://example.test/1",
      UMAMI_WEBSITE_ID: "",
      UMAMI_URL: "",
    });
  });

  it("passes through all provided values", () => {
    window.__NEEDLE_DROP_ENV__ = {
      SENTRY_DSN: "dsn",
      UMAMI_WEBSITE_ID: "id",
      UMAMI_URL: "https://umami.test/script.js",
    };
    expect(getRuntimeConfig()).toEqual({
      SENTRY_DSN: "dsn",
      UMAMI_WEBSITE_ID: "id",
      UMAMI_URL: "https://umami.test/script.js",
    });
  });
});
