import { randomUUID } from "node:crypto";

/**
 * Contrato del almacén de productos.
 * El comportamiento lo definen los tests de tests/practica-productos.
 * Implementen los métodos. No cambien las firmas ni los códigos de ProductError.
 */

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

function fail(code: ProductErrorCode, message: string): never {
  throw new ProductError(code, message);
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "name debe ser texto");
  const name = value.trim();
  if (name.length < 1 || name.length > 80) fail("VALIDATION", "name debe tener entre 1 y 80 caracteres");
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "sku debe ser texto");
  const sku = value.trim().toUpperCase();
  if (sku.length < 2 || sku.length > 32 || !SKU_PATTERN.test(sku)) {
    fail("VALIDATION", "sku debe tener 2 a 32 caracteres y el formato ABC-123");
  }
  return sku;
}

function normalizePrice(value: unknown, field = "price"): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", `${field} debe ser un número finito mayor o igual a 0`);
  }
  return value;
}

function normalizeStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail("VALIDATION", "stock debe ser un entero mayor o igual a 0");
  }
  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") fail("VALIDATION", "category debe ser texto o null");
  return value.trim() || null;
}

function copy(product: Product): Product {
  return { ...product, createdAt: new Date(product.createdAt), updatedAt: new Date(product.updatedAt) };
}

export class ProductStore {
  private readonly products = new Map<string, Product>();

  create(input: CreateProductInput): Product {
    const name = normalizeName(input?.name);
    const sku = normalizeSku(input?.sku);
    const price = normalizePrice(input?.price);
    const stock = input?.stock === undefined ? 0 : normalizeStock(input.stock);
    const category = normalizeCategory(input?.category);
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
    this.products.set(product.id, product);
    return copy(product);
  }

  getById(id: string): Product | null {
    const product = this.products.get(id);
    return product ? copy(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const product = this.findBySku(sku.trim().toUpperCase());
    return product ? copy(product) : null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    const minPrice = query.minPrice === undefined ? undefined : normalizePrice(query.minPrice, "minPrice");
    const maxPrice = query.maxPrice === undefined ? undefined : normalizePrice(query.maxPrice, "maxPrice");
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      fail("VALIDATION", "minPrice no puede ser mayor que maxPrice");
    }
    const search = typeof query.search === "string" ? query.search.trim().toLowerCase() : "";
    const category = typeof query.category === "string" ? query.category.trim().toLowerCase() : "";

    return [...this.products.values()]
      .filter((product) => !search || product.name.toLowerCase().includes(search))
      .filter((product) => !category || product.category?.toLowerCase() === category)
      .filter((product) => query.active === undefined || product.active === query.active)
      .filter((product) => minPrice === undefined || product.price >= minPrice)
      .filter((product) => maxPrice === undefined || product.price <= maxPrice)
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, "es", { sensitivity: "base" }) ||
          (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0),
      )
      .map(copy);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.products.get(id);
    if (!current) fail("NOT_FOUND", `No existe un producto con id ${id}`);

    // Validar todo antes de escribir: si algo falla, el producto queda intacto.
    const next: Product = { ...current };
    let changed = false;
    if (patch.name !== undefined) { next.name = normalizeName(patch.name); changed = true; }
    if (patch.sku !== undefined) { next.sku = normalizeSku(patch.sku); changed = true; }
    if (patch.price !== undefined) { next.price = normalizePrice(patch.price); changed = true; }
    if (patch.stock !== undefined) { next.stock = normalizeStock(patch.stock); changed = true; }
    if (patch.category !== undefined) { next.category = normalizeCategory(patch.category); changed = true; }
    if (patch.active !== undefined) {
      if (typeof patch.active !== "boolean") fail("VALIDATION", "active debe ser booleano");
      next.active = patch.active;
      changed = true;
    }
    if (!changed) return copy(current);

    this.assertSkuAvailable(next.sku, id);
    next.updatedAt = new Date();
    this.products.set(id, next);
    return copy(next);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.products.get(id);
    if (!current) fail("NOT_FOUND", `No existe un producto con id ${id}`);
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      fail("VALIDATION", "delta debe ser un entero distinto de cero");
    }
    const stock = current.stock + delta;
    if (stock < 0) fail("INSUFFICIENT_STOCK", `Stock insuficiente: hay ${current.stock}, se pidió ${-delta}`);

    const next: Product = { ...current, stock, updatedAt: new Date() };
    this.products.set(id, next);
    return copy(next);
  }

  private findBySku(sku: string): Product | undefined {
    for (const product of this.products.values()) {
      if (product.sku === sku) return product;
    }
    return undefined;
  }

  private assertSkuAvailable(sku: string, ownerId?: string): void {
    const existing = this.findBySku(sku);
    if (existing && existing.id !== ownerId) fail("DUPLICATE_SKU", `El sku ${sku} ya está en uso`);
  }
}
