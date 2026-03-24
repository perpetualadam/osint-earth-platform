import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";

export default defineConfig({
  // Loads repo-root .env — only vars prefixed VITE_ are exposed to client code as import.meta.env.VITE_*
  envDir: "..",
  plugins: [react(), cesium()],
  server: {
    port: 5173,
    // Listen on all interfaces; keep HMR on localhost so ws://localhost:5173 matches a typical browser URL
    host: true,
    strictPort: false,
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: 5173,
      clientPort: 5173,
    },
    // Same-origin (empty VITE_API_URL): browser → :5173/api → Vite → backend :3001
    proxy: {
      "/api": { target: "http://127.0.0.1:3001", changeOrigin: true },
      "/socket.io": { target: "ws://127.0.0.1:3001", ws: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 3000,
  },
});
