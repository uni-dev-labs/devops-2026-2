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

function validationError(message: string): never {
  throw new ProductError("VALIDATION", message);
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") {
    return validationError("El nombre debe ser texto");
  }

  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    return validationError("El nombre debe tener entre 1 y 80 caracteres");
  }
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") {
    return validationError("El SKU debe ser texto");
  }

  const sku = value.trim().toUpperCase();
  if (sku.length < 2 || sku.length > 32 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(sku)) {
    return validationError("El SKU tiene un formato inválido");
  }
  return sku;
}

function validatePrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return validationError("El precio debe ser un número finito mayor o igual a cero");
  }
  return value;
}

function validateStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return validationError("El stock debe ser un entero mayor o igual a cero");
  }
  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return validationError("La categoría debe ser texto o null");
  }

  const category = value.trim();
  return category.length > 0 ? category : null;
}

function copyProduct(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt),
    updatedAt: new Date(product.updatedAt),
  };
}

export class ProductStore {
  private readonly products = new Map<string, Product>();

  private hasSku(sku: string, exceptId?: string): boolean {
    for (const product of this.products.values()) {
      if (product.sku === sku && product.id !== exceptId) {
        return true;
      }
    }
    return false;
  }

  create(input: CreateProductInput): Product {
    if (typeof input !== "object" || input === null) {
      return validationError("Los datos del producto son inválidos");
    }

    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = validatePrice(input.price);
    const stock = input.stock === undefined ? 0 : validateStock(input.stock);
    const category = normalizeCategory(input.category);

    if (this.hasSku(sku)) {
      throw new ProductError("DUPLICATE_SKU", "El SKU ya pertenece a otro producto");
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

    const normalizedSku = sku.trim().toUpperCase();
    const product = [...this.products.values()].find((item) => item.sku === normalizedSku);
    return product ? copyProduct(product) : null;
  }

  list(query?: ListProductsQuery): Product[] {
    if (query !== undefined && (typeof query !== "object" || query === null)) {
      return validationError("Los filtros son inválidos");
    }

    const filters = query ?? {};
    let search: string | null = null;
    let category: string | null = null;

    if (filters.search !== undefined) {
      if (typeof filters.search !== "string") {
        return validationError("La búsqueda debe ser texto");
      }
      const value = filters.search.trim().toLowerCase();
      search = value.length > 0 ? value : null;
    }

    if (filters.category !== undefined) {
      if (typeof filters.category !== "string") {
        return validationError("La categoría debe ser texto");
      }
      const value = filters.category.trim().toLowerCase();
      category = value.length > 0 ? value : null;
    }

    if (filters.active !== undefined && typeof filters.active !== "boolean") {
      return validationError("El filtro active debe ser booleano");
    }

    const minPrice =
      filters.minPrice === undefined ? undefined : validatePrice(filters.minPrice);
    const maxPrice =
      filters.maxPrice === undefined ? undefined : validatePrice(filters.maxPrice);
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      return validationError("El precio mínimo no puede superar el máximo");
    }

    return [...this.products.values()]
      .filter((product) => {
        if (search !== null && !product.name.toLowerCase().includes(search)) {
          return false;
        }
        if (category !== null && product.category?.toLowerCase() !== category) {
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
        return byName || left.sku.localeCompare(right.sku);
      })
      .map(copyProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.products.get(id);
    if (!current) {
      throw new ProductError("NOT_FOUND", "No se encontró el producto");
    }
    if (typeof patch !== "object" || patch === null) {
      return validationError("Los datos de actualización son inválidos");
    }

    const updated: Product = { ...current };
    if (patch.name !== undefined) {
      updated.name = normalizeName(patch.name);
    }
    if (patch.sku !== undefined) {
      updated.sku = normalizeSku(patch.sku);
    }
    if (patch.price !== undefined) {
      updated.price = validatePrice(patch.price);
    }
    if (patch.stock !== undefined) {
      updated.stock = validateStock(patch.stock);
    }
    if (patch.category !== undefined) {
      updated.category = normalizeCategory(patch.category);
    }
    if (patch.active !== undefined) {
      if (typeof patch.active !== "boolean") {
        return validationError("El estado active debe ser booleano");
      }
      updated.active = patch.active;
    }

    if (this.hasSku(updated.sku, id)) {
      throw new ProductError("DUPLICATE_SKU", "El SKU ya pertenece a otro producto");
    }

    const changed =
      (patch.name !== undefined && patch.name !== current.name) ||
      (patch.sku !== undefined && patch.sku !== current.sku) ||
      (patch.price !== undefined && patch.price !== current.price) ||
      (patch.stock !== undefined && patch.stock !== current.stock) ||
      (patch.category !== undefined && patch.category !== current.category) ||
      (patch.active !== undefined && patch.active !== current.active);
    if (changed) {
      updated.updatedAt = new Date();
      this.products.set(id, updated);
    }
    return copyProduct(changed ? updated : current);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.products.get(id);
    if (!current) {
      throw new ProductError("NOT_FOUND", "No se encontró el producto");
    }
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      return validationError("El ajuste de stock debe ser un entero distinto de cero");
    }

    const stock = current.stock + delta;
    if (stock < 0) {
      throw new ProductError("INSUFFICIENT_STOCK", "El stock no puede quedar por debajo de cero");
    }

    const updated = { ...current, stock, updatedAt: new Date() };
    this.products.set(id, updated);
    return copyProduct(updated);
  }
}
