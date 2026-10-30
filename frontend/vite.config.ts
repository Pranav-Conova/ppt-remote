import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const backend = "http://localhost:8080";
const outDir = fileURLToPath(new URL("../backend/internal/web/dist", import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      // The Go binary embeds outDir; keep the placeholder that lets it build
      // before the frontend has been built.
      name: "keep-gitkeep",
      closeBundle() {
        writeFileSync(`${outDir}/.gitkeep`, "");
      },
    },
  ],
  build: { outDir, emptyOutDir: true },
  // ES-module workers, matching the module build of MediaPipe's WASM loader.
  worker: { format: "es" },
  server: {
    host: true,
    // Allow HTTPS tunnels so a phone can open the dev server (gyro needs HTTPS).
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.app"],
    proxy: {
      "/api": backend,
      // Rewrite Origin so the backend's same-origin WebSocket check passes
      // behind the dev proxy.
      "/ws": { target: backend, ws: true, headers: { origin: backend } },
    },
  },
  test: { environment: "node" },
});
