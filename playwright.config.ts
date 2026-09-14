import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
    launchOptions: { args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] },
  },
  webServer: {
    // Production build served by vite preview, never a dev server.
    command: `npm run build && npm run preview -- --port ${PORT} --host 127.0.0.1 --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { NODE_ENV: "production", NODE_OPTIONS: "--max-old-space-size=2048" },
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
