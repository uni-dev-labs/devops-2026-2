import { describe, test } from "vitest";
import { ProductStore, type Product } from "../src/services/product-store.js";
import { RUN, saveGroup } from "./report.js";

/**
 * Mide cada operación del almacén con distintos tamaños de inventario para ver
 * cómo escala (O(1), O(n), O(n log n)). Los datos se generan de forma determinista
 * para que dos corridas sean comparables.
 */
const SIZES = [100, 1_000, 10_000] as const;
const CATEGORIES = ["bebidas", "aseo", "lácteos", "panadería", "frutas"];
const NAMES = ["Café", "jabón", "Leche", "pan", "Árbol", "manzana", "Ñame", "té", "Queso", "arroz"];

function seed(size: number): { store: ProductStore; products: Product[] } {
  const store = new ProductStore();
  const products: Product[] = [];
  for (let i = 0; i < size; i++) {
    products.push(
      store.create({
        name: `${NAMES[i % NAMES.length]} ${i}`,
        sku: `SKU-${String(i).padStart(6, "0")}`,
        price: (i % 500) + 0.99,
        stock: i % 50,
        category: CATEGORIES[i % CATEGORIES.length],
      }),
    );
  }
  return { store, products };
}

// Cada bench se repite miles de veces: se rota el índice para no medir siempre el mismo elemento.
function cycler<T>(items: T[]) {
  let i = 0;
  return () => items[i++ % items.length];
}

for (const size of SIZES) {
  describe(`ProductStore con ${size} productos`, () => {
    test("lecturas", async ({ bench }) => {
      const { store, products } = seed(size);
      const nextProduct = cycler(products);
      const lastSku = products[products.length - 1].sku;

      const names = [
        "getById",
        "getBySku (último sku)",
        "list() sin filtros",
        "list({ category, minPrice, maxPrice })",
        "list({ search })",
      ];
      const result = await bench.compare(
        bench(names[0], () => {
          store.getById(nextProduct().id);
        }),
        bench(names[1], () => {
          store.getBySku(lastSku);
        }),
        bench(names[2], () => {
          store.list();
        }),
        bench(names[3], () => {
          store.list({ category: "Lácteos", minPrice: 10, maxPrice: 200 });
        }),
        bench(names[4], () => {
          store.list({ search: "café" });
        }),
        RUN,
      );
      saveGroup(`store-${size}-lecturas`, names, result);
    });

    test("escrituras", async ({ bench }) => {
      const { store, products } = seed(size);
      const nextProduct = cycler(products);
      let n = 0;

      // "create + remove" mantiene el inventario en `size`: si solo se creara, el almacén crecería
      // durante la medición y los números no corresponderían al tamaño declarado.
      const names = ["create + remove", "update({ price })", "update({ sku })", "adjustStock(+1)"];
      const result = await bench.compare(
        bench(names[0], () => {
          const p = store.create({ name: "Temporal", sku: `TMP-${n++}`, price: 1 });
          store.remove(p.id);
        }),
        bench(names[1], () => {
          store.update(nextProduct().id, { price: (n++ % 100) + 1 });
        }),
        bench(names[2], () => {
          const p = nextProduct();
          store.update(p.id, { sku: p.sku });
        }),
        bench(names[3], () => {
          store.adjustStock(nextProduct().id, 1);
        }),
        RUN,
      );
      saveGroup(`store-${size}-escrituras`, names, result);
    });
  });
}
