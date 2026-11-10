import { createBench, SERVICE_ITERATIONS, type BenchResult } from "../bench-utils.js";
import { parsePagination } from "./pagination.service.js";
import { ProductStore } from "./product-store.js";

export async function benchServices(): Promise<BenchResult> {
  const { measure, result } = createBench("services");

  await measure("parsePagination", SERVICE_ITERATIONS, () => parsePagination({ page: "3", limit: "25" }));

  const store = new ProductStore();
  await measure("ProductStore.create", SERVICE_ITERATIONS, (i) =>
    store.create({ name: `Producto ${i}`, sku: `SKU-${i + 1}`, price: 10 + i, stock: 5, category: i % 2 ? "a" : "b" }),
  );

  const first = store.list()[0];
  await measure("ProductStore.getById", SERVICE_ITERATIONS, () => store.getById(first.id));
  await measure("ProductStore.getBySku", SERVICE_ITERATIONS, () => store.getBySku(first.sku));
  await measure("ProductStore.list (todo)", 50, () => store.list());
  await measure("ProductStore.list (filtros)", 50, () =>
    store.list({ search: "producto 1", category: "a", minPrice: 10, maxPrice: 5000, active: true }),
  );
  await measure("ProductStore.update", SERVICE_ITERATIONS, (i) => store.update(first.id, { price: 1 + i }));
  await measure("ProductStore.adjustStock", SERVICE_ITERATIONS, () => store.adjustStock(first.id, 1));

  const ids = store.list().map((p) => p.id); // antes de medir, para no incluir list()
  await measure("ProductStore.remove", ids.length - 1, (i) => store.remove(ids[i + 1]));

  return result;
}
