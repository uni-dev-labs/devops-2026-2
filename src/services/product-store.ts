import { randomUUID } from "node:crypto";

/** Contrato del almacén de productos. */
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

function normalizeName(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProductError("VALIDATION", "El nombre debe ser texto");
  }
  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    throw new ProductError("VALIDATION", "El nombre debe tener entre 1 y 80 caracteres");
  }
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProductError("VALIDATION", "El SKU debe ser texto");
  }
  const sku = value.trim().toUpperCase();
  if (sku.length < 2 || sku.length > 32 || !SKU_PATTERN.test(sku)) {
    throw new ProductError("VALIDATION", "El SKU tiene un formato inválido");
  }
  return sku;
}

function validatePrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ProductError("VALIDATION", "El precio debe ser un número finito no negativo");
  }
  return value;
}

function validateStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ProductError("VALIDATION", "El stock debe ser un entero no negativo");
  }
  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new ProductError("VALIDATION", "La categoría debe ser texto o null");
  }
  return value.trim() || null;
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

  create(input: CreateProductInput): Product {
    if (!input || typeof input !== "object") {
      throw new ProductError("VALIDATION", "Se requiere un producto válido");
    }

    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = validatePrice(input.price);
    const stock = validateStock(input.stock === undefined ? 0 : input.stock);
    const category = normalizeCategory(input.category);

    if (this.findBySku(sku)) {
      throw new ProductError("DUPLICATE_SKU", "Ya existe un producto con ese SKU");
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
      createdAt: new Date(now),
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
    if (typeof sku !== "string") return null;
    const product = this.findBySku(sku.trim().toUpperCase());
    return product ? copyProduct(product) : null;
  }

  list(query?: ListProductsQuery): Product[] {
    const minPrice = query?.minPrice;
    const maxPrice = query?.maxPrice;

    if (minPrice !== undefined) validatePrice(minPrice);
    if (maxPrice !== undefined) validatePrice(maxPrice);
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      throw new ProductError("VALIDATION", "El precio mínimo no puede superar el máximo");
    }

    if (query?.search !== undefined && typeof query.search !== "string") {
      throw new ProductError("VALIDATION", "La búsqueda debe ser texto");
    }
    if (query?.category !== undefined && typeof query.category !== "string") {
      throw new ProductError("VALIDATION", "La categoría de búsqueda debe ser texto");
    }
    if (query?.active !== undefined && typeof query.active !== "boolean") {
      throw new ProductError("VALIDATION", "El filtro active debe ser booleano");
    }

    const search = query?.search?.trim().toLocaleLowerCase("es") ?? "";
    const category = query?.category?.trim().toLocaleLowerCase("es") ?? "";

    return Array.from(this.products.values())
      .filter((product) => {
        if (search && !product.name.toLocaleLowerCase("es").includes(search)) return false;
        if (category && product.category?.toLocaleLowerCase("es") !== category) return false;
        if (query?.active !== undefined && product.active !== query.active) return false;
        if (minPrice !== undefined && product.price < minPrice) return false;
        if (maxPrice !== undefined && product.price > maxPrice) return false;
        return true;
      })
      .sort((a, b) => {
        const nameOrder = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
        return nameOrder || a.sku.localeCompare(b.sku, "es", { sensitivity: "base" });
      })
      .map(copyProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.products.get(id);
    if (!current) throw new ProductError("NOT_FOUND", "El producto no existe");
    if (!patch || typeof patch !== "object") {
      throw new ProductError("VALIDATION", "Los cambios deben ser un objeto");
    }

    const next: Product = { ...current };
    let hasChanges = false;

    if (patch.name !== undefined) {
      next.name = normalizeName(patch.name);
      hasChanges = true;
    }
    if (patch.sku !== undefined) {
      next.sku = normalizeSku(patch.sku);
      hasChanges = true;
    }
    if (patch.price !== undefined) {
      next.price = validatePrice(patch.price);
      hasChanges = true;
    }
    if (patch.stock !== undefined) {
      next.stock = validateStock(patch.stock);
      hasChanges = true;
    }
    if (patch.category !== undefined) {
      next.category = normalizeCategory(patch.category);
      hasChanges = true;
    }
    if (patch.active !== undefined) {
      if (typeof patch.active !== "boolean") {
        throw new ProductError("VALIDATION", "El estado active debe ser booleano");
      }
      next.active = patch.active;
      hasChanges = true;
    }

    const duplicate = this.findBySku(next.sku);
    if (duplicate && duplicate.id !== id) {
      throw new ProductError("DUPLICATE_SKU", "Ya existe otro producto con ese SKU");
    }

    if (hasChanges) {
      next.updatedAt = new Date();
      this.products.set(id, next);
    }
    return copyProduct(hasChanges ? next : current);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.products.get(id);
    if (!current) throw new ProductError("NOT_FOUND", "El producto no existe");
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      throw new ProductError("VALIDATION", "El ajuste debe ser un entero distinto de cero");
    }
    if (current.stock + delta < 0) {
      throw new ProductError("INSUFFICIENT_STOCK", "No hay existencias suficientes");
    }

    const next: Product = {
      ...current,
      stock: current.stock + delta,
      updatedAt: new Date(),
    };
    this.products.set(id, next);
    return copyProduct(next);
  }

  private findBySku(sku: string): Product | undefined {
    return Array.from(this.products.values()).find((product) => product.sku === sku);
  }
}
