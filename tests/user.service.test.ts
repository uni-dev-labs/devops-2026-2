import { describe, it, expect } from "vitest";
import { validateUser } from "../src/services/user.service.js";

describe("validateUser", () => {
  it("normaliza nombre y email de un usuario válido", () => {
    const result = validateUser({ name: "  Nelson Gonzalez ", email: " Nelson.Gonzalez@UsantoTomas.edu.co " });

    expect(result).toEqual({
      ok: true,
      user: { name: "Nelson Gonzalez", email: "nelson.gonzalez@usantotomas.edu.co" },
    });
  });

  it("rechaza datos faltantes o con email inválido", () => {
    expect(validateUser({ name: "Samuel" })).toEqual({ ok: false, error: "name and email are required" });
    expect(validateUser({ name: "Samuel", email: "samuel-sin-arroba" })).toEqual({
      ok: false,
      error: "email is not valid",
    });
  });
});
