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

function validation(message: string): never {
  throw new ProductError("VALIDATION", message);
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") validation("El nombre debe ser texto.");
  const name = value.trim();
  if (name.length < 1 || name.length > 80) validation("El nombre debe tener entre 1 y 80 caracteres.");
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") validation("El SKU debe ser texto.");
  const sku = value.trim().toUpperCase();
  if (sku.length < 2 || sku.length > 32 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(sku)) {
    validation("El SKU tiene un formato inválido.");
  }
  return sku;
}

function validatePrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    validation("El precio debe ser un número finito mayor o igual a cero.");
  }
  return value;
}

function validateStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    validation("El stock debe ser un entero mayor o igual a cero.");
  }
  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") validation("La categoría debe ser texto o null.");
  return value.trim() || null;
}

function validateActive(value: unknown): boolean {
  if (typeof value !== "boolean") validation("Activo debe ser un booleano.");
  return value;
}

function normalizeFilter(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string") validation("El filtro debe ser texto.");
  return value.trim().toLowerCase();
}

function copyProduct(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

export class ProductStore {
  private readonly products = new Map<string, Product>();

  private ensureUniqueSku(sku: string, exceptId?: string): void {
    for (const product of this.products.values()) {
      if (product.sku === sku && product.id !== exceptId) {
        throw new ProductError("DUPLICATE_SKU", "El SKU ya pertenece a otro producto.");
      }
    }
  }

  private requireProduct(id: string): Product {
    const product = this.products.get(id);
    if (!product) throw new ProductError("NOT_FOUND", "El producto no existe.");
    return product;
  }

  create(input: CreateProductInput): Product {
    if (!input || typeof input !== "object") validation("Los datos del producto son inválidos.");
    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = validatePrice(input.price);
    const stock = input.stock === undefined ? 0 : validateStock(input.stock);
    const category = normalizeCategory(input.category);
    this.ensureUniqueSku(sku);

    const now = new Date();
    const product: Product = {
      id: randomUUID(), name, sku, price, stock, category, active: true,
      createdAt: now, updatedAt: new Date(now.getTime()),
    };
    this.products.set(product.id, product);
    return copyProduct(product);
  }

  getById(id: string): Product | null {
    const product = this.products.get(id);
    return product ? copyProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") validation("El SKU debe ser texto.");
    const normalized = sku.trim().toUpperCase();
    for (const product of this.products.values()) {
      if (product.sku === normalized) return copyProduct(product);
    }
    return null;
  }

  list(query?: ListProductsQuery): Product[] {
    const filters = query === undefined ? {} : query;
    if (!filters || typeof filters !== "object") validation("Los filtros son inválidos.");
    const search = normalizeFilter(filters.search);
    const category = normalizeFilter(filters.category);
    const active = filters.active === undefined ? undefined : validateActive(filters.active);
    const min = filters.minPrice === undefined ? undefined : validatePrice(filters.minPrice);
    const max = filters.maxPrice === undefined ? undefined : validatePrice(filters.maxPrice);
    if (min !== undefined && max !== undefined && min > max) {
      validation("El precio mínimo no puede superar al máximo.");
    }

    return [...this.products.values()]
      .filter(product =>
        (!search || product.name.toLowerCase().includes(search)) &&
        (!category || product.category?.toLowerCase() === category) &&
        (active === undefined || product.active === active) &&
        (min === undefined || product.price >= min) &&
        (max === undefined || product.price <= max))
      .sort((a, b) =>
        a.name.localeCompare(b.name, "es", { sensitivity: "base" }) ||
        a.sku.localeCompare(b.sku, "es", { sensitivity: "base" }))
      .map(copyProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.requireProduct(id);
    if (!patch || typeof patch !== "object") validation("El parche es inválido.");
    const next = { ...current };
    let hasFields = false;
    if (patch.name !== undefined) { next.name = normalizeName(patch.name); hasFields = true; }
    if (patch.sku !== undefined) { next.sku = normalizeSku(patch.sku); hasFields = true; }
    if (patch.price !== undefined) { next.price = validatePrice(patch.price); hasFields = true; }
    if (patch.stock !== undefined) { next.stock = validateStock(patch.stock); hasFields = true; }
    if (patch.category !== undefined) { next.category = normalizeCategory(patch.category); hasFields = true; }
    if (patch.active !== undefined) { next.active = validateActive(patch.active); hasFields = true; }
    this.ensureUniqueSku(next.sku, id);
    if (!hasFields) return copyProduct(current);
    next.updatedAt = new Date();
    this.products.set(id, next);
    return copyProduct(next);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.requireProduct(id);
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      validation("El ajuste debe ser un entero distinto de cero.");
    }
    const stock = current.stock + delta;
    if (stock < 0) {
      throw new ProductError("INSUFFICIENT_STOCK", "El ajuste dejaría el stock por debajo de cero.");
    }
    validateStock(stock);
    const next = { ...current, stock, updatedAt: new Date() };
    this.products.set(id, next);
    return copyProduct(next);
  }
}
