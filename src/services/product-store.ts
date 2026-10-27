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

function invalid(message: string): never {
  throw new ProductError("VALIDATION", message);
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") invalid("El nombre debe ser texto");
  const name = value.trim();
  if (name.length < 1 || name.length > 80) invalid("El nombre debe tener entre 1 y 80 caracteres");
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") invalid("El sku debe ser texto");
  const sku = value.trim().toUpperCase();
  if (sku.length < 2 || sku.length > 32 || !SKU_PATTERN.test(sku)) invalid("El sku no es válido");
  return sku;
}

function normalizePrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid("El precio debe ser un número finito mayor o igual a 0");
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
  if (typeof value !== "string") invalid("La categoría debe ser texto");
  const category = value.trim();
  return category.length === 0 ? null : category;
}

function validateRangeValue(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid(`${label} debe ser un número finito mayor o igual a 0`);
  }
  return value;
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
    if (input === null || typeof input !== "object") invalid("Los datos del producto son obligatorios");

    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = normalizePrice(input.price);
    const stock = input.stock === undefined ? 0 : normalizeStock(input.stock);
    const category = normalizeCategory(input.category);

    if (this.findBySku(sku)) throw new ProductError("DUPLICATE_SKU", `El sku ${sku} ya existe`);

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
    const minPrice = validateRangeValue(query.minPrice, "minPrice");
    const maxPrice = validateRangeValue(query.maxPrice, "maxPrice");
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      invalid("minPrice no puede ser mayor que maxPrice");
    }

    const search = typeof query.search === "string" ? query.search.trim().toLowerCase() : "";
    const category = typeof query.category === "string" ? query.category.trim().toLowerCase() : "";

    return [...this.products.values()]
      .filter((product) => {
        if (search && !product.name.toLowerCase().includes(search)) return false;
        if (category && (product.category ?? "").toLowerCase() !== category) return false;
        if (query.active !== undefined && product.active !== query.active) return false;
        if (minPrice !== undefined && product.price < minPrice) return false;
        if (maxPrice !== undefined && product.price > maxPrice) return false;
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
    const current = this.products.get(id);
    if (!current) throw new ProductError("NOT_FOUND", `No existe el producto ${id}`);
    if (patch === null || typeof patch !== "object") invalid("El parche debe ser un objeto");

    const next: Product = copy(current);
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
      next.price = normalizePrice(patch.price);
      changed = true;
    }
    if (patch.stock !== undefined) {
      next.stock = normalizeStock(patch.stock);
      changed = true;
    }
    if (patch.category !== undefined) {
      next.category = normalizeCategory(patch.category);
      changed = true;
    }
    if (patch.active !== undefined) {
      if (typeof patch.active !== "boolean") invalid("active debe ser booleano");
      next.active = patch.active;
      changed = true;
    }

    if (!changed) return copy(current);

    const owner = this.findBySku(next.sku);
    if (owner && owner.id !== id) {
      throw new ProductError("DUPLICATE_SKU", `El sku ${next.sku} ya existe`);
    }

    next.updatedAt = new Date();
    this.products.set(id, next);
    return copy(next);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.products.get(id);
    if (!current) throw new ProductError("NOT_FOUND", `No existe el producto ${id}`);
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      invalid("El ajuste debe ser un entero distinto de cero");
    }

    const stock = current.stock + delta;
    if (stock < 0) throw new ProductError("INSUFFICIENT_STOCK", "No hay stock suficiente");

    const next: Product = { ...copy(current), stock, updatedAt: new Date() };
    this.products.set(id, next);
    return copy(next);
  }
}
