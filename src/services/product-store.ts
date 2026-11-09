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

export type ProductErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "DUPLICATE_SKU"
  | "INSUFFICIENT_STOCK";

const NAME_MAX = 80;
const SKU_MIN = 2;
const SKU_MAX = 32;
const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export class ProductError extends Error {
  readonly code: ProductErrorCode;

  constructor(code: ProductErrorCode, message: string) {
    super(message);
    this.name = "ProductError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function fail(code: ProductErrorCode, message: string): never {
  throw new ProductError(code, message);
}

function normalizeName(name: unknown): string {
  if (typeof name !== "string") {
    fail("VALIDATION", "El nombre debe ser texto");
  }

  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > NAME_MAX) {
    fail("VALIDATION", "El nombre debe tener entre 1 y 80 caracteres");
  }

  return trimmed;
}

function normalizeSku(sku: unknown): string {
  if (typeof sku !== "string") {
    fail("VALIDATION", "El sku debe ser texto");
  }

  const normalized = sku.trim().toUpperCase();
  if (
    normalized.length < SKU_MIN ||
    normalized.length > SKU_MAX ||
    !SKU_PATTERN.test(normalized)
  ) {
    fail(
      "VALIDATION",
      "El sku debe tener de 2 a 32 caracteres: letras, dígitos y guiones simples, sin guion al inicio ni al final",
    );
  }

  return normalized;
}

function normalizePrice(price: unknown): number {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    fail("VALIDATION", "El precio debe ser un número finito mayor o igual a 0");
  }

  return price;
}

function normalizeStock(stock: unknown): number {
  if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0) {
    fail("VALIDATION", "El stock debe ser un entero mayor o igual a 0");
  }

  return stock;
}

function normalizeCategory(category: unknown): string | null {
  if (category === undefined || category === null) return null;
  if (typeof category !== "string") {
    fail("VALIDATION", "La categoría debe ser texto o null");
  }

  const trimmed = category.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeActive(active: unknown): boolean {
  if (typeof active !== "boolean") {
    fail("VALIDATION", "El estado activo debe ser verdadero o falso");
  }

  return active;
}

function normalizeBound(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", `${label} debe ser un número finito mayor o igual a 0`);
  }

  return value;
}

function normalizeFilterText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    fail("VALIDATION", "El filtro de texto debe ser texto");
  }

  const trimmed = value.trim().toLocaleLowerCase("es");
  return trimmed.length === 0 ? undefined : trimmed;
}

function cloneProduct(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

export class ProductStore {
  private readonly products = new Map<string, Product>();
  private readonly skuIndex = new Map<string, string>();

  create(input: CreateProductInput): Product {
    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = normalizePrice(input.price);
    const stock = input.stock === undefined ? 0 : normalizeStock(input.stock);
    const category = normalizeCategory(input.category);

    if (this.skuIndex.has(sku)) {
      fail("DUPLICATE_SKU", "Ya existe un producto con ese sku");
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
    this.skuIndex.set(sku, product.id);
    return cloneProduct(product);
  }

  getById(id: string): Product | null {
    const product = this.products.get(id);
    return product ? cloneProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const id = this.skuIndex.get(sku.trim().toUpperCase());
    if (!id) return null;
    return this.getById(id);
  }

  list(query?: ListProductsQuery): Product[] {
    const filters = query ?? {};
    const minPrice = normalizeBound(filters.minPrice, "minPrice");
    const maxPrice = normalizeBound(filters.maxPrice, "maxPrice");

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      fail("VALIDATION", "minPrice no puede ser mayor que maxPrice");
    }

    const search = normalizeFilterText(filters.search);
    const category = normalizeFilterText(filters.category);

    return [...this.products.values()]
      .filter((product) => {
        if (search && !product.name.toLocaleLowerCase("es").includes(search)) return false;
        if (category && product.category?.toLocaleLowerCase("es") !== category) return false;
        if (filters.active !== undefined && product.active !== filters.active) return false;
        if (minPrice !== undefined && product.price < minPrice) return false;
        if (maxPrice !== undefined && product.price > maxPrice) return false;
        return true;
      })
      .sort((left, right) => {
        const byName = left.name.localeCompare(right.name, "es", { sensitivity: "base" });
        if (byName !== 0) return byName;
        return left.sku.localeCompare(right.sku);
      })
      .map(cloneProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.products.get(id);
    if (!current) fail("NOT_FOUND", "Producto no encontrado");

    const hasName = patch.name !== undefined;
    const hasSku = patch.sku !== undefined;
    const hasPrice = patch.price !== undefined;
    const hasStock = patch.stock !== undefined;
    const hasCategory = patch.category !== undefined;
    const hasActive = patch.active !== undefined;

    if (!hasName && !hasSku && !hasPrice && !hasStock && !hasCategory && !hasActive) {
      return cloneProduct(current);
    }

    const name = hasName ? normalizeName(patch.name) : current.name;
    const sku = hasSku ? normalizeSku(patch.sku) : current.sku;
    const price = hasPrice ? normalizePrice(patch.price) : current.price;
    const stock = hasStock ? normalizeStock(patch.stock) : current.stock;
    const category = hasCategory ? normalizeCategory(patch.category) : current.category;
    const active = hasActive ? normalizeActive(patch.active) : current.active;

    if (sku !== current.sku && this.skuIndex.has(sku)) {
      fail("DUPLICATE_SKU", "Ya existe un producto con ese sku");
    }

    const updated: Product = {
      ...current,
      name,
      sku,
      price,
      stock,
      category,
      active,
      createdAt: new Date(current.createdAt.getTime()),
      updatedAt: new Date(),
    };

    if (sku !== current.sku) {
      this.skuIndex.delete(current.sku);
      this.skuIndex.set(sku, current.id);
    }

    this.products.set(current.id, updated);
    return cloneProduct(updated);
  }

  remove(id: string): boolean {
    const current = this.products.get(id);
    if (!current) return false;
    this.products.delete(id);
    this.skuIndex.delete(current.sku);
    return true;
  }

  adjustStock(id: string, delta: number): Product {
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      fail("VALIDATION", "El ajuste de stock debe ser un entero distinto de cero");
    }

    const current = this.products.get(id);
    if (!current) fail("NOT_FOUND", "Producto no encontrado");

    const stock = current.stock + delta;
    if (stock < 0) {
      fail("INSUFFICIENT_STOCK", "No hay stock suficiente para ese ajuste");
    }

    const updated: Product = {
      ...current,
      stock,
      createdAt: new Date(current.createdAt.getTime()),
      updatedAt: new Date(),
    };

    this.products.set(current.id, updated);
    return cloneProduct(updated);
  }
}
