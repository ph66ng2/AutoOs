import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "public-status-root-index",
      generateBundle: {
        order: "post",
        handler(_options, bundle) {
          const html = bundle["public-status.html"];
          if (!html) throw new Error("The public status page entry was not generated.");
          delete bundle["public-status.html"];
          html.fileName = "index.html";
          bundle["index.html"] = html;
        },
      },
    },
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    outDir: "dist-public-status",
    emptyOutDir: true,
    rollupOptions: {
      input: { index: path.resolve(__dirname, "./public-status.html") },
    },
  },
});
