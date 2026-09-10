import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initSentry } from "./observability/sentry";
import { injectUmami } from "./observability/umami";
import "./styles/global.css";

void initSentry();
injectUmami();

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
