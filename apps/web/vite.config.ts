import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * In development the Vite dev server proxies `/api` and `/uploads` to the API,
 * so the browser always talks to a same-origin `/api` — exactly like nginx does
 * in production. `VITE_PROXY_TARGET` points at the container host under
 * `docker compose` (default `http://api:9000`), or `http://localhost:9000`
 * when running the API on the host.
 */
const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://localhost:9000";

export default defineConfig({
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
});
