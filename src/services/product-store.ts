/**
 * Contrato del almacén de productos.
 * El comportamiento lo definen los tests de tests/practica-productos.
 * Implementen los métodos. No cambien las firmas ni los códigos de ProductError.
 */
import { randomUUID } from "node:crypto";

export type Product = {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  category: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateProductInput = {
  name: string;
  sku: string;
  price: number;
  stock?: number;
  category?: string | null;
};

export type UpdateProductInput = {
  name?: string;
  sku?: string;
  price?: number;
  stock?: number;
  category?: string | null;
  active?: boolean;
};

export type ListProductsQuery = {
  search?: string;
  category?: string;
  active?: boolean;
  minPrice?: number;
  maxPrice?: number;
};

export type ProductErrorCode = "VALIDATION" | "NOT_FOUND" | "DUPLICATE_SKU" | "INSUFFICIENT_STOCK";

export class ProductError extends Error {
  readonly code: ProductErrorCode;

  constructor(code: ProductErrorCode, message: string) {
    super(message);
    this.name = "ProductError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}


const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const LOCALE_COMPARE_OPTIONS: Intl.CollatorOptions = { sensitivity: "base" };

function fail(code: ProductErrorCode, message: string): never {
  throw new ProductError(code, message);
}

function normalizeName(name: unknown): string {
  if (typeof name !== "string") {
    fail("VALIDATION", "El nombre es obligatorio y debe ser texto.");
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    fail("VALIDATION", "El nombre debe tener entre 1 y 80 caracteres.");
  }
  return trimmed;
}

/** Recorta y pone en mayúsculas el sku, y valida su formato. No revisa duplicados. */
function normalizeSku(sku: unknown): string {
  if (typeof sku !== "string") {
    fail("VALIDATION", "El sku es obligatorio y debe ser texto.");
  }
  const normalized = sku.trim().toUpperCase();
  if (normalized.length < 2 || normalized.length > 32 || !SKU_PATTERN.test(normalized)) {
    fail(
      "VALIDATION",
      "El sku debe tener entre 2 y 32 caracteres, solo letras, números y guiones internos.",
    );
  }
  return normalized;
}

function normalizePrice(price: unknown): number {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    fail("VALIDATION", "El precio debe ser un número finito mayor o igual a 0.");
  }
  return price;
}

/** Valida un stock recibido explícitamente (no decide el valor por defecto). */
function normalizeStockValue(stock: unknown): number {
  if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0) {
    fail("VALIDATION", "El stock debe ser un entero mayor o igual a 0.");
  }
  return stock;
}

function normalizeCategory(category: unknown): string | null {
  if (category === undefined || category === null) {
    return null;
  }
  if (typeof category !== "string") {
    fail("VALIDATION", "La categoría debe ser texto.");
  }
  const trimmed = category.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizePriceBound(value: number | undefined, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", `${label} debe ser un número finito mayor o igual a 0.`);
  }
  return value;
}

/** Devuelve una copia profunda (en lo que respecta a Date) del producto. */
function cloneProduct(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt),
    updatedAt: new Date(product.updatedAt),
  };
}

type ListFilters = {
  search: string;
  category: string;
  active?: boolean;
  minPrice?: number;
  maxPrice?: number;
};

export class ProductStore {
  private readonly productsById = new Map<string, Product>();

  create(input: CreateProductInput): Product {
    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = normalizePrice(input.price);
    const stock = input.stock === undefined ? 0 : normalizeStockValue(input.stock);
    const category = normalizeCategory(input.category);

    this.assertSkuAvailable(sku);

    const now = new Date();
    const product: Product = {
      id: randomUUID(),
      name,
      sku,
      price,
      stock,
      category,
      active: true,
      createdAt: now,
      updatedAt: new Date(now),
    };

    this.productsById.set(product.id, product);
    return cloneProduct(product);
  }

