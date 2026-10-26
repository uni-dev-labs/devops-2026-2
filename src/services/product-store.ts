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

const NAME_MAX = 80;
const SKU_MIN = 2;
const SKU_MAX = 32;
const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function invalid(message: string): never {
  throw new ProductError("VALIDATION", message);
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") invalid("El nombre debe ser texto");
  const name = value.trim();
  if (name.length < 1 || name.length > NAME_MAX) {
    invalid(`El nombre debe tener entre 1 y ${NAME_MAX} caracteres`);
  }
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") invalid("El sku debe ser texto");
  const sku = value.trim().toUpperCase();
  if (sku.length < SKU_MIN || sku.length > SKU_MAX) {
    invalid(`El sku debe tener entre ${SKU_MIN} y ${SKU_MAX} caracteres`);
  }
  if (!SKU_PATTERN.test(sku)) invalid("El sku tiene un formato inválido");
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
  return category.length > 0 ? category : null;
}

function normalizeActive(value: unknown): boolean {
  if (typeof value !== "boolean") invalid("active debe ser booleano");
  return value;
}

/** Recorta un filtro de texto; devuelve null si no debe filtrar. */
function textFilter(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") invalid(`El filtro ${field} debe ser texto`);
  const text = value.trim().toLowerCase();
  return text.length > 0 ? text : null;
}

function priceFilter(value: unknown, field: string): number | null {
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid(`${field} debe ser un número finito mayor o igual a 0`);
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

  create(input: CreateProductInput): Product {
    if (typeof input !== "object" || input === null) invalid("El producto es obligatorio");

    // Validar todo antes de guardar
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
    return copy(product);
  }

  getById(id: string): Product | null {
    if (typeof id !== "string") return null;
    const product = this.products.get(id);
    return product ? copy(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const product = this.findBySku(sku.trim().toUpperCase());
    return product ? copy(product) : null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    const search = textFilter(query.search, "search");
    const category = textFilter(query.category, "category");
    const active = query.active === undefined ? null : normalizeActive(query.active);
    const minPrice = priceFilter(query.minPrice, "minPrice");
    const maxPrice = priceFilter(query.maxPrice, "maxPrice");

    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      invalid("minPrice no puede ser mayor que maxPrice");
    }

    return [...this.products.values()]
      .filter((product) => {
        if (search !== null && !product.name.toLowerCase().includes(search)) return false;
        if (category !== null && product.category?.toLowerCase() !== category) return false;
        if (active !== null && product.active !== active) return false;
        if (minPrice !== null && product.price < minPrice) return false;
        if (maxPrice !== null && product.price > maxPrice) return false;
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
    const current = this.requireProduct(id);
    if (typeof patch !== "object" || patch === null) invalid("El parche es obligatorio");

    // Construir el resultado aparte; solo se guarda si todo es válido
    const next: Product = { ...current };
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
      next.active = normalizeActive(patch.active);
      changed = true;
    }

    if (!changed) return copy(current);

    this.assertSkuAvailable(next.sku, current.id);

    next.updatedAt = new Date();
    this.products.set(current.id, next);
    return copy(next);
  }

  remove(id: string): boolean {
    if (typeof id !== "string") return false;
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.requireProduct(id);

    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      invalid("El ajuste debe ser un entero distinto de cero");
    }

    const stock = current.stock + delta;
    if (stock < 0) {
      throw new ProductError(
        "INSUFFICIENT_STOCK",
        `Stock insuficiente: hay ${current.stock} y se pidió restar ${-delta}`,
      );
    }

    const next: Product = { ...current, stock, updatedAt: new Date() };
    this.products.set(current.id, next);
    return copy(next);
  }

  private requireProduct(id: string): Product {
    const product = typeof id === "string" ? this.products.get(id) : undefined;
    if (!product) throw new ProductError("NOT_FOUND", `No existe un producto con id ${String(id)}`);
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
