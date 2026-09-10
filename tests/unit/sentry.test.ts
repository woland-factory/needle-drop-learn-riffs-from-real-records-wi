import { beforeEach, describe, expect, it, vi } from "vitest";
import { initSentry, resetSentryForTest } from "../../src/observability/sentry";

beforeEach(() => {
  resetSentryForTest();
});

describe("initSentry", () => {
  it("does not initialize when the DSN is empty", async () => {
    const init = vi.fn();
    const ran = await initSentry(
      { SENTRY_DSN: "", UMAMI_WEBSITE_ID: "", UMAMI_URL: "" },
      init,
    );
    expect(ran).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it("initializes once with PII disabled when a DSN is present", async () => {
    const init = vi.fn();
    const config = {
      SENTRY_DSN: "https://key@example.test/1",
      UMAMI_WEBSITE_ID: "",
      UMAMI_URL: "",
    };
    const ran = await initSentry(config, init);
    expect(ran).toBe(true);
    expect(init).toHaveBeenCalledTimes(1);
    const options = init.mock.calls[0][0];
    expect(options.dsn).toBe(config.SENTRY_DSN);
    expect(options.sendDefaultPii).toBe(false);
    // No PII: nothing that could carry a file name or audio is attached.
    expect(Object.keys(options)).toEqual(["dsn", "sendDefaultPii"]);
  });

  it("only initializes once across repeated calls", async () => {
    const init = vi.fn();
    const config = {
      SENTRY_DSN: "https://key@example.test/1",
      UMAMI_WEBSITE_ID: "",
      UMAMI_URL: "",
    };
    await initSentry(config, init);
    const second = await initSentry(config, init);
    expect(second).toBe(false);
    expect(init).toHaveBeenCalledTimes(1);
  });
});
