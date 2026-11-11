import { describe, test } from "vitest";
import { parsePagination as importedParsePagination } from "../src/services/pagination.service.js";

// Copia local para no medir el getter del módulo en cada llamada.
const parsePagination = importedParsePagination;

// Rendimiento de parsePagination con los casos típicos del query string.
describe("pagination.service", () => {
  test("parsePagination", async ({ bench }) => {
    await bench.compare(
      bench("valores válidos (page=3, limit=5)", () => {
        parsePagination({ page: "3", limit: "5" });
      }),
      bench("sin parámetros (valores por defecto)", () => {
        parsePagination();
      }),
      bench("valores inválidos (page=-2, limit=abc)", () => {
        parsePagination({ page: "-2", limit: "abc" });
      }),
      bench("límite por encima del máximo (limit=500)", () => {
        parsePagination({ limit: "500" });
      }),
    );
  });
});
