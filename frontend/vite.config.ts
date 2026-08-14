import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Registered explicitly via the useRegisterSW hook (PwaUpdater.tsx) so
      // the app can poll for updates on an idle tab and force a reload the
      // moment a new deploy is found — the auto-injected registerSW.js only
      // checks on navigation, which left an already-open tab able to run
      // indefinitely against a build whose chunk files had been replaced.
      injectRegister: false,
      // Precaches only the built app shell (JS/CSS/HTML/icons) so the app
      // is installable and can render offline — it does not intercept or
      // cache API/Firestore calls, since those go to a different origin
      // (VITE_API_BASE_URL) and generateSW's default runtime caching is
      // opt-in per route, not applied automatically. Live data always
      // still comes straight from the network.
      manifest: {
        name: "Hantistock",
        short_name: "Hantistock",
        description: "Cloud-based inventory, sales, delivery, and business management system.",
        start_url: "/",
        display: "standalone",
        background_color: "#0b0b12",
        theme_color: "#0b0b12",
        icons: [
          {
            src: "/favicon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3") || id.includes("node_modules/victory")) {
            return "vendor-charts";
          }
          if (id.includes("node_modules/firebase")) {
            return "vendor-firebase";
          }
          if (id.includes("node_modules/@tanstack")) {
            return "vendor-query";
          }
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/react-router")) {
            return "vendor-react";
          }
        },
      },
    },
  },
});
