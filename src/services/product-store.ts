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
    createdAt: new Date(product.createdAt),
    updatedAt: new Date(product.updatedAt),
  };
}

// Validadores: devuelven el valor normalizado o lanzan VALIDATION.

function validateName(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "El nombre debe ser texto");
  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    fail("VALIDATION", "El nombre debe tener entre 1 y 80 caracteres");
  }
  return name;
}

function normalizeSku(value: string): string {
  return value.trim().toUpperCase();
}

function validateSku(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "El sku debe ser texto");
  const sku = normalizeSku(value);
  if (sku.length < 2 || sku.length > 32 || !SKU_PATTERN.test(sku)) {
    fail("VALIDATION", "El sku tiene un formato inválido");
  }
  return sku;
}

function validatePrice(value: unknown, field = "El precio"): number {
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

function validateCategory(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") fail("VALIDATION", "La categoría debe ser texto");
  const category = value.trim();
  return category.length > 0 ? category : null;
}

function validateActive(value: unknown): boolean {
  if (typeof value !== "boolean") fail("VALIDATION", "active debe ser booleano");
  return value;
}

export class ProductStore {
  private readonly items = new Map<string, Product>();

  create(input: CreateProductInput): Product {
    if (typeof input !== "object" || input === null) {
      fail("VALIDATION", "Los datos del producto son obligatorios");
    }

    // Se valida todo antes de guardar para no dejar nada a medias.
    const name = validateName(input.name);
    const sku = validateSku(input.sku);
    const price = validatePrice(input.price);
    const stock = input.stock === undefined ? 0 : validateStock(input.stock);
    const category = validateCategory(input.category);
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
      updatedAt: new Date(now),
    };
    this.items.set(product.id, product);
    return clone(product);
  }

  getById(id: string): Product | null {
    const product = this.items.get(id);
    return product ? clone(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const product = this.findBySku(normalizeSku(sku));
    return product ? clone(product) : null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    const { minPrice, maxPrice } = query;
    if (minPrice !== undefined) validatePrice(minPrice, "minPrice");
    if (maxPrice !== undefined) validatePrice(maxPrice, "maxPrice");
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      fail("VALIDATION", "minPrice no puede ser mayor que maxPrice");
    }

    const search = typeof query.search === "string" ? query.search.trim().toLowerCase() : "";
    const category =
      typeof query.category === "string" ? query.category.trim().toLowerCase() : "";

    return [...this.items.values()]
      .filter((product) => {
        if (search && !product.name.toLowerCase().includes(search)) return false;
        if (category && product.category?.toLowerCase() !== category) return false;
        if (typeof query.active === "boolean" && product.active !== query.active) return false;
        if (minPrice !== undefined && product.price < minPrice) return false;
        if (maxPrice !== undefined && product.price > maxPrice) return false;
        return true;
      })
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, "es", { sensitivity: "base" }) ||
          a.sku.localeCompare(b.sku),
      )
      .map(clone);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.items.get(id);
    if (!current) fail("NOT_FOUND", `No existe un producto con id ${id}`);
    if (typeof patch !== "object" || patch === null) {
      fail("VALIDATION", "El parche debe ser un objeto");
    }

    // Se arma el cambio completo antes de aplicarlo.
    const changes: Partial<Product> = {};
    if (patch.name !== undefined) changes.name = validateName(patch.name);
    if (patch.sku !== undefined) changes.sku = validateSku(patch.sku);
    if (patch.price !== undefined) changes.price = validatePrice(patch.price);
    if (patch.stock !== undefined) changes.stock = validateStock(patch.stock);
    if (patch.category !== undefined) changes.category = validateCategory(patch.category);
    if (patch.active !== undefined) changes.active = validateActive(patch.active);

    if (Object.keys(changes).length === 0) return clone(current);
    if (changes.sku !== undefined) this.assertSkuAvailable(changes.sku, id);

    const updated: Product = { ...current, ...changes, updatedAt: new Date() };
    this.items.set(id, updated);
    return clone(updated);
  }

  remove(id: string): boolean {
    return this.items.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.items.get(id);
    if (!current) fail("NOT_FOUND", `No existe un producto con id ${id}`);
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      fail("VALIDATION", "El ajuste debe ser un entero distinto de cero");
    }

    const stock = current.stock + delta;
    if (stock < 0) {
      fail("INSUFFICIENT_STOCK", `Stock insuficiente: hay ${current.stock}, se piden ${-delta}`);
    }

    const updated: Product = { ...current, stock, updatedAt: new Date() };
    this.items.set(id, updated);
    return clone(updated);
  }

  private findBySku(sku: string): Product | undefined {
    for (const product of this.items.values()) {
      if (product.sku === sku) return product;
    }
    return undefined;
  }

  private assertSkuAvailable(sku: string, ownerId?: string): void {
    const existing = this.findBySku(sku);
    if (existing && existing.id !== ownerId) {
      fail("DUPLICATE_SKU", `El sku ${sku} ya pertenece a otro producto`);
    }
  }
}
