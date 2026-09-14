import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2021",
  },
  worker: {
    // The transcription worker dynamically imports tfjs and Basic Pitch, which
    // is code-splitting; ES module workers support that (the default iife does not).
    format: "es",
  },
});
