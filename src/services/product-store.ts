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
  if (typeof value !== "string") {
    invalid("El nombre es obligatorio.");
  }

  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    invalid("El nombre debe tener entre 1 y 80 caracteres.");
  }

  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") {
    invalid("El sku es obligatorio.");
  }

  const sku = value.trim().toUpperCase();
  if (sku.length < 2 || sku.length > 32 || !SKU_PATTERN.test(sku)) {
    invalid("El sku debe tener entre 2 y 32 caracteres con el formato indicado.");
  }

  return sku;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    invalid("La categoría debe ser texto o null.");
  }

  const category = value.trim();
  return category.length === 0 ? null : category;
}

function assertPrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid("El precio debe ser un número finito mayor o igual a 0.");
  }

  return value;
}

function assertStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    invalid("El stock debe ser un entero mayor o igual a 0.");
  }

  return value;
}

function assertActive(value: unknown): boolean {
  if (typeof value !== "boolean") {
    invalid("El campo active debe ser booleano.");
  }

  return value;
}

function assertDelta(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value === 0) {
    invalid("El ajuste de stock debe ser un entero distinto de cero.");
  }

  return value;
}

function assertPriceBound(value: unknown, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid(`${field} debe ser un número finito mayor o igual a 0.`);
  }

  return value;
}

function cloneProduct(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt),
    updatedAt: new Date(product.updatedAt),
  };
}

export class ProductStore {
  private readonly products = new Map<string, Product>();

  create(input: CreateProductInput): Product {
    if (input === null || typeof input !== "object") {
      invalid("Los datos del producto son inválidos.");
    }

    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = assertPrice(input.price);
    const stock = input.stock === undefined ? 0 : assertStock(input.stock);
    const category = normalizeCategory(input.category);

    if (this.findBySku(sku)) {
      throw new ProductError("DUPLICATE_SKU", `El sku ${sku} ya está registrado.`);
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
      createdAt: now,
      updatedAt: now,
    };

    this.products.set(product.id, product);
    return cloneProduct(product);
  }

  getById(id: string): Product | null {
    const product = this.products.get(id);
    return product ? cloneProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") {
      return null;
    }

    const normalized = sku.trim().toUpperCase();
    if (normalized.length === 0) {
      return null;
    }

    const product = this.findBySku(normalized);
    return product ? cloneProduct(product) : null;
  }

  list(query?: ListProductsQuery): Product[] {
    const filters = query ?? {};
    const search = filters.search === undefined ? undefined : filters.search;
    const category = filters.category === undefined ? undefined : filters.category;

    if (search !== undefined && typeof search !== "string") {
      invalid("La búsqueda debe ser texto.");
    }
    if (category !== undefined && typeof category !== "string") {
      invalid("La categoría debe ser texto.");
    }
    if (filters.active !== undefined) {
      assertActive(filters.active);
    }

    const minPrice = assertPriceBound(filters.minPrice, "minPrice");
    const maxPrice = assertPriceBound(filters.maxPrice, "maxPrice");

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      invalid("minPrice no puede ser mayor que maxPrice.");
    }

    const normalizedSearch = search?.trim().toLowerCase();
    const normalizedCategory = category?.trim().toLowerCase();

    return [...this.products.values()]
      .filter((product) => {
        if (normalizedSearch && !product.name.toLowerCase().includes(normalizedSearch)) {
          return false;
        }
        if (
          normalizedCategory &&
          (product.category === null ||
            product.category.toLowerCase() !== normalizedCategory)
        ) {
          return false;
        }
        if (filters.active !== undefined && product.active !== filters.active) {
          return false;
        }
        if (minPrice !== undefined && product.price < minPrice) {
          return false;
        }
        if (maxPrice !== undefined && product.price > maxPrice) {
          return false;
        }
        return true;
      })
      .sort((left, right) => {
        const byName = left.name.localeCompare(right.name, "es", { sensitivity: "base" });
        if (byName !== 0) {
          return byName;
        }
        return left.sku.localeCompare(right.sku, "es", { sensitivity: "base" });
      })
      .map((product) => cloneProduct(product));
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.products.get(id);
    if (!current) {
      throw new ProductError("NOT_FOUND", `No existe un producto con id ${id}.`);
    }

    if (patch === null || typeof patch !== "object") {
      invalid("Los datos de actualización son inválidos.");
    }

    const next: Product = { ...current };
    let changed = false;

    if (patch.name !== undefined) {
      next.name = normalizeName(patch.name);
      changed = true;
    }

    if (patch.sku !== undefined) {
      const sku = normalizeSku(patch.sku);
      const owner = this.findBySku(sku);
      if (owner && owner.id !== current.id) {
        throw new ProductError("DUPLICATE_SKU", `El sku ${sku} ya está registrado.`);
      }
      next.sku = sku;
      changed = true;
    }

    if (patch.price !== undefined) {
      next.price = assertPrice(patch.price);
      changed = true;
    }

    if (patch.stock !== undefined) {
      next.stock = assertStock(patch.stock);
      changed = true;
    }

    if (patch.category !== undefined) {
      next.category = normalizeCategory(patch.category);
      changed = true;
    }

    if (patch.active !== undefined) {
      next.active = assertActive(patch.active);
      changed = true;
    }

    if (!changed) {
      return cloneProduct(current);
    }

    next.updatedAt = new Date();
    this.products.set(current.id, next);
    return cloneProduct(next);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.products.get(id);
    if (!current) {
      throw new ProductError("NOT_FOUND", `No existe un producto con id ${id}.`);
    }

    const amount = assertDelta(delta);
    const stock = current.stock + amount;
    if (stock < 0) {
      throw new ProductError("INSUFFICIENT_STOCK", "El ajuste dejaría el stock por debajo de cero.");
    }

    const next: Product = { ...current, stock, updatedAt: new Date() };
    this.products.set(current.id, next);
    return cloneProduct(next);
  }

  private findBySku(sku: string): Product | undefined {
    for (const product of this.products.values()) {
      if (product.sku === sku) {
        return product;
      }
    }
    return undefined;
  }
}
