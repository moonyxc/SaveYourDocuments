import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Im Entwicklungsmodus leitet Vite /api an das laufende Backend weiter
// (SYD_API=http://127.0.0.1:PORT, Token per URL-Fragment #token=...).
const api = process.env.SYD_API ?? "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  server: {
    port: 5173,
    proxy: { "/api": { target: api, changeOrigin: false, ws: true } },
  },
});
