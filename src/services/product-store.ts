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

function normalizeName(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "El nombre debe ser texto");
  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    fail("VALIDATION", "El nombre debe tener entre 1 y 80 caracteres");
  }
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "El sku debe ser texto");
  const sku = value.trim().toUpperCase();
  if (sku.length < 2 || sku.length > 32 || !SKU_PATTERN.test(sku)) {
    fail("VALIDATION", "El sku no tiene un formato válido");
  }
  return sku;
}

function validatePrice(value: unknown, field = "price"): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", `${field} debe ser un número finito mayor o igual a 0`);
  }
  return value;
}

function validateStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail("VALIDATION", "El stock debe ser un entero mayor o igual a 0");
  }
  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") fail("VALIDATION", "La categoría debe ser texto o null");
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

  create(input: CreateProductInput): Product {
    if (typeof input !== "object" || input === null) {
      fail("VALIDATION", "Los datos del producto son obligatorios");
    }

    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = validatePrice(input.price);
    const stock = input.stock === undefined ? 0 : validateStock(input.stock);
    const category = normalizeCategory(input.category);

    if (this.findBySku(sku)) fail("DUPLICATE_SKU", `El sku ${sku} ya existe`);

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
    const product = this.products.get(id);
    return product ? copy(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const product = this.findBySku(sku.trim().toUpperCase());
    return product ? copy(product) : null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    const minPrice = query.minPrice === undefined ? undefined : validatePrice(query.minPrice, "minPrice");
    const maxPrice = query.maxPrice === undefined ? undefined : validatePrice(query.maxPrice, "maxPrice");
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      fail("VALIDATION", "minPrice no puede ser mayor que maxPrice");
    }

    const search = typeof query.search === "string" ? query.search.trim().toLowerCase() : "";
    const category = typeof query.category === "string" ? query.category.trim().toLowerCase() : "";

    return [...this.products.values()]
      .filter((product) => {
        if (search && !product.name.toLowerCase().includes(search)) return false;
        if (category && product.category?.toLowerCase() !== category) return false;
        if (query.active !== undefined && product.active !== query.active) return false;
        if (minPrice !== undefined && product.price < minPrice) return false;
        if (maxPrice !== undefined && product.price > maxPrice) return false;
        return true;
      })
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, "es", { sensitivity: "base" }) ||
          (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0),
      )
      .map(copy);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.products.get(id);
    if (!current) fail("NOT_FOUND", `No existe el producto ${id}`);
    if (typeof patch !== "object" || patch === null) {
      fail("VALIDATION", "El parche debe ser un objeto");
    }

    const changes: Partial<Product> = {};
    if (patch.name !== undefined) changes.name = normalizeName(patch.name);
    if (patch.sku !== undefined) {
      const sku = normalizeSku(patch.sku);
      const owner = this.findBySku(sku);
      if (owner && owner.id !== id) fail("DUPLICATE_SKU", `El sku ${sku} ya existe`);
      changes.sku = sku;
    }
    if (patch.price !== undefined) changes.price = validatePrice(patch.price);
    if (patch.stock !== undefined) changes.stock = validateStock(patch.stock);
    if (patch.category !== undefined) changes.category = normalizeCategory(patch.category);
    if (patch.active !== undefined) {
      if (typeof patch.active !== "boolean") fail("VALIDATION", "active debe ser booleano");
      changes.active = patch.active;
    }

    if (Object.keys(changes).length === 0) return copy(current);

    const updated: Product = { ...current, ...changes, updatedAt: new Date() };
    this.products.set(id, updated);
    return copy(updated);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.products.get(id);
    if (!current) fail("NOT_FOUND", `No existe el producto ${id}`);
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      fail("VALIDATION", "El ajuste debe ser un entero distinto de cero");
    }

    const stock = current.stock + delta;
    if (stock < 0) fail("INSUFFICIENT_STOCK", "No hay stock suficiente para el ajuste");

    const updated: Product = { ...current, stock, updatedAt: new Date() };
    this.products.set(id, updated);
    return copy(updated);
  }

  private findBySku(sku: string): Product | undefined {
    for (const product of this.products.values()) {
      if (product.sku === sku) return product;
    }
    return undefined;
  }
}
