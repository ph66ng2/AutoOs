import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

const host = process.env.TAURI_DEV_HOST;
const isE2eScreenshots = process.env.VITE_E2E_SCREENSHOTS === "1";
const isE2eMock = process.env.VITE_E2E_MOCK === "1" || isE2eScreenshots;
const isE2eTeam = process.env.VITE_E2E_TEAM === "1";
const isE2eDemo = process.env.VITE_E2E_DEMO === "1";
const isE2ePortalVideo = process.env.VITE_E2E_PORTAL_VIDEO === "1";

/** Serve o JSON exportado do Postgres local só quando o job de screenshots pede. */
function uiScreenshotSeedPlugin(): Plugin {
  const file = path.resolve(__dirname, "e2e/fixtures/ui-screenshot-seed.json");
  return {
    name: "autoos-ui-screenshot-seed",
    configureServer(server) {
      server.middlewares.use("/__ui-screenshot-seed.json", (_req, res) => {
        if (!fs.existsSync(file)) {
          res.statusCode = 404;
          res.end("missing ui-screenshot-seed.json");
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), ...(isE2eScreenshots ? [uiScreenshotSeedPlugin()] : [])],
  
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      ...(isE2eMock
        ? {
            "@tauri-apps/api/core": path.resolve(
              __dirname,
              isE2eScreenshots
                ? "./e2e/mocks/tauri-core-screenshots.ts"
                : isE2ePortalVideo
                  ? "./e2e/mocks/tauri-core-portal-video.ts"
                : isE2eTeam
                  ? "./e2e/mocks/tauri-core-team.ts"
                  : isE2eDemo
                    ? "./e2e/mocks/tauri-core-demo.ts"
                    : "./e2e/mocks/tauri-core.ts",
            ),
            ...((isE2eDemo || isE2eTeam || isE2eScreenshots || isE2ePortalVideo)
              ? {
                  "@tauri-apps/api/event": path.resolve(
                    __dirname,
                    "./e2e/mocks/tauri-event-demo.ts",
                  ),
                }
              : {}),
          }
        : {}),
    },
  },

  optimizeDeps: {
    exclude: ["@powersync/web"],
  },

  worker: {
    format: "es",
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          if (
            normalizedId.includes("/node_modules/react/") ||
            normalizedId.includes("/node_modules/react-dom/") ||
            normalizedId.includes("/node_modules/scheduler/")
          ) {
            return "react-vendor";
          }
          if (normalizedId.includes("/node_modules/lucide-react/")) {
            return "icons";
          }
          return undefined;
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
