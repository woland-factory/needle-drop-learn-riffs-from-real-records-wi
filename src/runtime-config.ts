export interface RuntimeConfig {
  SENTRY_DSN: string;
  UMAMI_WEBSITE_ID: string;
  UMAMI_URL: string;
}

declare global {
  interface Window {
    __NEEDLE_DROP_ENV__?: Partial<RuntimeConfig>;
  }
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Reads the runtime config injected as window.__NEEDLE_DROP_ENV__ (written by
 * the container entrypoint from env). Every field defaults to an empty string
 * so the app works in dev and when nothing is configured.
 */
export function getRuntimeConfig(): RuntimeConfig {
  const env =
    (typeof window !== "undefined" && window.__NEEDLE_DROP_ENV__) || {};
  return {
    SENTRY_DSN: readString(env.SENTRY_DSN),
    UMAMI_WEBSITE_ID: readString(env.UMAMI_WEBSITE_ID),
    UMAMI_URL: readString(env.UMAMI_URL),
  };
}
