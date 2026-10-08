import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

/**
 * In development the Vite dev server proxies `/api` and `/uploads` to the API,
 * so the browser always talks to a same-origin `/api` — exactly like nginx does
 * in production.
 *
 * The target is read from the environment **and** from this app's `.env` files.
 * `process.env` alone was not enough: Vite exposes `.env` values through
 * `import.meta.env` only, never `process.env`, so `VITE_PROXY_TARGET` in
 * `apps/web/.env` was silently ignored and every proxied request went to the
 * fallback instead — a dev server forwarding `/api` to whatever else happens to
 * hold that port. An exported variable still wins, because that is how
 * `compose.yaml` supplies `http://api:9000` under Docker.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget =
    process.env.VITE_PROXY_TARGET ?? env.VITE_PROXY_TARGET ?? "http://localhost:9000";

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": { target: proxyTarget, changeOrigin: true },
        "/uploads": { target: proxyTarget, changeOrigin: true },
        "/health": { target: proxyTarget, changeOrigin: true },
      },
      // Bind-mounted source on some hosts does not emit inotify events.
      watch: { usePolling: process.env.VITE_USE_POLLING === "true" },
    },
    preview: { host: true, port: 4173 },
    build: {
      outDir: "dist",
      sourcemap: false,
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      css: true,
    },
  };
});
