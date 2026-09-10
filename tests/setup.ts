import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// globals:false means RTL's automatic cleanup is not registered; do it here.
afterEach(() => {
  cleanup();
});