  getById(id: string): Product | null {
    const product = this.productsById.get(id);
    return product ? cloneProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") {
      return null;
    }
    const normalized = sku.trim().toUpperCase();
    if (normalized.length === 0) {
      return null;
    }
    const product = this.findBySku(normalized);
    return product ? cloneProduct(product) : null;
  }

  list(query?: ListProductsQuery): Product[] {
    const filters = this.buildFilters(query ?? {});

    return [...this.productsById.values()]
      .filter((product) => this.matchesFilters(product, filters))
      .sort((a, b) => this.compareByNameThenSku(a, b))
      .map(cloneProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const existing = this.productsById.get(id);
    if (!existing) {
      fail("NOT_FOUND", `No existe un producto con id "${id}".`);
    }

    // Se construye sobre una copia y solo se confirma al final: así, si
    // cualquier campo es inválido, el producto guardado queda intacto
    const next: Product = { ...existing };

    if (patch.name !== undefined) {
      next.name = normalizeName(patch.name);
    }
    if (patch.sku !== undefined) {
      const sku = normalizeSku(patch.sku);
      this.assertSkuAvailable(sku, existing.id);
      next.sku = sku;
    }
    if (patch.price !== undefined) {
      next.price = normalizePrice(patch.price);
    }
    if (patch.stock !== undefined) {
      next.stock = normalizeStockValue(patch.stock);
    }
    if (patch.category !== undefined) {
      next.category = normalizeCategory(patch.category);
    }
    if (patch.active !== undefined) {
      if (typeof patch.active !== "boolean") {
        fail("VALIDATION", "El estado activo debe ser booleano.");
      }
      next.active = patch.active;
    }

    const hasChanges = Object.keys(patch).length > 0;
    if (hasChanges) {
      next.updatedAt = new Date();
    }

    this.productsById.set(existing.id, next);
    return cloneProduct(next);
  }

  remove(id: string): boolean {
    return this.productsById.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const existing = this.productsById.get(id);
    if (!existing) {
      fail("NOT_FOUND", `No existe un producto con id "${id}".`);
    }
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      fail("VALIDATION", "El ajuste debe ser un entero distinto de cero.");
    }

    const nextStock = existing.stock + delta;
    if (nextStock < 0) {
      fail("INSUFFICIENT_STOCK", "El ajuste dejaría el stock por debajo de cero.");
    }

    const updated: Product = { ...existing, stock: nextStock, updatedAt: new Date() };
    this.productsById.set(existing.id, updated);
    return cloneProduct(updated);
  }

  //helpers privados

  private findBySku(normalizedSku: string): Product | undefined {
    for (const product of this.productsById.values()) {
      if (product.sku === normalizedSku) {
        return product;
      }
    }
    return undefined;
  }

  private assertSkuAvailable(normalizedSku: string, excludeId?: string): void {
    const owner = this.findBySku(normalizedSku);
    if (owner && owner.id !== excludeId) {
      fail("DUPLICATE_SKU", `El sku "${normalizedSku}" ya pertenece a otro producto.`);
    }
  }

  private buildFilters(query: ListProductsQuery): ListFilters {
    const search = typeof query.search === "string" ? query.search.trim().toLowerCase() : "";
    const category =
      typeof query.category === "string" ? query.category.trim().toLowerCase() : "";
    const minPrice = normalizePriceBound(query.minPrice, "minPrice");
    const maxPrice = normalizePriceBound(query.maxPrice, "maxPrice");

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      fail("VALIDATION", "minPrice no puede ser mayor que maxPrice.");
    }

    return { search, category, active: query.active, minPrice, maxPrice };
  }

  private matchesFilters(product: Product, filters: ListFilters): boolean {
    if (filters.search && !product.name.toLowerCase().includes(filters.search)) {
      return false;
    }
    if (filters.category && (product.category ?? "").toLowerCase() !== filters.category) {
      return false;
    }
    if (filters.active !== undefined && product.active !== filters.active) {
      return false;
    }
    if (filters.minPrice !== undefined && product.price < filters.minPrice) {
      return false;
    }
    if (filters.maxPrice !== undefined && product.price > filters.maxPrice) {
      return false;
    }
    return true;
  }

  private compareByNameThenSku(a: Product, b: Product): number {
    const byName = a.name.localeCompare(b.name, "es", LOCALE_COMPARE_OPTIONS);
    if (byName !== 0) {
      return byName;
    }
    return a.sku.localeCompare(b.sku, "es", LOCALE_COMPARE_OPTIONS);
  }
}
