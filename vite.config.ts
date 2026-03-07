import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname, "src"),
  server: {
    port: 15000,
    strictPort: true
  },
  resolve: {
    alias: {
      "@": resolve(__dirname),
      "@/compat": resolve(__dirname, "compat"),
      "@/shared": resolve(__dirname, "shared")
    }
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true
  }
});
