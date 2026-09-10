import { getRuntimeConfig, type RuntimeConfig } from "../runtime-config";

export interface SentryOptions {
  dsn: string;
  sendDefaultPii: boolean;
}

export type SentryInit = (options: SentryOptions) => void;

let initialized = false;

/** Test hook: forget that init already ran. */
export function resetSentryForTest(): void {
  initialized = false;
}

/**
 * Initializes error tracking only when a DSN is present. No-ops otherwise.
 * PII is never sent: no file names, no audio, no user identifiers are attached.
 * Runs at most once per session.
 */
export async function initSentry(
  config: RuntimeConfig = getRuntimeConfig(),
  initFn?: SentryInit,
): Promise<boolean> {
  if (initialized) return false;
  if (!config.SENTRY_DSN) return false;
  initialized = true;
  const options: SentryOptions = {
    dsn: config.SENTRY_DSN,
    sendDefaultPii: false,
  };
  if (initFn) {
    initFn(options);
  } else {
    const Sentry = await import("@sentry/browser");
    Sentry.init(options);
  }
  return true;
}
