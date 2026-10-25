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

const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function validateName(name: unknown): string {
  if (typeof name !== "string") {
    throw new ProductError("VALIDATION", "El nombre debe ser una cadena de texto");
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    throw new ProductError(
      "VALIDATION",
      "El nombre debe tener entre 1 y 80 caracteres después de recortar",
    );
  }
  return trimmed;
}

function validateSku(sku: unknown): string {
  if (typeof sku !== "string") {
    throw new ProductError("VALIDATION", "El SKU debe ser una cadena de texto");
  }
  const normalized = sku.trim().toUpperCase();
  if (normalized.length < 2 || normalized.length > 32 || !SKU_PATTERN.test(normalized)) {
    throw new ProductError("VALIDATION", "El SKU tiene un formato o longitud inválidos");
  }
  return normalized;
}

function validatePrice(price: unknown): number {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    throw new ProductError(
      "VALIDATION",
      "El precio debe ser un número finito mayor o igual a 0",
    );
  }
  return price;
}

function validateStock(stock: unknown): number {
  if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0) {
    throw new ProductError(
      "VALIDATION",
      "El stock debe ser un número entero mayor o igual a 0",
    );
  }
  return stock;
}

function normalizeCategory(category: unknown): string | null {
  if (category === undefined || category === null) {
    return null;
  }
  if (typeof category !== "string") {
    throw new ProductError("VALIDATION", "La categoría debe ser una cadena de texto o null");
  }
  const trimmed = category.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cloneProduct(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

export class ProductStore {
  private products = new Map<string, Product>();

  create(input: CreateProductInput): Product {
    if (!input || typeof input !== "object") {
      throw new ProductError("VALIDATION", "Los datos del producto son inválidos");
    }

    const name = validateName(input.name);
    const sku = validateSku(input.sku);
    const price = validatePrice(input.price);

    let stock = 0;
    if (input.stock !== undefined) {
      stock = validateStock(input.stock);
    }

    const category = normalizeCategory(input.category);

    for (const existing of this.products.values()) {
      if (existing.sku === sku) {
        throw new ProductError("DUPLICATE_SKU", `Ya existe un producto con el SKU: ${sku}`);
      }
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
      updatedAt: now,
    };

    this.products.set(product.id, cloneProduct(product));
    return cloneProduct(product);
  }

  getById(id: string): Product | null {
    if (!id || typeof id !== "string") {
      return null;
    }
    const product = this.products.get(id);
    return product ? cloneProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (!sku || typeof sku !== "string") {
      return null;
    }
    const normalizedSku = sku.trim().toUpperCase();
    for (const product of this.products.values()) {
      if (product.sku === normalizedSku) {
        return cloneProduct(product);
      }
    }
    return null;
  }

  list(query?: ListProductsQuery): Product[] {
    let minPrice: number | undefined;
    let maxPrice: number | undefined;

    if (query?.minPrice !== undefined) {
      if (typeof query.minPrice !== "number" || !Number.isFinite(query.minPrice) || query.minPrice < 0) {
        throw new ProductError("VALIDATION", "minPrice debe ser un número finito mayor o igual a 0");
      }
      minPrice = query.minPrice;
    }

    if (query?.maxPrice !== undefined) {
      if (typeof query.maxPrice !== "number" || !Number.isFinite(query.maxPrice) || query.maxPrice < 0) {
        throw new ProductError("VALIDATION", "maxPrice debe ser un número finito mayor o igual a 0");
      }
      maxPrice = query.maxPrice;
    }

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      throw new ProductError("VALIDATION", "minPrice no puede ser mayor que maxPrice");
    }

    const filterSearch = query?.search?.trim();
    const filterCategory = query?.category?.trim();
    const filterActive = query?.active;

    const results: Product[] = [];

    for (const product of this.products.values()) {
      if (filterSearch && filterSearch.length > 0) {
        if (!product.name.toLowerCase().includes(filterSearch.toLowerCase())) {
          continue;
        }
      }

      if (filterCategory && filterCategory.length > 0) {
        if (!product.category || product.category.toLowerCase() !== filterCategory.toLowerCase()) {
          continue;
        }
      }

      if (filterActive !== undefined) {
        if (product.active !== filterActive) {
          continue;
        }
      }

      if (minPrice !== undefined && product.price < minPrice) {
        continue;
      }

      if (maxPrice !== undefined && product.price > maxPrice) {
        continue;
      }

      results.push(cloneProduct(product));
    }

    results.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      if (cmp !== 0) {
        return cmp;
      }
      return a.sku.localeCompare(b.sku);
    });

    return results;
  }

  update(id: string, patch: UpdateProductInput): Product {
    if (!id || typeof id !== "string") {
      throw new ProductError("NOT_FOUND", "Producto no encontrado");
    }

    const current = this.products.get(id);
    if (!current) {
      throw new ProductError("NOT_FOUND", "Producto no encontrado");
    }

    if (!patch || typeof patch !== "object") {
      throw new ProductError("VALIDATION", "El objeto de actualización es inválido");
    }

    let hasChanges = false;
    let nextName: string | undefined;
    let nextSku: string | undefined;
    let nextPrice: number | undefined;
    let nextStock: number | undefined;
    let nextCategory: string | null | undefined;
    let nextActive: boolean | undefined;

    if (patch.name !== undefined) {
      nextName = validateName(patch.name);
      hasChanges = true;
    }

    if (patch.sku !== undefined) {
      nextSku = validateSku(patch.sku);
      hasChanges = true;

      for (const [existingId, existing] of this.products.entries()) {
        if (existingId !== id && existing.sku === nextSku) {
          throw new ProductError("DUPLICATE_SKU", `Ya existe otro producto con el SKU: ${nextSku}`);
        }
      }
    }

    if (patch.price !== undefined) {
      nextPrice = validatePrice(patch.price);
      hasChanges = true;
    }

    if (patch.stock !== undefined) {
      nextStock = validateStock(patch.stock);
      hasChanges = true;
    }

    if (patch.category !== undefined) {
      nextCategory = normalizeCategory(patch.category);
      hasChanges = true;
    }

    if (patch.active !== undefined) {
      if (typeof patch.active !== "boolean") {
        throw new ProductError("VALIDATION", "active debe ser un booleano");
      }
      nextActive = patch.active;
      hasChanges = true;
    }

    if (!hasChanges) {
      return cloneProduct(current);
    }

    const updated: Product = {
      ...current,
      name: nextName !== undefined ? nextName : current.name,
      sku: nextSku !== undefined ? nextSku : current.sku,
      price: nextPrice !== undefined ? nextPrice : current.price,
      stock: nextStock !== undefined ? nextStock : current.stock,
      category: nextCategory !== undefined ? nextCategory : current.category,
      active: nextActive !== undefined ? nextActive : current.active,
      updatedAt: new Date(),
    };

    this.products.set(id, cloneProduct(updated));
    return cloneProduct(updated);
  }

  remove(id: string): boolean {
    if (!id || typeof id !== "string") {
      return false;
    }
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      throw new ProductError("VALIDATION", "delta debe ser un entero distinto de cero");
    }

    if (!id || typeof id !== "string") {
      throw new ProductError("NOT_FOUND", "Producto no encontrado");
    }

    const product = this.products.get(id);
    if (!product) {
      throw new ProductError("NOT_FOUND", "Producto no encontrado");
    }

    const nextStock = product.stock + delta;
    if (nextStock < 0) {
      throw new ProductError(
        "INSUFFICIENT_STOCK",
        `Stock insuficiente: el stock actual (${product.stock}) no permite el ajuste de ${delta}`,
      );
    }

    product.stock = nextStock;
    product.updatedAt = new Date();

    return cloneProduct(product);
  }
}
