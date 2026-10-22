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

// ---------------------------------------------------------------------------
// Utilidades de validación y normalización
// ---------------------------------------------------------------------------

const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const NAME_MAX = 80;
const SKU_MIN = 2;
const SKU_MAX = 32;

function fail(code: ProductErrorCode, message: string): never {
  throw new ProductError(code, message);
}

function parseName(value: unknown): string {
  if (typeof value !== "string") {
    return fail("VALIDATION", "El nombre debe ser un texto.");
  }
  const name = value.trim();
  if (name.length < 1 || name.length > NAME_MAX) {
    return fail("VALIDATION", `El nombre debe tener entre 1 y ${NAME_MAX} caracteres.`);
  }
  return name;
}

function normalizeSku(value: string): string {
  return value.trim().toUpperCase();
}

function parseSku(value: unknown): string {
  if (typeof value !== "string") {
    return fail("VALIDATION", "El sku debe ser un texto.");
  }
  const sku = normalizeSku(value);
  if (sku.length < SKU_MIN || sku.length > SKU_MAX) {
    return fail("VALIDATION", `El sku debe tener entre ${SKU_MIN} y ${SKU_MAX} caracteres.`);
  }
  if (!SKU_PATTERN.test(sku)) {
    return fail(
      "VALIDATION",
      "El sku solo admite letras, números y guiones simples entre grupos (ej. ARR-1).",
    );
  }
  return sku;
}

function parsePrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fail("VALIDATION", "El precio debe ser un número finito mayor o igual a 0.");
  }
  return value;
}

function parseStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return fail("VALIDATION", "El stock debe ser un entero mayor o igual a 0.");
  }
  return value;
}

function parseCategory(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return fail("VALIDATION", "La categoría debe ser un texto o null.");
  }
  const category = value.trim();
  return category === "" ? null : category;
}

function parseActive(value: unknown): boolean {
  if (typeof value !== "boolean") {
    return fail("VALIDATION", "El campo active debe ser verdadero o falso.");
  }
  return value;
}

function parseOptionalPriceBound(value: unknown, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fail("VALIDATION", `${label} debe ser un número finito mayor o igual a 0.`);
  }
  return value;
}

function parseOptionalText(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return fail("VALIDATION", `${label} debe ser un texto.`);
  }
  return value.trim();
}

function cloneProduct(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

function compareProducts(a: Product, b: Product): number {
  const byName = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  if (byName !== 0) {
    return byName;
  }
  if (a.sku < b.sku) return -1;
  if (a.sku > b.sku) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Almacén en memoria
// ---------------------------------------------------------------------------

export class ProductStore {
  /** Guarda los productos por id. Cada instancia tiene su propio Map. */
  private readonly products = new Map<string, Product>();

  create(input: CreateProductInput): Product {
    if (typeof input !== "object" || input === null) {
      return fail("VALIDATION", "Los datos del producto son obligatorios.");
    }

    // Se valida todo antes de guardar nada.
    const name = parseName(input.name);
    const sku = parseSku(input.sku);
    const price = parsePrice(input.price);
    const stock = input.stock === undefined ? 0 : parseStock(input.stock);
    const category = parseCategory(input.category);

    if (this.findBySku(sku)) {
      return fail("DUPLICATE_SKU", `Ya existe un producto con el sku ${sku}.`);
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
      updatedAt: new Date(now.getTime()),
    };

    this.products.set(product.id, product);
    return cloneProduct(product);
  }

  getById(id: string): Product | null {
    if (typeof id !== "string") {
      return null;
    }
    const product = this.products.get(id);
    return product ? cloneProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") {
      return null;
    }
    const product = this.findBySku(normalizeSku(sku));
    return product ? cloneProduct(product) : null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    if (typeof query !== "object" || query === null) {
      return fail("VALIDATION", "La consulta debe ser un objeto.");
    }

    // Se valida la consulta completa antes de filtrar.
    const search = parseOptionalText(query.search, "La búsqueda")?.toLowerCase();
    const category = parseOptionalText(query.category, "La categoría")?.toLowerCase();
    const active = query.active === undefined ? undefined : parseActive(query.active);
    const minPrice = parseOptionalPriceBound(query.minPrice, "El precio mínimo");
    const maxPrice = parseOptionalPriceBound(query.maxPrice, "El precio máximo");

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      return fail("VALIDATION", "El precio mínimo no puede ser mayor que el máximo.");
    }

    const result: Product[] = [];
    for (const product of this.products.values()) {
      if (search && !product.name.toLowerCase().includes(search)) continue;
      if (category && product.category?.toLowerCase() !== category) continue;
      if (active !== undefined && product.active !== active) continue;
      if (minPrice !== undefined && product.price < minPrice) continue;
      if (maxPrice !== undefined && product.price > maxPrice) continue;
      result.push(cloneProduct(product));
    }

    return result.sort(compareProducts);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const existing = typeof id === "string" ? this.products.get(id) : undefined;
    if (!existing) {
      return fail("NOT_FOUND", "No existe un producto con ese id.");
    }
    if (typeof patch !== "object" || patch === null) {
      return fail("VALIDATION", "Los cambios deben ser un objeto.");
    }

    // 1) Validar todo el parche y calcular los cambios, sin tocar lo guardado.
    const changes: Partial<Product> = {};
    let hasChanges = false;

    if (patch.name !== undefined) {
      changes.name = parseName(patch.name);
      hasChanges = true;
    }
    if (patch.sku !== undefined) {
      const sku = parseSku(patch.sku);
      const owner = this.findBySku(sku);
      if (owner && owner.id !== existing.id) {
        return fail("DUPLICATE_SKU", `Ya existe un producto con el sku ${sku}.`);
      }
      changes.sku = sku;
      hasChanges = true;
    }
    if (patch.price !== undefined) {
      changes.price = parsePrice(patch.price);
      hasChanges = true;
    }
    if (patch.stock !== undefined) {
      changes.stock = parseStock(patch.stock);
      hasChanges = true;
    }
    if (patch.category !== undefined) {
      changes.category = parseCategory(patch.category);
      hasChanges = true;
    }
    if (patch.active !== undefined) {
      changes.active = parseActive(patch.active);
      hasChanges = true;
    }

    // Un parche vacío no cambia nada, ni siquiera updatedAt.
    if (!hasChanges) {
      return cloneProduct(existing);
    }

    // 2) Aplicar los cambios ya validados.
    Object.assign(existing, changes);
    existing.updatedAt = new Date();
    return cloneProduct(existing);
  }

  remove(id: string): boolean {
    if (typeof id !== "string") {
      return false;
    }
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const existing = typeof id === "string" ? this.products.get(id) : undefined;
    if (!existing) {
      return fail("NOT_FOUND", "No existe un producto con ese id.");
    }
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      return fail("VALIDATION", "El ajuste de stock debe ser un entero distinto de 0.");
    }

    const nextStock = existing.stock + delta;
    if (nextStock < 0) {
      return fail("INSUFFICIENT_STOCK", "El ajuste dejaría el stock por debajo de 0.");
    }
    if (!Number.isSafeInteger(nextStock)) {
      return fail("VALIDATION", "El ajuste produce un stock fuera del rango permitido.");
    }

    existing.stock = nextStock;
    existing.updatedAt = new Date();
    return cloneProduct(existing);
  }

  /** Busca por sku ya normalizado (recortado y en mayúsculas). */
  private findBySku(normalizedSku: string): Product | undefined {
    for (const product of this.products.values()) {
      if (product.sku === normalizedSku) {
        return product;
      }
    }
    return undefined;
  }
}