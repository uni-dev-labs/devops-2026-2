import { describe, it, expect } from "vitest";
import { parsePagination } from "../src/services/pagination.service.js";

describe("parsePagination", () => {
  it("calcula page, limit y offset a partir del query string", () => {
    const result = parsePagination({ page: "3", limit: "5" });

    expect(result).toEqual({ page: 3, limit: 5, offset: 10 });
  });

  it("usa valores por defecto con datos inválidos y respeta el límite máximo", () => {
    expect(parsePagination({ page: "-2", limit: "abc" })).toEqual({
      page: 1,
      limit: 10,
      offset: 0,
    });
    expect(parsePagination({ limit: "500" })).toEqual({ page: 1, limit: 50, offset: 0 });
  });
});
