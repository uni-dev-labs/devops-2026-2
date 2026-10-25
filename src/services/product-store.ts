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

const NAME_MAX_LENGTH = 80;
const SKU_MIN_LENGTH = 2;
const SKU_MAX_LENGTH = 32;
const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function invalid(message: string): never {
  throw new ProductError("VALIDATION", message);
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") invalid("El nombre debe ser texto");
  const name = value.trim();
  if (name.length < 1 || name.length > NAME_MAX_LENGTH) {
    invalid(`El nombre debe tener entre 1 y ${NAME_MAX_LENGTH} caracteres`);
  }
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") invalid("El sku debe ser texto");
  const sku = value.trim().toUpperCase();
  if (sku.length < SKU_MIN_LENGTH || sku.length > SKU_MAX_LENGTH) {
    invalid(`El sku debe tener entre ${SKU_MIN_LENGTH} y ${SKU_MAX_LENGTH} caracteres`);
  }
  if (!SKU_PATTERN.test(sku)) invalid("El sku tiene un formato inválido");
  return sku;
}

function normalizePrice(value: unknown, field = "price"): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid(`${field} debe ser un número finito mayor o igual a 0`);
  }
  return value;
}

function normalizeStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    invalid("El stock debe ser un entero mayor o igual a 0");
  }
  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") invalid("La categoría debe ser texto o null");
  const category = value.trim();
  return category.length > 0 ? category : null;
}

function normalizeActive(value: unknown): boolean {
  if (typeof value !== "boolean") invalid("active debe ser booleano");
  return value;
}

function normalizeFilter(value: unknown, field: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") invalid(`${field} debe ser texto`);
  const text = value.trim().toLowerCase();
  return text.length > 0 ? text : null;
}

function clone(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

const nameCollator = new Intl.Collator("es", { sensitivity: "base" });

export class ProductStore {
  private readonly products = new Map<string, Product>();

  create(input: CreateProductInput): Product {
    if (typeof input !== "object" || input === null) invalid("El producto debe ser un objeto");

    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = normalizePrice(input.price);
    const stock = input.stock === undefined ? 0 : normalizeStock(input.stock);
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
      updatedAt: new Date(now.getTime()),
    };
    this.products.set(product.id, product);
    return clone(product);
  }

  getById(id: string): Product | null {
    const product = this.products.get(id);
    return product ? clone(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const product = this.findBySku(sku.trim().toUpperCase());
    return product ? clone(product) : null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    const search = normalizeFilter(query.search, "search");
    const category = normalizeFilter(query.category, "category");
    const active = query.active === undefined ? undefined : normalizeActive(query.active);
    const minPrice = query.minPrice === undefined ? undefined : normalizePrice(query.minPrice, "minPrice");
    const maxPrice = query.maxPrice === undefined ? undefined : normalizePrice(query.maxPrice, "maxPrice");
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      invalid("minPrice no puede ser mayor que maxPrice");
    }

    return [...this.products.values()]
      .filter((product) => search === null || product.name.toLowerCase().includes(search))
      .filter((product) => category === null || product.category?.toLowerCase() === category)
      .filter((product) => active === undefined || product.active === active)
      .filter((product) => minPrice === undefined || product.price >= minPrice)
      .filter((product) => maxPrice === undefined || product.price <= maxPrice)
      .sort((a, b) => nameCollator.compare(a.name, b.name) || (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0))
      .map(clone);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.requireProduct(id);
    if (typeof patch !== "object" || patch === null) invalid("El parche debe ser un objeto");

    const changes: Partial<Product> = {};
    if (patch.name !== undefined) changes.name = normalizeName(patch.name);
    if (patch.sku !== undefined) changes.sku = normalizeSku(patch.sku);
    if (patch.price !== undefined) changes.price = normalizePrice(patch.price);
    if (patch.stock !== undefined) changes.stock = normalizeStock(patch.stock);
    if (patch.category !== undefined) changes.category = normalizeCategory(patch.category);
    if (patch.active !== undefined) changes.active = normalizeActive(patch.active);
    if (changes.sku !== undefined) this.assertSkuAvailable(changes.sku, current.id);

    if (Object.keys(changes).length === 0) return clone(current);

    const updated: Product = { ...current, ...changes, updatedAt: new Date() };
    this.products.set(id, updated);
    return clone(updated);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.requireProduct(id);
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      invalid("El ajuste debe ser un entero distinto de cero");
    }

    const stock = current.stock + delta;
    if (stock < 0) {
      throw new ProductError("INSUFFICIENT_STOCK", "El ajuste dejaría el stock por debajo de 0");
    }

    const updated: Product = { ...current, stock, updatedAt: new Date() };
    this.products.set(id, updated);
    return clone(updated);
  }

  private requireProduct(id: string): Product {
    const product = this.products.get(id);
    if (!product) throw new ProductError("NOT_FOUND", `No existe un producto con id ${id}`);
    return product;
  }

  private findBySku(sku: string): Product | undefined {
    for (const product of this.products.values()) {
      if (product.sku === sku) return product;
    }
    return undefined;
  }

  private assertSkuAvailable(sku: string, ownerId?: string): void {
    const existing = this.findBySku(sku);
    if (existing && existing.id !== ownerId) {
      throw new ProductError("DUPLICATE_SKU", `El sku ${sku} ya pertenece a otro producto`);
    }
  }
}
