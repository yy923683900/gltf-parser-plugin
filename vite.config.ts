import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";
import { resolve } from "path";
import { analyzer } from "vite-bundle-analyzer";

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
      rollupTypes: true,
    }),
    analyzer({
      analyzerPort: 8999,
    }),
  ],
  server: {
    port: 3000,
    open: true,
    watch: {
      ignored: ["**/node_modules/**", "**/dist/**"],
    },
  },
  worker: {
    format: "es",
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "MaptalksTilerPlugin",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
    },
    rollupOptions: {
      external: ["three"],
      output: {
        globals: {},
      },
      // treeshake: {
      //   moduleSideEffects: false,
      //   propertyReadSideEffects: false,
      // },
    },
    sourcemap: true,
    minify: true,
    // minify: "terser",
    // terserOptions: {
    //   compress: {
    //     drop_console: true,
    //     drop_debugger: true,
    //     pure_funcs: ["console.log", "console.info", "console.debug"],
    //     passes: 2,
    //   },
    //   mangle: {
    //     properties: false,
    //   },
    //   format: {
    //     comments: false,
    //   },
    // },
  },
  test: {
    environment: "node",
  },
});
