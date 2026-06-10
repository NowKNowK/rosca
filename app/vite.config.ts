import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Provide browser-compatible Buffer
      buffer: "buffer/",
    },
  },
  optimizeDeps: {
    include: ["buffer", "@coral-xyz/anchor", "@solana/web3.js", "@solana/spl-token"],
  },
  define: {
    // Anchor / web3.js expect these globals
    "process.env.BROWSER": JSON.stringify(true),
    "process.env.NODE_ENV": JSON.stringify("development"),
    "process.browser": JSON.stringify(true),
    global: "globalThis",
  },
});
