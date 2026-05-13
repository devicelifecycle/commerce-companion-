import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    // Warn when a single chunk exceeds 500kb
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime — cached separately, changes rarely
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Supabase client — large, stable
          'vendor-supabase': ['@supabase/supabase-js'],
          // Charting — large, only used in reports
          'vendor-charts': ['recharts'],
          // Radix UI primitives — large, used everywhere but stable
          'vendor-radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
          ],
          // Data layer
          'vendor-query': ['@tanstack/react-query'],
          // Excel export — heavy, only used in import/export flows
          'vendor-excel': ['exceljs'],
        },
      },
    },
  },
}));
