import { describe, test } from "vitest";
import { parsePagination as importedParsePagination } from "../src/services/pagination.service.js";

const parsePagination = importedParsePagination;

describe("pagination.service", () => {
  test("parsePagination", async ({ bench }) => {
    await bench.compare(
      bench("sin query (valores por defecto)", () => {
        parsePagination();
      }),
      bench("query válido (page=3, limit=20)", () => {
        parsePagination({ page: "3", limit: "20" });
      }),
      bench("limit por encima del máximo (limit=500)", () => {
        parsePagination({ page: "2", limit: "500" });
      }),
      bench("valores inválidos (page=abc, limit=-5)", () => {
        parsePagination({ page: "abc", limit: "-5" });
      }),
    );
  });
});

