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

const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const NAME_MAX = 80;
const SKU_MIN = 2;
const SKU_MAX = 32;

function fail(code: ProductErrorCode, message: string): never {
  throw new ProductError(code, message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseName(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "El nombre debe ser texto.");
  const name = value.trim();
  if (name.length < 1 || name.length > NAME_MAX) {
    fail("VALIDATION", `El nombre debe tener entre 1 y ${NAME_MAX} caracteres.`);
  }
  return name;
}

function normalizeSku(value: string): string {
  return value.trim().toUpperCase();
}

function parseSku(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "El sku debe ser texto.");
  const sku = normalizeSku(value);
  if (sku.length < SKU_MIN || sku.length > SKU_MAX || !SKU_PATTERN.test(sku)) {
    fail(
      "VALIDATION",
      `El sku debe tener entre ${SKU_MIN} y ${SKU_MAX} caracteres (A-Z, 0-9 y guiones entre grupos).`,
    );
  }
  return sku;
}

function parsePrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", "El precio debe ser un número finito mayor o igual a 0.");
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
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") fail("VALIDATION", "La categoría debe ser texto.");
  const category = value.trim();
  return category === "" ? null : category;
}

function parseActive(value: unknown): boolean {
  if (typeof value !== "boolean") fail("VALIDATION", "El campo active debe ser booleano.");
  return value;
}

function cloneProduct(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

function parseOptionalText(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail("VALIDATION", `${label} debe ser texto.`);
  const text = value.trim();
  return text === "" ? undefined : text;
}

function parseOptionalPrice(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", `${label} debe ser un número finito mayor o igual a 0.`);
  }
  return value;
}

export class ProductStore {
  private readonly products = new Map<string, Product>();
  private readonly idBySku = new Map<string, string>();

  create(input: CreateProductInput): Product {
    if (!isPlainObject(input)) fail("VALIDATION", "Los datos del producto son inválidos.");

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
      createdAt: now,
      updatedAt: new Date(now.getTime()),
    };

    this.products.set(product.id, product);
    this.idBySku.set(sku, product.id);
    return cloneProduct(product);
  }

  getById(id: string): Product | null {
    const product = typeof id === "string" ? this.products.get(id) : undefined;
    return product ? cloneProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const id = this.idBySku.get(normalizeSku(sku));
    const product = id === undefined ? undefined : this.products.get(id);
    return product ? cloneProduct(product) : null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    if (!isPlainObject(query)) fail("VALIDATION", "El filtro del listado es inválido.");

    const search = parseOptionalText(query.search, "La búsqueda")?.toLowerCase();
    const category = parseOptionalText(query.category, "La categoría")?.toLowerCase();
    const minPrice = parseOptionalPrice(query.minPrice, "minPrice");
    const maxPrice = parseOptionalPrice(query.maxPrice, "maxPrice");
    const active = query.active === undefined ? undefined : parseActive(query.active);

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      fail("VALIDATION", "minPrice no puede ser mayor que maxPrice.");
    }

    return [...this.products.values()]
      .filter((product) => {
        if (search !== undefined && !product.name.toLowerCase().includes(search)) return false;
        if (category !== undefined && product.category?.toLowerCase() !== category) return false;
        if (active !== undefined && product.active !== active) return false;
        if (minPrice !== undefined && product.price < minPrice) return false;
        if (maxPrice !== undefined && product.price > maxPrice) return false;
        return true;
      })
      .sort((a, b) => {
        const byName = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
        if (byName !== 0) return byName;
        return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
      })
      .map(cloneProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    if (!isPlainObject(patch)) fail("VALIDATION", "Los datos de actualización son inválidos.");

    // Validar todo primero para no dejar cambios a medias.
    const changes: Partial<Product> = {};
    if (patch.name !== undefined) changes.name = parseName(patch.name);
    if (patch.sku !== undefined) changes.sku = parseSku(patch.sku);
    if (patch.price !== undefined) changes.price = parsePrice(patch.price);
    if (patch.stock !== undefined) changes.stock = parseStock(patch.stock);
    if (patch.category !== undefined) changes.category = parseCategory(patch.category);
    if (patch.active !== undefined) changes.active = parseActive(patch.active);

    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) fail("NOT_FOUND", "No existe un producto con ese id.");

    if (Object.keys(changes).length === 0) return cloneProduct(current);

    if (changes.sku !== undefined && changes.sku !== current.sku) {
      if (this.idBySku.has(changes.sku)) {
        fail("DUPLICATE_SKU", `Ya existe un producto con el sku ${changes.sku}.`);
      }
      this.idBySku.delete(current.sku);
      this.idBySku.set(changes.sku, current.id);
    }

    Object.assign(current, changes, { updatedAt: new Date() });
    return cloneProduct(current);
  }

  remove(id: string): boolean {
    const product = typeof id === "string" ? this.products.get(id) : undefined;
    if (!product) return false;
    this.products.delete(product.id);
    this.idBySku.delete(product.sku);
    return true;
  }

  adjustStock(id: string, delta: number): Product {
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      fail("VALIDATION", "El ajuste debe ser un entero distinto de cero.");
    }

    const product = typeof id === "string" ? this.products.get(id) : undefined;
    if (!product) fail("NOT_FOUND", "No existe un producto con ese id.");

    const next = product.stock + delta;
    if (next < 0) fail("INSUFFICIENT_STOCK", "El stock no puede quedar por debajo de 0.");

    product.stock = next;
    product.updatedAt = new Date();
    return cloneProduct(product);
  }
}