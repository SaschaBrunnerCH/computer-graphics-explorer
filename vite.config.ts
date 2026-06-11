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
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("@esri/calcite") || id.includes("type-fest")) return "calcite";
          if (/node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)) return "react";
          return undefined;
        },
      },
    },
  },
});
