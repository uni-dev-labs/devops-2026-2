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
// Se valida el texto recortado antes de pasarlo a mayúsculas, para que caracteres
// como "ß" (que se convierten en "SS") no se cuelen como un sku válido.
const SKU_RAW_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

function fail(code: ProductErrorCode, message: string): never {
  throw new ProductError(code, message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseName(value: unknown): string {
  if (typeof value !== "string") {
    fail("VALIDATION", "El nombre es obligatorio y debe ser texto.");
  }
  const name = value.trim();
  if (name.length < 1 || name.length > NAME_MAX_LENGTH) {
    fail("VALIDATION", `El nombre debe tener entre 1 y ${NAME_MAX_LENGTH} caracteres.`);
  }
  return name;
}

function parseSku(value: unknown): string {
  if (typeof value !== "string") {
    fail("VALIDATION", "El sku es obligatorio y debe ser texto.");
  }
  const trimmed = value.trim();
  if (
    trimmed.length < SKU_MIN_LENGTH ||
    trimmed.length > SKU_MAX_LENGTH ||
    !SKU_RAW_PATTERN.test(trimmed)
  ) {
    fail(
      "VALIDATION",
      `El sku debe tener entre ${SKU_MIN_LENGTH} y ${SKU_MAX_LENGTH} caracteres, solo letras, números y guiones simples entre grupos.`,
    );
  }
  const sku = trimmed.toUpperCase();
  if (!SKU_PATTERN.test(sku)) {
    fail("VALIDATION", "El sku tiene un formato inválido.");
  }
  return sku;
}

function parsePrice(value: unknown, label = "El precio"): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", `${label} debe ser un número finito mayor o igual a 0.`);
  }
  return value;
}

function parseStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail("VALIDATION", "El stock debe ser un entero mayor o igual a 0.");
  }
  return value;
}

function parseCategory(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    fail("VALIDATION", "La categoría debe ser texto.");
  }
  const category = value.trim();
  return category === "" ? null : category;
}

function parseActive(value: unknown): boolean {
  if (typeof value !== "boolean") {
    fail("VALIDATION", "El campo active debe ser verdadero o falso.");
  }
  return value;
}

function parseDelta(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value === 0) {
    fail("VALIDATION", "El ajuste de stock debe ser un entero distinto de cero.");
  }
  return value;
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

export class ProductStore {
  private readonly products = new Map<string, Product>();
  private readonly idBySku = new Map<string, string>();

  create(input: CreateProductInput): Product {
    if (!isPlainObject(input)) {
      fail("VALIDATION", "Los datos del producto son obligatorios.");
    }

    // Se valida todo antes de tocar el almacén para no dejar estados a medias.
    const name = parseName(input.name);
    const sku = parseSku(input.sku);
    const price = parsePrice(input.price);
    const stock = input.stock === undefined ? 0 : parseStock(input.stock);
    const category = parseCategory(input.category);

    if (this.idBySku.has(sku)) {
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
    this.idBySku.set(sku, product.id);
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
    const id = this.idBySku.get(sku.trim().toUpperCase());
    if (id === undefined) {
      return null;
    }
    const product = this.products.get(id);
    return product ? cloneProduct(product) : null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    if (!isPlainObject(query)) {
      fail("VALIDATION", "Los filtros de búsqueda son inválidos.");
    }

    const { search, category, active, minPrice, maxPrice } = query;

    if (search !== undefined && typeof search !== "string") {
      fail("VALIDATION", "El texto de búsqueda debe ser texto.");
    }
    if (category !== undefined && typeof category !== "string") {
      fail("VALIDATION", "La categoría debe ser texto.");
    }
    if (active !== undefined) {
      parseActive(active);
    }
    const min = minPrice === undefined ? undefined : parsePrice(minPrice, "El precio mínimo");
    const max = maxPrice === undefined ? undefined : parsePrice(maxPrice, "El precio máximo");
    if (min !== undefined && max !== undefined && min > max) {
      fail("VALIDATION", "El precio mínimo no puede ser mayor que el precio máximo.");
    }

    const needle = search?.trim().toLowerCase() ?? "";
    const categoryFilter = category?.trim().toLowerCase() ?? "";

    return [...this.products.values()]
      .filter((product) => {
        if (needle !== "" && !product.name.toLowerCase().includes(needle)) return false;
        if (
          categoryFilter !== "" &&
          (product.category === null || product.category.toLowerCase() !== categoryFilter)
        ) {
          return false;
        }
        if (active !== undefined && product.active !== active) return false;
        if (min !== undefined && product.price < min) return false;
        if (max !== undefined && product.price > max) return false;
        return true;
      })
      .sort(compareProducts)
      .map(cloneProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) {
      fail("NOT_FOUND", "No existe un producto con ese id.");
    }
    if (!isPlainObject(patch)) {
      fail("VALIDATION", "Los datos de actualización son inválidos.");
    }

    // Se construye el resultado completo y se valida antes de guardar nada.
    const next: Product = { ...current };
    let changed = false;

    if (patch.name !== undefined) {
      next.name = parseName(patch.name);
      changed = true;
    }
    if (patch.sku !== undefined) {
      next.sku = parseSku(patch.sku);
      changed = true;
    }
    if (patch.price !== undefined) {
      next.price = parsePrice(patch.price);
      changed = true;
    }
    if (patch.stock !== undefined) {
      next.stock = parseStock(patch.stock);
      changed = true;
    }
    if (patch.category !== undefined) {
      next.category = parseCategory(patch.category);
      changed = true;
    }
    if (patch.active !== undefined) {
      next.active = parseActive(patch.active);
      changed = true;
    }

    if (!changed) {
      return cloneProduct(current);
    }

    if (next.sku !== current.sku) {
      const owner = this.idBySku.get(next.sku);
      if (owner !== undefined && owner !== current.id) {
        fail("DUPLICATE_SKU", `Ya existe un producto con el sku ${next.sku}.`);
      }
    }

    next.createdAt = new Date(current.createdAt.getTime());
    next.updatedAt = new Date();

    if (next.sku !== current.sku) {
      this.idBySku.delete(current.sku);
      this.idBySku.set(next.sku, current.id);
    }
    this.products.set(current.id, next);
    return cloneProduct(next);
  }

  remove(id: string): boolean {
    if (typeof id !== "string") {
      return false;
    }
    const current = this.products.get(id);
    if (!current) {
      return false;
    }
    this.products.delete(id);
    this.idBySku.delete(current.sku);
    return true;
  }

  adjustStock(id: string, delta: number): Product {
    const amount = parseDelta(delta);
    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) {
      fail("NOT_FOUND", "No existe un producto con ese id.");
    }

    const stock = current.stock + amount;
    if (stock < 0) {
      fail("INSUFFICIENT_STOCK", "El stock disponible no alcanza para este ajuste.");
    }
    if (!Number.isSafeInteger(stock)) {
      fail("VALIDATION", "El ajuste deja el stock fuera del rango permitido.");
    }

    const next: Product = {
      ...current,
      stock,
      createdAt: new Date(current.createdAt.getTime()),
      updatedAt: new Date(),
    };
    this.products.set(current.id, next);
    return cloneProduct(next);
  }
}
