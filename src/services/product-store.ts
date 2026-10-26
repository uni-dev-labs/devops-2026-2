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

function validationError(message: string): ProductError {
  return new ProductError("VALIDATION", message);
}

function isObject(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") {
    throw validationError("name debe ser texto");
  }
  const name = value.trim();
  if (name.length === 0 || name.length > NAME_MAX_LENGTH) {
    throw validationError(`name debe tener entre 1 y ${NAME_MAX_LENGTH} caracteres`);
  }
  return name;
}

function normalizeSku(value: string): string {
  return value.trim().toUpperCase();
}

function validateSku(value: unknown): string {
  if (typeof value !== "string") {
    throw validationError("sku debe ser texto");
  }
  const sku = normalizeSku(value);
  if (sku.length < SKU_MIN_LENGTH || sku.length > SKU_MAX_LENGTH || !SKU_PATTERN.test(sku)) {
    throw validationError(
      `sku debe tener entre ${SKU_MIN_LENGTH} y ${SKU_MAX_LENGTH} caracteres: letras, números y guiones entre ellos`,
    );
  }
  return sku;
}

function validatePrice(value: unknown, field = "price"): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw validationError(`${field} debe ser un número finito mayor o igual a 0`);
  }
  return value;
}

function validateStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw validationError("stock debe ser un entero mayor o igual a 0");
  }
  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw validationError("category debe ser texto o null");
  }
  const category = value.trim();
  return category.length > 0 ? category : null;
}

function validateActive(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw validationError("active debe ser true o false");
  }
  return value;
}

function normalizeFilterText(value: unknown, field: string): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw validationError(`${field} debe ser texto`);
  }
  const text = value.trim().toLowerCase();
  return text.length > 0 ? text : null;
}

function copyProduct(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt),
    updatedAt: new Date(product.updatedAt),
  };
}

function compareByNameThenSku(a: Product, b: Product): number {
  const byName = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  if (byName !== 0) {
    return byName;
  }
  if (a.sku === b.sku) {
    return 0;
  }
  return a.sku < b.sku ? -1 : 1;
}

export class ProductStore {
  private readonly products = new Map<string, Product>();

  create(input: CreateProductInput): Product {
    if (!isObject(input)) {
      throw validationError("los datos del producto son obligatorios");
    }

    const name = normalizeName(input.name);
    const sku = validateSku(input.sku);
    const price = validatePrice(input.price);
    const stock = input.stock === undefined ? 0 : validateStock(input.stock);
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
      updatedAt: new Date(now),
    };

    this.products.set(product.id, product);
    return copyProduct(product);
  }

  getById(id: string): Product | null {
    const product = this.products.get(id);
    return product ? copyProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") {
      return null;
    }
    const product = this.findBySku(normalizeSku(sku));
    return product ? copyProduct(product) : null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    if (!isObject(query)) {
      throw validationError("la consulta debe ser un objeto");
    }

    const search = normalizeFilterText(query.search, "search");
    const category = normalizeFilterText(query.category, "category");
    const active = query.active === undefined ? undefined : validateActive(query.active);
    const minPrice = query.minPrice === undefined ? undefined : validatePrice(query.minPrice, "minPrice");
    const maxPrice = query.maxPrice === undefined ? undefined : validatePrice(query.maxPrice, "maxPrice");

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      throw validationError("minPrice no puede ser mayor que maxPrice");
    }

    const matches = (product: Product): boolean =>
      (search === null || product.name.toLowerCase().includes(search)) &&
      (category === null || product.category?.toLowerCase() === category) &&
      (active === undefined || product.active === active) &&
      (minPrice === undefined || product.price >= minPrice) &&
      (maxPrice === undefined || product.price <= maxPrice);

    return [...this.products.values()]
      .filter(matches)
      .sort(compareByNameThenSku)
      .map(copyProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.requireProduct(id);
    if (!isObject(patch)) {
      throw validationError("los cambios deben ser un objeto");
    }

    const changes: Partial<Product> = {};
    if (patch.name !== undefined) changes.name = normalizeName(patch.name);
    if (patch.sku !== undefined) changes.sku = validateSku(patch.sku);
    if (patch.price !== undefined) changes.price = validatePrice(patch.price);
    if (patch.stock !== undefined) changes.stock = validateStock(patch.stock);
    if (patch.category !== undefined) changes.category = normalizeCategory(patch.category);
    if (patch.active !== undefined) changes.active = validateActive(patch.active);

    if (Object.keys(changes).length === 0) {
      return copyProduct(current);
    }
    if (changes.sku !== undefined) {
      this.assertSkuAvailable(changes.sku, current.id);
    }

    const updated: Product = { ...current, ...changes, updatedAt: new Date() };
    this.products.set(updated.id, updated);
    return copyProduct(updated);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.requireProduct(id);
    if (!Number.isInteger(delta) || delta === 0) {
      throw validationError("delta debe ser un entero distinto de cero");
    }

    const stock = current.stock + delta;
    if (stock < 0) {
      throw new ProductError(
        "INSUFFICIENT_STOCK",
        `stock insuficiente: hay ${current.stock} unidades y el ajuste es ${delta}`,
      );
    }

    const updated: Product = { ...current, stock, updatedAt: new Date() };
    this.products.set(updated.id, updated);
    return copyProduct(updated);
  }

  private requireProduct(id: string): Product {
    const product = this.products.get(id);
    if (!product) {
      throw new ProductError("NOT_FOUND", `no existe un producto con id ${id}`);
    }
    return product;
  }

  private findBySku(sku: string): Product | undefined {
    for (const product of this.products.values()) {
      if (product.sku === sku) {
        return product;
      }
    }
    return undefined;
  }

  private assertSkuAvailable(sku: string, ownerId?: string): void {
    const existing = this.findBySku(sku);
    if (existing && existing.id !== ownerId) {
      throw new ProductError("DUPLICATE_SKU", `el sku ${sku} ya pertenece a otro producto`);
    }
  }
}
