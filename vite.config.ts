import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: permite abrir la build desde cualquier subcarpeta o file://
  base: "./",
  server: {
    port: 5173,
    // El frontend solo habla con /api/v1. En desarrollo Vite reenvia al backend
    // de Tom (FastAPI en :8000). Si el backend no esta levantado, la app usa
    // sus fixtures locales y lo indica en pantalla.
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
  },
});
