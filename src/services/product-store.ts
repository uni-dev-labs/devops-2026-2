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

import { randomUUID } from "node:crypto";

const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const NAME_MAX = 80;
const SKU_MIN = 2;
const SKU_MAX = 32;

function fail(code: ProductErrorCode, message: string): never {
  throw new ProductError(code, message);
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "El nombre debe ser texto.");
  const name = value.trim();
  if (name.length < 1 || name.length > NAME_MAX) {
    fail("VALIDATION", `El nombre debe tener entre 1 y ${NAME_MAX} caracteres.`);
  }
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "El sku debe ser texto.");
  const sku = value.trim().toUpperCase();
  if (sku.length < SKU_MIN || sku.length > SKU_MAX || !SKU_PATTERN.test(sku)) {
    fail(
      "VALIDATION",
      `El sku debe tener entre ${SKU_MIN} y ${SKU_MAX} caracteres (letras, números y guiones intermedios).`,
    );
  }
  return sku;
}

function validatePrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", "El precio debe ser un número finito mayor o igual a 0.");
  }
  return value;
}

function validateStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail("VALIDATION", "El stock debe ser un entero mayor o igual a 0.");
  }
  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") fail("VALIDATION", "La categoría debe ser texto.");
  const category = value.trim();
  return category === "" ? null : category;
}

function validateActive(value: unknown): boolean {
  if (typeof value !== "boolean") fail("VALIDATION", "El campo active debe ser booleano.");
  return value;
}

function clone(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

function optionalPrice(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", `${label} debe ser un número finito mayor o igual a 0.`);
  }
  return value;
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail("VALIDATION", `${label} debe ser texto.`);
  const text = value.trim();
  return text === "" ? undefined : text;
}

export class ProductStore {
  private readonly products = new Map<string, Product>();

  create(input: CreateProductInput): Product {
    if (typeof input !== "object" || input === null) {
      fail("VALIDATION", "Los datos del producto son obligatorios.");
    }

    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = validatePrice(input.price);
    const stock = input.stock === undefined ? 0 : validateStock(input.stock);
    const category = normalizeCategory(input.category);

    if (this.findBySku(sku)) {
      fail("DUPLICATE_SKU", `Ya existe un producto con el sku ${sku}.`);
    }

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
    return clone(product);
  }

  getById(id: string): Product | null {
    if (typeof id !== "string") return null;
    const product = this.products.get(id);
    return product ? clone(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const product = this.findBySku(sku.trim().toUpperCase());
    return product ? clone(product) : null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    const q = query ?? {};
    const search = optionalText(q.search, "La búsqueda")?.toLowerCase();
    const category = optionalText(q.category, "La categoría")?.toLowerCase();
    const minPrice = optionalPrice(q.minPrice, "minPrice");
    const maxPrice = optionalPrice(q.maxPrice, "maxPrice");
    const active = q.active === undefined ? undefined : validateActive(q.active);

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      fail("VALIDATION", "minPrice no puede ser mayor que maxPrice.");
    }

    return [...this.products.values()]
      .filter((p) => {
        if (search !== undefined && !p.name.toLowerCase().includes(search)) return false;
        if (category !== undefined && (p.category ?? "").toLowerCase() !== category) return false;
        if (active !== undefined && p.active !== active) return false;
        if (minPrice !== undefined && p.price < minPrice) return false;
        if (maxPrice !== undefined && p.price > maxPrice) return false;
        return true;
      })
      .sort((a, b) => {
        const byName = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
        if (byName !== 0) return byName;
        return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
      })
      .map(clone);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) fail("NOT_FOUND", "No existe un producto con ese id.");

    if (patch === undefined || patch === null) return clone(current);
    if (typeof patch !== "object") fail("VALIDATION", "El parche debe ser un objeto.");

    // Validar todo antes de tocar el producto guardado.
    const next: Product = clone(current);
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
      next.active = validateActive(patch.active);
      changed = true;
    }

    if (!changed) return clone(current);

    const owner = this.findBySku(next.sku);
    if (owner && owner.id !== current.id) {
      fail("DUPLICATE_SKU", `Ya existe un producto con el sku ${next.sku}.`);
    }

    next.updatedAt = new Date();
    this.products.set(next.id, next);
    return clone(next);
  }

  remove(id: string): boolean {
    if (typeof id !== "string") return false;
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      fail("VALIDATION", "El ajuste debe ser un entero distinto de cero.");
    }

    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) fail("NOT_FOUND", "No existe un producto con ese id.");

    const newStock = current.stock + delta;
    if (newStock < 0) {
      fail("INSUFFICIENT_STOCK", "El ajuste dejaría el stock por debajo de 0.");
    }

    const next: Product = { ...clone(current), stock: newStock, updatedAt: new Date() };
    this.products.set(next.id, next);
    return clone(next);
  }

  private findBySku(normalizedSku: string): Product | undefined {
    for (const product of this.products.values()) {
      if (product.sku === normalizedSku) return product;
    }
    return undefined;
  }
}
