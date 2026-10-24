import { randomUUID } from "node:crypto";

/**
 * Contrato del almacén de productos.
 * El comportamiento lo definen los tests de tests/practica-productos.
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
  if (typeof value !== "string") fail("VALIDATION", "name must be a string");
  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    fail("VALIDATION", "name must have between 1 and 80 characters");
  }
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "sku must be a string");
  const sku = value.trim().toUpperCase();
  if (sku.length < 2 || sku.length > 32 || !SKU_PATTERN.test(sku)) {
    fail("VALIDATION", "sku must have 2-32 characters (A-Z, 0-9 and single hyphens)");
  }
  return sku;
}

function validatePrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", "price must be a finite number greater than or equal to 0");
  }
  return value;
}

function validateStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail("VALIDATION", "stock must be an integer greater than or equal to 0");
  }
  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") fail("VALIDATION", "category must be a string or null");
  const category = value.trim();
  return category === "" ? null : category;
}

function copy(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

export class ProductStore {
  private readonly products = new Map<string, Product>();

  private findBySku(sku: string): Product | undefined {
    for (const product of this.products.values()) {
      if (product.sku === sku) return product;
    }
    return undefined;
  }

  create(input: CreateProductInput): Product {
    const data = (input ?? {}) as CreateProductInput;
    const name = normalizeName(data.name);
    const sku = normalizeSku(data.sku);
    const price = validatePrice(data.price);
    const stock = data.stock === undefined ? 0 : validateStock(data.stock);
    const category = normalizeCategory(data.category);

    if (this.findBySku(sku)) fail("DUPLICATE_SKU", `sku ${sku} already exists`);

    const now = new Date();
    const product: Product = {
      id: randomUUID(),
      name,
      sku,
      price,
      stock,
      category,
      active: true,
      createdAt: new Date(now.getTime()),
      updatedAt: new Date(now.getTime()),
    };
    this.products.set(product.id, product);
    return copy(product);
  }

  getById(id: string): Product | null {
    if (typeof id !== "string") return null;
    const product = this.products.get(id);
    return product ? copy(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const product = this.findBySku(sku.trim().toUpperCase());
    return product ? copy(product) : null;
  }

  list(query?: ListProductsQuery): Product[] {
    const q = query ?? {};

    for (const bound of [q.minPrice, q.maxPrice]) {
      if (bound !== undefined && (typeof bound !== "number" || !Number.isFinite(bound) || bound < 0)) {
        fail("VALIDATION", "price range must use finite numbers greater than or equal to 0");
      }
    }
    if (q.minPrice !== undefined && q.maxPrice !== undefined && q.minPrice > q.maxPrice) {
      fail("VALIDATION", "minPrice cannot be greater than maxPrice");
    }

    const search = typeof q.search === "string" ? q.search.trim().toLowerCase() : "";
    const category = typeof q.category === "string" ? q.category.trim().toLowerCase() : "";

    return [...this.products.values()]
      .filter((product) => {
        if (search && !product.name.toLowerCase().includes(search)) return false;
        if (category && (product.category ?? "").toLowerCase() !== category) return false;
        if (q.active !== undefined && product.active !== q.active) return false;
        if (q.minPrice !== undefined && product.price < q.minPrice) return false;
        if (q.maxPrice !== undefined && product.price > q.maxPrice) return false;
        return true;
      })
      .sort((a, b) => {
        const byName = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
        if (byName !== 0) return byName;
        return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
      })
      .map(copy);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) fail("NOT_FOUND", `product ${String(id)} not found`);

    const data = (patch ?? {}) as UpdateProductInput;
    const next: Product = copy(current);
    let changed = false;

    if (data.name !== undefined) {
      next.name = normalizeName(data.name);
      changed = true;
    }
    if (data.sku !== undefined) {
      next.sku = normalizeSku(data.sku);
      const owner = this.findBySku(next.sku);
      if (owner && owner.id !== current.id) fail("DUPLICATE_SKU", `sku ${next.sku} already exists`);
      changed = true;
    }
    if (data.price !== undefined) {
      next.price = validatePrice(data.price);
      changed = true;
    }
    if (data.stock !== undefined) {
      next.stock = validateStock(data.stock);
      changed = true;
    }
    if (data.category !== undefined) {
      next.category = normalizeCategory(data.category);
      changed = true;
    }
    if (data.active !== undefined) {
      if (typeof data.active !== "boolean") fail("VALIDATION", "active must be a boolean");
      next.active = data.active;
      changed = true;
    }

    if (!changed) return copy(current);

    next.updatedAt = new Date();
    this.products.set(current.id, next);
    return copy(next);
  }

  remove(id: string): boolean {
    if (typeof id !== "string") return false;
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      fail("VALIDATION", "delta must be a non-zero integer");
    }
    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) fail("NOT_FOUND", `product ${String(id)} not found`);

    const stock = current.stock + delta;
    if (stock < 0) fail("INSUFFICIENT_STOCK", "stock cannot go below 0");

    const next: Product = { ...copy(current), stock, updatedAt: new Date() };
    this.products.set(current.id, next);
    return copy(next);
  }
}
