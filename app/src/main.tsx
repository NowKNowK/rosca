import "./polyfills"; // MUST be first — sets Buffer global before Solana modules evaluate
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

window.addEventListener("error", (e) => {
  const root = document.getElementById("root");
  if (root && !root.hasChildNodes()) {
    root.innerHTML = `<pre style="padding:2rem;color:#dc2626;white-space:pre-wrap">${e.message}\n${e.filename}:${e.lineno}</pre>`;
  }
});
window.addEventListener("unhandledrejection", (e) => {
  const root = document.getElementById("root");
  if (root && !root.hasChildNodes()) {
    root.innerHTML = `<pre style="padding:2rem;color:#dc2626;white-space:pre-wrap">${String(e.reason)}</pre>`;
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
