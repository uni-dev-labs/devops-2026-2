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

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validation(message: string): never {
  throw new ProductError("VALIDATION", message);
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") validation("El nombre debe ser texto.");
  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    validation("El nombre debe tener entre 1 y 80 caracteres.");
  }
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") validation("El SKU debe ser texto.");
  const sku = value.trim().toUpperCase();
  if (sku.length < 2 || sku.length > 32 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(sku)) {
    validation("El SKU tiene un formato inválido.");
  }
  return sku;
}

function validatePrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    validation("El precio debe ser un número finito mayor o igual a cero.");
  }
  return value;
}

function validateStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    validation("El stock debe ser un entero mayor o igual a cero.");
  }
  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") validation("La categoría debe ser texto o null.");
  const category = value.trim();
  return category.length === 0 ? null : category;
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

  create(input: CreateProductInput): Product {
    if (!isRecord(input)) validation("Los datos del producto deben ser un objeto.");

    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = validatePrice(input.price);
    const stock = input.stock === undefined ? 0 : validateStock(input.stock);
    const category = normalizeCategory(input.category);

    if ([...this.products.values()].some((product) => product.sku === sku)) {
      throw new ProductError("DUPLICATE_SKU", "Ya existe un producto con ese SKU.");
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
    const product = this.products.get(id);
    return product ? cloneProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string" || sku.trim().length === 0) return null;
    const normalizedSku = sku.trim().toUpperCase();
    for (const product of this.products.values()) {
      if (product.sku === normalizedSku) return cloneProduct(product);
    }
    return null;
  }

  list(query?: ListProductsQuery): Product[] {
    if (query !== undefined && !isRecord(query)) {
      validation("La consulta debe ser un objeto.");
    }
    const filters = (query ?? {}) as UnknownRecord;

    let search: string | undefined;
    if (filters.search !== undefined) {
      if (typeof filters.search !== "string") validation("La búsqueda debe ser texto.");
      const trimmed = filters.search.trim();
      search = trimmed.length > 0 ? trimmed.toLocaleLowerCase("es") : undefined;
    }

    let category: string | undefined;
    if (filters.category !== undefined) {
      if (typeof filters.category !== "string") validation("La categoría debe ser texto.");
      const trimmed = filters.category.trim();
      category = trimmed.length > 0 ? trimmed.toLocaleLowerCase("es") : undefined;
    }

    let active: boolean | undefined;
    if (filters.active !== undefined) {
      if (typeof filters.active !== "boolean") validation("El filtro activo debe ser booleano.");
      active = filters.active;
    }

    let minPrice: number | undefined;
    if (filters.minPrice !== undefined) minPrice = validatePrice(filters.minPrice);
    let maxPrice: number | undefined;
    if (filters.maxPrice !== undefined) maxPrice = validatePrice(filters.maxPrice);
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      validation("El precio mínimo no puede superar el máximo.");
    }

    const collator = new Intl.Collator("es", { sensitivity: "base" });
    return [...this.products.values()]
      .filter((product) => {
        if (search !== undefined && !product.name.toLocaleLowerCase("es").includes(search)) {
          return false;
        }
        if (
          category !== undefined &&
          product.category?.toLocaleLowerCase("es") !== category
        ) {
          return false;
        }
        if (active !== undefined && product.active !== active) return false;
        if (minPrice !== undefined && product.price < minPrice) return false;
        if (maxPrice !== undefined && product.price > maxPrice) return false;
        return true;
      })
      .sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.sku, b.sku))
      .map(cloneProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.products.get(id);
    if (!current) throw new ProductError("NOT_FOUND", "No existe un producto con ese id.");
    if (!isRecord(patch)) validation("Los cambios deben ser un objeto.");

    const candidate = cloneProduct(current);
    if (patch.name !== undefined) candidate.name = normalizeName(patch.name);
    if (patch.sku !== undefined) candidate.sku = normalizeSku(patch.sku);
    if (patch.price !== undefined) candidate.price = validatePrice(patch.price);
    if (patch.stock !== undefined) candidate.stock = validateStock(patch.stock);
    if (patch.category !== undefined) candidate.category = normalizeCategory(patch.category);
    if (patch.active !== undefined) {
      if (typeof patch.active !== "boolean") validation("El estado activo debe ser booleano.");
      candidate.active = patch.active;
    }

    if (
      candidate.sku !== current.sku &&
      [...this.products.values()].some(
        (product) => product.id !== id && product.sku === candidate.sku,
      )
    ) {
      throw new ProductError("DUPLICATE_SKU", "Ya existe un producto con ese SKU.");
    }

    const changed =
      candidate.name !== current.name ||
      candidate.sku !== current.sku ||
      candidate.price !== current.price ||
      candidate.stock !== current.stock ||
      candidate.category !== current.category ||
      candidate.active !== current.active || (patch.sku !== undefined && patch.sku !== current.sku);

    if (changed) candidate.updatedAt = new Date();
    this.products.set(id, candidate);
    return cloneProduct(candidate);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.products.get(id);
    if (!current) throw new ProductError("NOT_FOUND", "No existe un producto con ese id.");
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      validation("El ajuste de stock debe ser un entero distinto de cero.");
    }
    const stock = current.stock + delta;
    if (stock < 0) {
      throw new ProductError("INSUFFICIENT_STOCK", "El ajuste dejaría el stock por debajo de cero.");
    }

    const updated: Product = {
      ...current,
      stock,
      updatedAt: new Date(),
    };
    this.products.set(id, updated);
    return cloneProduct(updated);
  }
}


