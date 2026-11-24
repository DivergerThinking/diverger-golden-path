import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const c = process.env.CANDIDATO;
export default defineConfig({
  plugins: [react()],
  logLevel: "warn",
  build: {
    outDir: `peso/${c}`, emptyOutDir: true, cssCodeSplit: false,
    lib: { entry: `web/comparativa/${c}/PedirEquipo.tsx`, formats: ["es"], fileName: "pantalla" },
    rollupOptions: { external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"] },
  },
});
