import { Buffer } from "buffer";

// Must run before any Solana/Anchor packages are evaluated.
// @solana/spl-token and @solana/web3.js reference Buffer as a global (Node.js heritage);
// setting it on globalThis here makes it available when those pre-bundled modules run.
(globalThis as unknown as Record<string, unknown>).Buffer = Buffer;

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).Buffer = Buffer;
  if (!(window as unknown as Record<string, unknown>).process) {
    (window as unknown as Record<string, unknown>).process = {
      env: { BROWSER: true, NODE_ENV: "development" },
      browser: true,
    };
  }
}
