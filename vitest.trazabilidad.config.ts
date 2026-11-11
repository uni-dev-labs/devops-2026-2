import { defineConfig } from "vitest/config";

// Corre los 32 tests de productos con el setup que mide cada llamada a ProductStore.
export default defineConfig({
  test: {
    include: ["tests/practica-productos/**/*.test.ts"],
    setupFiles: ["debug/trazabilidad.setup.ts"],
    globalSetup: ["debug/trazabilidad.report.ts"],
  },
});
