import { describe, it, expect } from "vitest";
import { ProductStore, ProductError } from "../src/services/product-store.js";

// La optimización de rendimiento agregó un índice sku → id. Estos tests comprueban que el índice
// queda siempre sincronizado con el almacén (si no, getBySku o la validación de duplicados mentirían).
describe("ProductStore: índice de sku", () => {
  it("al cambiar el sku, el viejo queda libre y el nuevo apunta al producto", () => {
    const store = new ProductStore();
    const p = store.create({ name: "Café", sku: "CAF-1", price: 10 });

    store.update(p.id, { sku: "caf-2" });

    expect(store.getBySku("CAF-1")).toBeNull();
    expect(store.getBySku("CAF-2")?.id).toBe(p.id);
    expect(store.create({ name: "Otro café", sku: "CAF-1", price: 5 }).sku).toBe("CAF-1");
  });

  it("al eliminar, el sku se puede reutilizar", () => {
    const store = new ProductStore();
    const p = store.create({ name: "Té", sku: "TE-1", price: 3 });

    expect(store.remove(p.id)).toBe(true);
    expect(store.getBySku("TE-1")).toBeNull();
    expect(store.create({ name: "Té verde", sku: "TE-1", price: 4 }).name).toBe("Té verde");
  });

  it("un update inválido no toca el índice", () => {
    const store = new ProductStore();
    const a = store.create({ name: "A", sku: "AA-1", price: 1 });
    store.create({ name: "B", sku: "BB-1", price: 1 });

    expect(() => store.update(a.id, { sku: "BB-1" })).toThrowError(ProductError);
    expect(() => store.update(a.id, { sku: "CC-1", price: -1 })).toThrowError(ProductError);

    expect(store.getBySku("AA-1")?.id).toBe(a.id);
    expect(store.getBySku("CC-1")).toBeNull();
  });

  it("list ordena igual que localeCompare('es', base) con tildes, ñ y mayúsculas", () => {
    const store = new ProductStore();
    const names = ["zanahoria", "Ñame", "árbol", "Arroz", "nabo", "éxito", "Café", "cafe"];
    names.forEach((name, i) => store.create({ name, sku: `S-${i}`, price: 1 }));

    const expected = [...names].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }) || 0);
    const got = store.list().map((p) => p.name);
    // "Café" y "cafe" empatan por nombre: el desempate es por sku (S-6 < S-7).
    expect(got).toEqual(expected.map((n) => n));
    expect(got.indexOf("Café")).toBeLessThan(got.indexOf("cafe"));
  });
});
