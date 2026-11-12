import { describe, test } from "vitest";
import { ProductStore } from "../src/services/product-store.js";

const CATEGORIES = ["Granos", "Bebidas", "Lacteos", "Aseo"];

// Crea un almacén con n productos para medir sobre un volumen realista.
function storeWith(n: number): ProductStore {
  const store = new ProductStore();
  for (let i = 0; i < n; i++) {
    store.create({
      name: `Producto ${i}`,
      sku: `SKU-${i}`,
      price: (i % 300) * 50,
      stock: i % 40,
      category: CATEGORIES[i % CATEGORIES.length],
    });
  }
  return store;
}

// Almacén para escrituras y otro para lecturas, así una medición no altera la otra.
const writeStore = storeWith(1000);
const readStore = storeWith(1000);
const target = writeStore.getBySku("SKU-500")!;
const readTarget = readStore.getBySku("SKU-500")!;
let counter = 0;
let lastId = "";

// Cada benchmark se mide durante 500 ms; el test tiene hasta 2 minutos.
const RUN = { time: 500, warmupTime: 100 };
const LIMIT = { timeout: 120_000 };

describe("ProductStore: los 7 métodos (1.000 productos)", () => {
  test("escritura", LIMIT, async ({ bench }) => {
    await bench.compare(
      // afterEach/beforeEach corren fuera del tiempo medido: el almacén se queda en 1.000.
      bench("create", { afterEach: () => { writeStore.remove(lastId); } }, () => {
        lastId = writeStore.create({ name: "Temporal", sku: `TMP-${counter++}`, price: 10 }).id;
      }),
      bench("update (precio)", () => {
        writeStore.update(target.id, { price: 3500 });
      }),
      bench("adjustStock (+1)", () => {
        writeStore.adjustStock(target.id, 1);
      }),
      bench("remove", { beforeEach: () => { lastId = writeStore.create({ name: "Borrar", sku: `DEL-${counter++}`, price: 1 }).id; } }, () => {
        writeStore.remove(lastId);
      }),
      RUN,
    );
  });

  test("lectura", LIMIT, async ({ bench }) => {
    await bench.compare(
      bench("getById", () => {
        readStore.getById(readTarget.id);
      }),
      bench("getBySku", () => {
        readStore.getBySku("sku-500");
      }),
      bench("list (sin filtros)", () => {
        readStore.list();
      }),
      bench("list (búsqueda + categoría + precio)", () => {
        readStore.list({ search: "producto 1", category: "bebidas", minPrice: 1000, maxPrice: 8000 });
      }),
      RUN,
    );
  });
});

describe("ProductStore: cómo crece el tiempo con más productos", () => {
  const small = storeWith(100);
  const medium = storeWith(1_000);
  const large = storeWith(10_000);
  const ids = [small, medium, large].map((s, i) => s.getBySku(`SKU-${[50, 500, 5000][i]}`)!.id);

  test("getById (búsqueda por id en un Map)", LIMIT, async ({ bench }) => {
    await bench.compare(
      bench("getById · 100", () => { small.getById(ids[0]!); }),
      bench("getById · 1.000", () => { medium.getById(ids[1]!); }),
      bench("getById · 10.000", () => { large.getById(ids[2]!); }),
    );
  });

  test("getBySku (recorre los productos)", LIMIT, async ({ bench }) => {
    await bench.compare(
      bench("getBySku · 100", () => { small.getBySku("SKU-50"); }),
      bench("getBySku · 1.000", () => { medium.getBySku("SKU-500"); }),
      bench("getBySku · 10.000", () => { large.getBySku("SKU-5000"); }),
    );
  });

  test("list (filtra y ordena todo)", LIMIT, async ({ bench }) => {
    await bench.compare(
      bench("list · 100", () => { small.list(); }),
      bench("list · 1.000", () => { medium.list(); }),
      bench("list · 10.000", () => { large.list(); }),
    );
  });
});
