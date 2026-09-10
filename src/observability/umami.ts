import { getRuntimeConfig, type RuntimeConfig } from "../runtime-config";

const MARKER = "data-needle-umami";

/**
 * Injects the Umami analytics script only when both the URL and website id are
 * present. Adds exactly one script tag; repeated calls are a no-op.
 */
export function injectUmami(
  config: RuntimeConfig = getRuntimeConfig(),
  doc: Document = document,
): boolean {
  if (!config.UMAMI_URL || !config.UMAMI_WEBSITE_ID) return false;
  if (doc.querySelector(`script[${MARKER}]`)) return false;
  const script = doc.createElement("script");
  script.async = true;
  script.defer = true;
  script.src = config.UMAMI_URL;
  script.setAttribute("data-website-id", config.UMAMI_WEBSITE_ID);
  script.setAttribute(MARKER, "");
  doc.head.appendChild(script);
  return true;
}
