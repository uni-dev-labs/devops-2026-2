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

function clone(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

function parseName(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "El nombre es obligatorio");
  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    fail("VALIDATION", "El nombre debe tener entre 1 y 80 caracteres");
  }
  return name;
}

function normalizeSku(value: string): string {
  return value.trim().toUpperCase();
}

function parseSku(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "El sku es obligatorio");
  const sku = normalizeSku(value);
  if (sku.length < 2 || sku.length > 32 || !SKU_PATTERN.test(sku)) {
    fail("VALIDATION", "El sku debe tener de 2 a 32 caracteres y formato válido (A-Z, 0-9 y guiones)");
  }
  return sku;
}

function parsePrice(value: unknown, label = "El precio"): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", `${label} debe ser un número finito mayor o igual a 0`);
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
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") fail("VALIDATION", "La categoría debe ser texto");
  const category = value.trim();
  return category === "" ? null : category;
}

function parseActive(value: unknown): boolean {
  if (typeof value !== "boolean") fail("VALIDATION", "active debe ser verdadero o falso");
  return value;
}

function parseTextFilter(value: unknown, label: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") fail("VALIDATION", `${label} debe ser texto`);
  const text = value.trim().toLowerCase();
  return text === "" ? null : text;
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
    if (input === null || typeof input !== "object") {
      fail("VALIDATION", "Los datos del producto son obligatorios");
    }

    const name = parseName(input.name);
    const sku = parseSku(input.sku);
    const price = parsePrice(input.price);
    const stock = input.stock === undefined ? 0 : parseStock(input.stock);
    const category = parseCategory(input.category);

    if (this.findBySku(sku)) fail("DUPLICATE_SKU", `Ya existe un producto con el sku ${sku}`);

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
    const product = this.findBySku(normalizeSku(sku));
    return product ? clone(product) : null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    const search = parseTextFilter(query.search, "search");
    const category = parseTextFilter(query.category, "category");
    const active = query.active === undefined ? undefined : parseActive(query.active);
    const minPrice = query.minPrice === undefined ? undefined : parsePrice(query.minPrice, "minPrice");
    const maxPrice = query.maxPrice === undefined ? undefined : parsePrice(query.maxPrice, "maxPrice");
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      fail("VALIDATION", "minPrice no puede ser mayor que maxPrice");
    }

    return [...this.products.values()]
      .filter((product) => {
        if (search !== null && !product.name.toLowerCase().includes(search)) return false;
        if (category !== null && product.category?.toLowerCase() !== category) return false;
        if (active !== undefined && product.active !== active) return false;
        if (minPrice !== undefined && product.price < minPrice) return false;
        if (maxPrice !== undefined && product.price > maxPrice) return false;
        return true;
      })
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, "es", { sensitivity: "base" }) ||
          (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0),
      )
      .map(clone);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.products.get(id);
    if (!current) fail("NOT_FOUND", "Producto no encontrado");
    if (patch === null || typeof patch !== "object") {
      fail("VALIDATION", "El parche es obligatorio");
    }

    // Se valida todo antes de tocar el producto guardado.
    const changes: Partial<Product> = {};
    if (patch.name !== undefined) changes.name = parseName(patch.name);
    if (patch.sku !== undefined) {
      const sku = parseSku(patch.sku);
      const owner = this.findBySku(sku);
      if (owner && owner.id !== current.id) {
        fail("DUPLICATE_SKU", `Ya existe un producto con el sku ${sku}`);
      }
      changes.sku = sku;
    }
    if (patch.price !== undefined) changes.price = parsePrice(patch.price);
    if (patch.stock !== undefined) changes.stock = parseStock(patch.stock);
    if (patch.category !== undefined) changes.category = parseCategory(patch.category);
    if (patch.active !== undefined) changes.active = parseActive(patch.active);

    if (Object.keys(changes).length === 0) return clone(current);

    Object.assign(current, changes, { updatedAt: new Date() });
    return clone(current);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      fail("VALIDATION", "El ajuste debe ser un entero distinto de cero");
    }
    const current = this.products.get(id);
    if (!current) fail("NOT_FOUND", "Producto no encontrado");

    const stock = current.stock + delta;
    if (stock < 0) fail("INSUFFICIENT_STOCK", "Stock insuficiente para el ajuste");

    current.stock = stock;
    current.updatedAt = new Date();
    return clone(current);
  }
}
