import { describe, test } from "vitest";
import { ProductStore as ImportedProductStore } from "../src/services/product-store.js";

const ProductStore = ImportedProductStore;
type ProductStore = InstanceType<typeof ProductStore>;

const CATEGORIES = ["Granos", "Bebidas", "Despensa", "Lacteos"];
const SEED_SIZE = 1000;

function seededStore(n: number): ProductStore {
  const store = new ProductStore();
  for (let i = 0; i < n; i += 1) {
    store.create({
      name: `Producto ${i}`,
      sku: `PRD-${i}`,
      price: (i % 500) * 100,
      stock: i % 50,
      category: CATEGORIES[i % CATEGORIES.length],
    });
  }
  return store;
}

const store = seededStore(SEED_SIZE);
const sample = store.getBySku("PRD-500")!;

describe("product-store", () => {
  test("escritura", async ({ bench }) => {
    await bench.compare(
      bench("create (almacén vacío)", () => {
        new ProductStore().create({
          name: "Arroz",
          sku: "ARR-1",
          price: 3200,
          stock: 4,
          category: "Granos",
        });
      }),
      bench(`create + remove (${SEED_SIZE} productos)`, () => {
        const created = store.create({ name: "Temporal", sku: "TMP-1", price: 10 });
        store.remove(created.id);
      }),
      bench("update de precio", () => {
        store.update(sample.id, { price: 3500 });
      }),
      bench("update de sku (valida duplicados)", () => {
        store.update(sample.id, { sku: "PRD-500" });
      }),
      bench("adjustStock +1 / -1", () => {
        store.adjustStock(sample.id, 1);
        store.adjustStock(sample.id, -1);
      }),
    );
  });

  test(`lectura (${SEED_SIZE} productos)`, async ({ bench }) => {
    await bench.compare(
      bench("getById", () => {
        store.getById(sample.id);
      }),
      bench("getBySku", () => {
        store.getBySku("prd-500");
      }),
      bench("list sin filtros (ordena todo)", () => {
        store.list();
      }),
      bench("list con filtros (search + category + rango de precio)", () => {
        store.list({
          search: "producto 1",
          category: "bebidas",
          minPrice: 1000,
          maxPrice: 30000,
        });
      }),
    );
  });
});

