import react from "@vitejs/plugin-react";
import {defineConfig} from "vite";

export default defineConfig({
  root: "console",
  base: "/console/",
  plugins: [react()],
  build: {
    outDir: "../dist/console",
    emptyOutDir: true,
  },
});
