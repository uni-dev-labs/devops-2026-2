import { describe, test } from "vitest";
import { parsePagination } from "../src/services/pagination.service.js";
import { RUN, saveGroup } from "./report.js";

describe("parsePagination", () => {
  test("casos del query string", async ({ bench }) => {
    const names = [
      "sin query (por defecto)",
      "válido { page: '3', limit: '20' }",
      "limit mayor al máximo",
      "inválido { page: 'abc', limit: '-5' }",
    ];
    const result = await bench.compare(
      bench(names[0], () => {
        parsePagination();
      }),
      bench(names[1], () => {
        parsePagination({ page: "3", limit: "20" });
      }),
      bench(names[2], () => {
        parsePagination({ page: "1", limit: "1000" });
      }),
      bench(names[3], () => {
        parsePagination({ page: "abc", limit: "-5" });
      }),
      RUN,
    );
    saveGroup("pagination", names, result);
  });
});
