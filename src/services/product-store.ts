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
const NAME_MAX_LENGTH = 80;
const SKU_MIN_LENGTH = 2;
const SKU_MAX_LENGTH = 32;

function fail(code: ProductErrorCode, message: string): never {
  throw new ProductError(code, message);
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "name debe ser texto");
  const name = value.trim();
  if (name.length < 1 || name.length > NAME_MAX_LENGTH) {
    fail("VALIDATION", `name debe tener entre 1 y ${NAME_MAX_LENGTH} caracteres`);
  }
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "sku debe ser texto");
  const sku = value.trim().toUpperCase();
  if (sku.length < SKU_MIN_LENGTH || sku.length > SKU_MAX_LENGTH || !SKU_PATTERN.test(sku)) {
    fail("VALIDATION", "sku tiene un formato inválido");
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
  const category = value.trim();
  return category.length > 0 ? category : null;
}

function normalizeActive(value: unknown): boolean {
  if (typeof value !== "boolean") fail("VALIDATION", "active debe ser booleano");
  return value;
}

function normalizeFilterText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail("VALIDATION", `${field} debe ser texto`);
  const text = value.trim().toLowerCase();
  return text.length > 0 ? text : undefined;
}

function copy(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

function compareProducts(a: Product, b: Product): number {
  const byName = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  if (byName !== 0) return byName;
  return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
}

export class ProductStore {
  private readonly products = new Map<string, Product>();
  private readonly idsBySku = new Map<string, string>();

  create(input: CreateProductInput): Product {
    if (typeof input !== "object" || input === null) fail("VALIDATION", "input inválido");

    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = normalizePrice(input.price);
    const stock = input.stock === undefined ? 0 : normalizeStock(input.stock);
    const category = normalizeCategory(input.category);

    if (this.idsBySku.has(sku)) fail("DUPLICATE_SKU", `el sku ${sku} ya existe`);

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
    this.idsBySku.set(sku, product.id);
    return copy(product);
  }

  getById(id: string): Product | null {
    const product = typeof id === "string" ? this.products.get(id) : undefined;
    return product ? copy(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const id = this.idsBySku.get(sku.trim().toUpperCase());
    return id === undefined ? null : this.getById(id);
  }

  list(query: ListProductsQuery = {}): Product[] {
    const search = normalizeFilterText(query.search, "search");
    const category = normalizeFilterText(query.category, "category");
    const minPrice = query.minPrice === undefined ? undefined : normalizePrice(query.minPrice, "minPrice");
    const maxPrice = query.maxPrice === undefined ? undefined : normalizePrice(query.maxPrice, "maxPrice");
    const active = query.active === undefined ? undefined : normalizeActive(query.active);

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      fail("VALIDATION", "minPrice no puede ser mayor que maxPrice");
    }

    return [...this.products.values()]
      .filter((product) => search === undefined || product.name.toLowerCase().includes(search))
      .filter((product) => category === undefined || product.category?.toLowerCase() === category)
      .filter((product) => active === undefined || product.active === active)
      .filter((product) => minPrice === undefined || product.price >= minPrice)
      .filter((product) => maxPrice === undefined || product.price <= maxPrice)
      .sort(compareProducts)
      .map(copy);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) fail("NOT_FOUND", `no existe un producto con id ${id}`);
    if (typeof patch !== "object" || patch === null) fail("VALIDATION", "patch inválido");

    const changes: Partial<Product> = {};
    if (patch.name !== undefined) changes.name = normalizeName(patch.name);
    if (patch.sku !== undefined) changes.sku = normalizeSku(patch.sku);
    if (patch.price !== undefined) changes.price = normalizePrice(patch.price);
    if (patch.stock !== undefined) changes.stock = normalizeStock(patch.stock);
    if (patch.category !== undefined) changes.category = normalizeCategory(patch.category);
    if (patch.active !== undefined) changes.active = normalizeActive(patch.active);

    if (changes.sku !== undefined) {
      const owner = this.idsBySku.get(changes.sku);
      if (owner !== undefined && owner !== current.id) {
        fail("DUPLICATE_SKU", `el sku ${changes.sku} ya existe`);
      }
    }

    if (Object.keys(changes).length === 0) return copy(current);

    const updated: Product = { ...current, ...changes, updatedAt: new Date() };
    if (updated.sku !== current.sku) {
      this.idsBySku.delete(current.sku);
      this.idsBySku.set(updated.sku, updated.id);
    }
    this.products.set(updated.id, updated);
    return copy(updated);
  }

  remove(id: string): boolean {
    const product = typeof id === "string" ? this.products.get(id) : undefined;
    if (!product) return false;
    this.products.delete(product.id);
    this.idsBySku.delete(product.sku);
    return true;
  }

  adjustStock(id: string, delta: number): Product {
    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) fail("NOT_FOUND", `no existe un producto con id ${id}`);
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      fail("VALIDATION", "delta debe ser un entero distinto de cero");
    }

    const stock = current.stock + delta;
    if (stock < 0) fail("INSUFFICIENT_STOCK", "el stock no puede quedar por debajo de 0");

    const updated: Product = { ...current, stock, updatedAt: new Date() };
    this.products.set(updated.id, updated);
    return copy(updated);
  }
}
