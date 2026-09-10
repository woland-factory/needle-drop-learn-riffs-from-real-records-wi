import { afterEach, describe, expect, it } from "vitest";
import { injectUmami } from "../../src/observability/umami";

afterEach(() => {
  document.querySelectorAll("script[data-needle-umami]").forEach((s) => s.remove());
});

const both = {
  SENTRY_DSN: "",
  UMAMI_WEBSITE_ID: "site-123",
  UMAMI_URL: "https://umami.test/script.js",
};

describe("injectUmami", () => {
  it("injects nothing when values are empty", () => {
    const added = injectUmami(
      { SENTRY_DSN: "", UMAMI_WEBSITE_ID: "", UMAMI_URL: "" },
      document,
    );
    expect(added).toBe(false);
    expect(document.querySelectorAll("script[data-needle-umami]")).toHaveLength(0);
  });

  it("injects nothing when only one value is present", () => {
    const added = injectUmami(
      { SENTRY_DSN: "", UMAMI_WEBSITE_ID: "site-123", UMAMI_URL: "" },
      document,
    );
    expect(added).toBe(false);
  });

  it("injects exactly one script tag when both values are present", () => {
    const added = injectUmami(both, document);
    expect(added).toBe(true);
    const scripts = document.querySelectorAll("script[data-needle-umami]");
    expect(scripts).toHaveLength(1);
    const script = scripts[0] as HTMLScriptElement;
    expect(script.src).toBe(both.UMAMI_URL);
    expect(script.getAttribute("data-website-id")).toBe(both.UMAMI_WEBSITE_ID);
  });

  it("does not add a second script on repeated calls", () => {
    injectUmami(both, document);
    injectUmami(both, document);
    expect(document.querySelectorAll("script[data-needle-umami]")).toHaveLength(1);
  });
});
