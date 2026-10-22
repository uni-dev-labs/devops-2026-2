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
  if (name.length < 1 || name.length > 80) {
    fail("VALIDATION", "name debe tener entre 1 y 80 caracteres");
  }
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "sku debe ser texto");
  const sku = value.trim().toUpperCase();
  if (sku.length < 2 || sku.length > 32 || !SKU_PATTERN.test(sku)) {
    fail("VALIDATION", "sku inválido");
  }
  return sku;
}

function validatePrice(value: unknown, field = "price"): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", `${field} debe ser un número finito >= 0`);
  }
  return value;
}

function validateStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail("VALIDATION", "stock debe ser un entero >= 0");
  }
  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") fail("VALIDATION", "category debe ser texto");
  const category = value.trim();
  return category.length > 0 ? category : null;
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
    if (typeof input !== "object" || input === null) fail("VALIDATION", "input inválido");

    // Validar todo antes de guardar
    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = validatePrice(input.price);
    const stock = input.stock === undefined ? 0 : validateStock(input.stock);
    const category = normalizeCategory(input.category);

    if (this.findBySku(sku)) fail("DUPLICATE_SKU", `el sku ${sku} ya existe`);

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
    const normalized = sku.trim().toUpperCase();
    if (!normalized) return null;
    const product = this.findBySku(normalized);
    return product ? copy(product) : null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    const min = query.minPrice === undefined ? undefined : validatePrice(query.minPrice, "minPrice");
    const max = query.maxPrice === undefined ? undefined : validatePrice(query.maxPrice, "maxPrice");
    if (min !== undefined && max !== undefined && min > max) {
      fail("VALIDATION", "minPrice no puede ser mayor que maxPrice");
    }

    const search = typeof query.search === "string" ? query.search.trim().toLowerCase() : "";
    const category = typeof query.category === "string" ? query.category.trim().toLowerCase() : "";

    return [...this.products.values()]
      .filter((p) => !search || p.name.toLowerCase().includes(search))
      .filter((p) => !category || (p.category ?? "").toLowerCase() === category)
      .filter((p) => query.active === undefined || p.active === query.active)
      .filter((p) => min === undefined || p.price >= min)
      .filter((p) => max === undefined || p.price <= max)
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, "es", { sensitivity: "base" }) ||
          a.sku.localeCompare(b.sku),
      )
      .map(copy);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) fail("NOT_FOUND", `no existe el producto ${id}`);
    if (typeof patch !== "object" || patch === null) fail("VALIDATION", "patch inválido");

    // Construir el nuevo estado sin tocar el guardado
    const next: Product = { ...current };
    let changed = false;

    if (patch.name !== undefined) {
      next.name = normalizeName(patch.name);
      changed = true;
    }
    if (patch.sku !== undefined) {
      next.sku = normalizeSku(patch.sku);
      changed = true;
    }
    if (patch.price !== undefined) {
      next.price = validatePrice(patch.price);
      changed = true;
    }
    if (patch.stock !== undefined) {
      next.stock = validateStock(patch.stock);
      changed = true;
    }
    if (patch.category !== undefined) {
      next.category = normalizeCategory(patch.category);
      changed = true;
    }
    if (patch.active !== undefined) {
      if (typeof patch.active !== "boolean") fail("VALIDATION", "active debe ser booleano");
      next.active = patch.active;
      changed = true;
    }

    if (!changed) return copy(current);

    const owner = this.findBySku(next.sku);
    if (owner && owner.id !== current.id) fail("DUPLICATE_SKU", `el sku ${next.sku} ya existe`);

    next.createdAt = current.createdAt;
    next.updatedAt = new Date();
    this.products.set(current.id, next);
    return copy(next);
  }

  remove(id: string): boolean {
    if (typeof id !== "string") return false;
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) fail("NOT_FOUND", `no existe el producto ${id}`);
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      fail("VALIDATION", "delta debe ser un entero distinto de cero");
    }

    const stock = current.stock + delta;
    if (stock < 0) fail("INSUFFICIENT_STOCK", "stock insuficiente para el ajuste");

    const next: Product = { ...current, stock, updatedAt: new Date() };
    this.products.set(current.id, next);
    return copy(next);
  }
}