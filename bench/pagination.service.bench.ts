import { describe, test } from "vitest";
import { parsePagination as imported } from "../src/services/pagination.service.js";

// Copia local: así no se mide el costo de leer la exportación del módulo en cada llamada.
const parsePagination = imported;
const RUN = { time: 500, warmupTime: 100 };

describe("pagination.service: parsePagination", () => {
  test("casos del query string", async ({ bench }) => {
    await bench.compare(
      bench("valores válidos (page=2, limit=20)", () => {
        parsePagination({ page: "2", limit: "20" });
      }),
      bench("sin parámetros (por defecto)", () => {
        parsePagination();
      }),
      bench("valores inválidos (page=-1, limit=abc)", () => {
        parsePagination({ page: "-1", limit: "abc" });
      }),
      bench("limit mayor al máximo (limit=500)", () => {
        parsePagination({ limit: "500" });
      }),
      RUN,
    );
  });
});
