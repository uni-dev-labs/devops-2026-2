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

const NAME_MAX = 80;
const SKU_MIN = 2;
const SKU_MAX = 32;
const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function fail(code: ProductErrorCode, message: string): never {
  throw new ProductError(code, message);
}

function copy(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

function parseName(value: unknown): string {
  if (typeof value !== "string") {
    fail("VALIDATION", "El nombre es obligatorio y debe ser texto");
  }
  const name = value.trim();
  if (name.length < 1 || name.length > NAME_MAX) {
    fail("VALIDATION", `El nombre debe tener entre 1 y ${NAME_MAX} caracteres`);
  }
  return name;
}

function parseSku(value: unknown): string {
  if (typeof value !== "string") {
    fail("VALIDATION", "El sku es obligatorio y debe ser texto");
  }
  const sku = normalizeSku(value);
  if (sku.length < SKU_MIN || sku.length > SKU_MAX || !SKU_PATTERN.test(sku)) {
    fail("VALIDATION", `El sku debe tener entre ${SKU_MIN} y ${SKU_MAX} caracteres y formato válido`);
  }
  return sku;
}

function parsePrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", "El precio debe ser un número finito mayor o igual a 0");
  }
  return value;
}

function parseStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail("VALIDATION", "El stock debe ser un entero mayor o igual a 0");
  }
  return value;
}

function parseCategory(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    fail("VALIDATION", "La categoría debe ser texto");
  }
  const category = value.trim();
  return category.length > 0 ? category : null;
}

function parseActive(value: unknown): boolean {
  if (typeof value !== "boolean") {
    fail("VALIDATION", "El campo active debe ser booleano");
  }
  return value;
}

function parsePriceBound(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", `${field} debe ser un número finito mayor o igual a 0`);
  }
  return value;
}

function textFilter(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const text = value.trim().toLowerCase();
  return text.length > 0 ? text : undefined;
}

export class ProductStore {
  private readonly products = new Map<string, Product>();

  create(input: CreateProductInput): Product {
    if (typeof input !== "object" || input === null) {
      fail("VALIDATION", "Los datos del producto son obligatorios");
    }

    const name = parseName(input.name);
    const sku = parseSku(input.sku);
    const price = parsePrice(input.price);
    const stock = input.stock === undefined ? 0 : parseStock(input.stock);
    const category = parseCategory(input.category);
    this.ensureSkuAvailable(sku);

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
    const product = typeof id === "string" ? this.products.get(id) : undefined;
    return product ? copy(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") {
      return null;
    }
    const product = this.findBySku(normalizeSku(sku));
    return product ? copy(product) : null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    const minPrice = parsePriceBound(query.minPrice, "minPrice");
    const maxPrice = parsePriceBound(query.maxPrice, "maxPrice");
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      fail("VALIDATION", "minPrice no puede ser mayor que maxPrice");
    }
    const search = textFilter(query.search);
    const category = textFilter(query.category);

    return [...this.products.values()]
      .filter((product) => {
        if (search !== undefined && !product.name.toLowerCase().includes(search)) return false;
        if (category !== undefined && product.category?.toLowerCase() !== category) return false;
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
    const current = this.require(id);
    if (typeof patch !== "object" || patch === null) {
      fail("VALIDATION", "El parche debe ser un objeto");
    }

    const changes: Partial<Product> = {};
    if (patch.name !== undefined) changes.name = parseName(patch.name);
    if (patch.sku !== undefined) changes.sku = parseSku(patch.sku);
    if (patch.price !== undefined) changes.price = parsePrice(patch.price);
    if (patch.stock !== undefined) changes.stock = parseStock(patch.stock);
    if (patch.category !== undefined) changes.category = parseCategory(patch.category);
    if (patch.active !== undefined) changes.active = parseActive(patch.active);

    if (Object.keys(changes).length === 0) {
      return copy(current);
    }
    if (changes.sku !== undefined) {
      this.ensureSkuAvailable(changes.sku, current.id);
    }

    const updated: Product = { ...current, ...changes, updatedAt: new Date() };
    this.products.set(updated.id, updated);
    return copy(updated);
  }

  remove(id: string): boolean {
    return typeof id === "string" && this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.require(id);
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      fail("VALIDATION", "El ajuste debe ser un entero distinto de cero");
    }

    const stock = current.stock + delta;
    if (stock < 0) {
      fail("INSUFFICIENT_STOCK", `Stock insuficiente: hay ${current.stock} y se pidió ${-delta}`);
    }

    const updated: Product = { ...current, stock, updatedAt: new Date() };
    this.products.set(updated.id, updated);
    return copy(updated);
  }

  private require(id: string): Product {
    const product = typeof id === "string" ? this.products.get(id) : undefined;
    if (!product) {
      fail("NOT_FOUND", `No existe un producto con id ${String(id)}`);
    }
    return product;
  }

  private findBySku(sku: string): Product | undefined {
    for (const product of this.products.values()) {
      if (product.sku === sku) return product;
    }
    return undefined;
  }

  private ensureSkuAvailable(sku: string, ownerId?: string): void {
    const existing = this.findBySku(sku);
    if (existing && existing.id !== ownerId) {
      fail("DUPLICATE_SKU", `El sku ${sku} ya pertenece a otro producto`);
    }
  }
}
