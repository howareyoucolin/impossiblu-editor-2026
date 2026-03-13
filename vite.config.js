const { defineConfig } = require("vite");
const path = require("path");

module.exports = defineConfig({
  build: {
    outDir: "react-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "react.html"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
