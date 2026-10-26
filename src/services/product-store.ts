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

function fail(code: ProductErrorCode, message: string): never {
  throw new ProductError(code, message);
}

function cloneProduct(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

function normalizeName(name: unknown): string {
  if (typeof name !== "string") fail("VALIDATION", "name debe ser un texto");
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    fail("VALIDATION", "name debe tener entre 1 y 80 caracteres");
  }
  return trimmed;
}

function normalizeSku(sku: unknown): string {
  if (typeof sku !== "string") fail("VALIDATION", "sku debe ser un texto");
  const trimmed = sku.trim().toUpperCase();
  if (trimmed.length < 2 || trimmed.length > 32 || !SKU_PATTERN.test(trimmed)) {
    fail("VALIDATION", "sku inválido");
  }
  return trimmed;
}

function normalizePrice(price: unknown): number {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    fail("VALIDATION", "price debe ser un número finito mayor o igual a 0");
  }
  return price;
}

function normalizeStock(stock: unknown): number {
  if (stock === undefined) return 0;
  if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0) {
    fail("VALIDATION", "stock debe ser un entero mayor o igual a 0");
  }
  return stock;
}

function normalizeCategory(category: unknown): string | null {
  if (category === undefined || category === null) return null;
  if (typeof category !== "string") fail("VALIDATION", "category debe ser un texto o null");
  const trimmed = category.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeActiveFlag(active: unknown): boolean {
  if (typeof active !== "boolean") fail("VALIDATION", "active debe ser un booleano");
  return active;
}

function normalizePriceRangeBound(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", `${field} debe ser un número finito mayor o igual a 0`);
  }
  return value;
}

export class ProductStore {
  #products = new Map<string, Product>();

  #assertSkuAvailable(sku: string, excludeId?: string): void {
    for (const product of this.#products.values()) {
      if (product.sku === sku && product.id !== excludeId) {
        fail("DUPLICATE_SKU", `el sku ${sku} ya está en uso`);
      }
    }
  }

  create(input: CreateProductInput): Product {
    const name = normalizeName(input?.name);
    const sku = normalizeSku(input?.sku);
    const price = normalizePrice(input?.price);
    const stock = normalizeStock(input?.stock);
    const category = normalizeCategory(input?.category);

    this.#assertSkuAvailable(sku);

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
      updatedAt: new Date(now.getTime()),
    };

    this.#products.set(product.id, product);
    return cloneProduct(product);
  }

  getById(id: string): Product | null {
    const product = this.#products.get(id);
    return product ? cloneProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const normalized = sku.trim().toUpperCase();
    if (!normalized) return null;

    for (const product of this.#products.values()) {
      if (product.sku === normalized) return cloneProduct(product);
    }
    return null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    const search = typeof query.search === "string" ? query.search.trim().toLowerCase() : "";
    const category = typeof query.category === "string" ? query.category.trim().toLowerCase() : "";
    const active = query.active;
    const minPrice = normalizePriceRangeBound(query.minPrice, "minPrice");
    const maxPrice = normalizePriceRangeBound(query.maxPrice, "maxPrice");

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      fail("VALIDATION", "minPrice no puede ser mayor que maxPrice");
    }

    const results = [...this.#products.values()].filter((product) => {
      if (search && !product.name.toLowerCase().includes(search)) return false;
      if (category && (product.category ?? "").toLowerCase() !== category) return false;
      if (active !== undefined && product.active !== active) return false;
      if (minPrice !== undefined && product.price < minPrice) return false;
      if (maxPrice !== undefined && product.price > maxPrice) return false;
      return true;
    });

    results.sort((a, b) => {
      const byName = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      return byName !== 0 ? byName : a.sku.localeCompare(b.sku, "es", { sensitivity: "base" });
    });

    return results.map(cloneProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.#products.get(id);
    if (!current) fail("NOT_FOUND", `no existe un producto con id ${id}`);

    const hasChanges = Object.values(patch ?? {}).some((value) => value !== undefined);
    if (!hasChanges) return cloneProduct(current);

    const name = patch.name !== undefined ? normalizeName(patch.name) : current.name;
    const sku = patch.sku !== undefined ? normalizeSku(patch.sku) : current.sku;
    const price = patch.price !== undefined ? normalizePrice(patch.price) : current.price;
    const stock = patch.stock !== undefined ? normalizeStock(patch.stock) : current.stock;
    const category =
      patch.category !== undefined ? normalizeCategory(patch.category) : current.category;
    const active = patch.active !== undefined ? normalizeActiveFlag(patch.active) : current.active;

    this.#assertSkuAvailable(sku, id);

    const updated: Product = {
      ...current,
      name,
      sku,
      price,
      stock,
      category,
      active,
      updatedAt: new Date(),
    };

    this.#products.set(id, updated);
    return cloneProduct(updated);
  }

  remove(id: string): boolean {
    return this.#products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.#products.get(id);
    if (!current) fail("NOT_FOUND", `no existe un producto con id ${id}`);

    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      fail("VALIDATION", "delta debe ser un entero distinto de cero");
    }

    const nextStock = current.stock + delta;
    if (nextStock < 0) {
      fail("INSUFFICIENT_STOCK", "el ajuste dejaría el stock por debajo de cero");
    }

    const updated: Product = {
      ...current,
      stock: nextStock,
      updatedAt: new Date(),
    };

    this.#products.set(id, updated);
    return cloneProduct(updated);
  }
}
