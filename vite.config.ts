import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base is set unconditionally (also in dev) so GitHub Pages base-path issues
// with assets and lazy-loaded chunks surface immediately, not just in CI.
export default defineConfig({
  base: "/computer-graphics-explorer/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
  },
});
