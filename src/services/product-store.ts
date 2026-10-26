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

const nameCollator = new Intl.Collator("es", { sensitivity: "base" });

function fail(code: ProductErrorCode, message: string): never {
  throw new ProductError(code, message);
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "El nombre debe ser un texto.");
  const name = value.trim();
  if (name.length < 1 || name.length > NAME_MAX) {
    fail("VALIDATION", `El nombre debe tener entre 1 y ${NAME_MAX} caracteres.`);
  }
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "El sku debe ser un texto.");
  const sku = value.trim().toUpperCase();
  if (sku.length < SKU_MIN || sku.length > SKU_MAX || !SKU_PATTERN.test(sku)) {
    fail(
        "VALIDATION",
        `El sku debe tener entre ${SKU_MIN} y ${SKU_MAX} caracteres, solo letras, números y guiones simples.`,
    );
  }
  return sku;
}

function validatePrice(value: unknown, label = "El precio"): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", `${label} debe ser un número finito mayor o igual a 0.`);
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
  if (typeof value !== "string") fail("VALIDATION", "La categoría debe ser un texto.");
  const category = value.trim();
  return category === "" ? null : category;
}

function normalizeFilterText(value: unknown, label: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") fail("VALIDATION", `${label} debe ser un texto.`);
  const text = value.trim();
  return text === "" ? null : text;
}

function clone(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

export class ProductStore {
  private readonly products = new Map<string, Product>();
  private readonly idsBySku = new Map<string, string>();

  create(input: CreateProductInput): Product {
    if (input === null || typeof input !== "object") {
      fail("VALIDATION", "Los datos del producto son obligatorios.");
    }

    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = validatePrice(input.price);
    const stock = input.stock === undefined ? 0 : validateStock(input.stock);
    const category = normalizeCategory(input.category);

    if (this.idsBySku.has(sku)) {
      fail("DUPLICATE_SKU", `Ya existe un producto con el sku ${sku}.`);
    }

    const now = Date.now();
    const product: Product = {
      id: randomUUID(),
      name,
      sku,
      price,
      stock,
      category,
      active: true,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };

    this.products.set(product.id, product);
    this.idsBySku.set(sku, product.id);
    return clone(product);
  }

  getById(id: string): Product | null {
    const product = typeof id === "string" ? this.products.get(id) : undefined;
    return product ? clone(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const id = this.idsBySku.get(sku.trim().toUpperCase());
    return id === undefined ? null : this.getById(id);
  }

  list(query: ListProductsQuery = {}): Product[] {
    const filters = query ?? {};
    const search = normalizeFilterText(filters.search, "La búsqueda")?.toLowerCase() ?? null;
    const category = normalizeFilterText(filters.category, "La categoría")?.toLowerCase() ?? null;

    if (filters.active !== undefined && typeof filters.active !== "boolean") {
      fail("VALIDATION", "El filtro active debe ser booleano.");
    }
    const minPrice =
        filters.minPrice === undefined ? null : validatePrice(filters.minPrice, "El precio mínimo");
    const maxPrice =
        filters.maxPrice === undefined ? null : validatePrice(filters.maxPrice, "El precio máximo");
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      fail("VALIDATION", "El precio mínimo no puede ser mayor que el máximo.");
    }

    return [...this.products.values()]
        .filter((product) => {
          if (search !== null && !product.name.toLowerCase().includes(search)) return false;
          if (category !== null && product.category?.toLowerCase() !== category) return false;
          if (filters.active !== undefined && product.active !== filters.active) return false;
          if (minPrice !== null && product.price < minPrice) return false;
          if (maxPrice !== null && product.price > maxPrice) return false;
          return true;
        })
        .sort((a, b) => {
          const byName = nameCollator.compare(a.name, b.name);
          if (byName !== 0) return byName;
          return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
        })
        .map(clone);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) fail("NOT_FOUND", "No existe un producto con ese id.");
    if (patch === null || typeof patch !== "object") {
      fail("VALIDATION", "Los cambios del producto son obligatorios.");
    }

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
      if (typeof patch.active !== "boolean") {
        fail("VALIDATION", "El campo active debe ser booleano.");
      }
      next.active = patch.active;
      changed = true;
    }

    if (!changed) return clone(current);

    const owner = this.idsBySku.get(next.sku);
    if (owner !== undefined && owner !== current.id) {
      fail("DUPLICATE_SKU", `Ya existe un producto con el sku ${next.sku}.`);
    }

    next.updatedAt = new Date();
    if (next.sku !== current.sku) {
      this.idsBySku.delete(current.sku);
      this.idsBySku.set(next.sku, current.id);
    }
    this.products.set(current.id, next);
    return clone(next);
  }

  remove(id: string): boolean {
    const product = typeof id === "string" ? this.products.get(id) : undefined;
    if (!product) return false;
    this.products.delete(product.id);
    this.idsBySku.delete(product.sku);
    return true;
  }

  adjustStock(id: string, delta: number): Product {
    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) fail("NOT_FOUND", "No existe un producto con ese id.");
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      fail("VALIDATION", "El ajuste de stock debe ser un entero distinto de cero.");
    }
    const stock = current.stock + delta;
    if (stock < 0) {
      fail("INSUFFICIENT_STOCK", "El ajuste dejaría el stock por debajo de 0.");
    }

    const next: Product = { ...current, stock, updatedAt: new Date() };
    this.products.set(current.id, next);
    return clone(next);
  }
}