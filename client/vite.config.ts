import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During `npm run dev`, requests to /api/* are forwarded to the local
// Express server (see ../server) so the browser never needs to know the
// backend's real address. In production, set VITE_API_BASE instead (see
// src/SparkFixApp.tsx) if the client and server are hosted separately.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
