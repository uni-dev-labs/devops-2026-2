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

const SKU_REGEX = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function cloneProduct(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

export class ProductStore {
  private products: Map<string, Product> = new Map();

  create(input: CreateProductInput): Product {
    if (!input || typeof input !== "object") {
      throw new ProductError("VALIDATION", "El payload es obligatorio");
    }

    // Name validation
    if (typeof input.name !== "string") {
      throw new ProductError("VALIDATION", "El nombre debe ser un texto");
    }
    const name = input.name.trim();
    if (name.length < 1 || name.length > 80) {
      throw new ProductError("VALIDATION", "El nombre debe tener entre 1 y 80 caracteres");
    }

    // SKU validation
    if (typeof input.sku !== "string") {
      throw new ProductError("VALIDATION", "El SKU debe ser un texto");
    }
    const sku = input.sku.trim().toUpperCase();
    if (sku.length < 2 || sku.length > 32 || !SKU_REGEX.test(sku)) {
      throw new ProductError("VALIDATION", "El SKU no tiene un formato válido");
    }

    // Duplicate SKU check
    for (const item of this.products.values()) {
      if (item.sku === sku) {
        throw new ProductError("DUPLICATE_SKU", `El SKU '${sku}' ya está en uso`);
      }
    }

    // Price validation
    if (
      typeof input.price !== "number" ||
      !Number.isFinite(input.price) ||
      Number.isNaN(input.price) ||
      input.price < 0
    ) {
      throw new ProductError("VALIDATION", "El precio debe ser un número finito mayor o igual a 0");
    }

    // Stock validation
    let stock = 0;
    if (input.stock !== undefined) {
      if (
        typeof input.stock !== "number" ||
        !Number.isInteger(input.stock) ||
        input.stock < 0
      ) {
        throw new ProductError("VALIDATION", "El stock debe ser un número entero mayor o igual a 0");
      }
      stock = input.stock;
    }

    // Category validation
    let category: string | null = null;
    if (input.category !== undefined && input.category !== null) {
      if (typeof input.category !== "string") {
        throw new ProductError("VALIDATION", "La categoría debe ser un texto o null");
      }
      const trimmedCat = input.category.trim();
      category = trimmedCat.length > 0 ? trimmedCat : null;
    }

    const now = new Date();
    const product: Product = {
      id: randomUUID(),
      name,
      sku,
      price: input.price,
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
    if (typeof id !== "string" || id.trim().length === 0) {
      return null;
    }
    const product = this.products.get(id);
    return product ? cloneProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") {
      return null;
    }
    const normalizedSku = sku.trim().toUpperCase();
    if (normalizedSku.length === 0) {
      return null;
    }
    for (const product of this.products.values()) {
      if (product.sku === normalizedSku) {
        return cloneProduct(product);
      }
    }
    return null;
  }

  list(query?: ListProductsQuery): Product[] {
    if (query) {
      if (query.minPrice !== undefined) {
        if (
          typeof query.minPrice !== "number" ||
          !Number.isFinite(query.minPrice) ||
          Number.isNaN(query.minPrice) ||
          query.minPrice < 0
        ) {
          throw new ProductError("VALIDATION", "minPrice debe ser un número finito >= 0");
        }
      }
      if (query.maxPrice !== undefined) {
        if (
          typeof query.maxPrice !== "number" ||
          !Number.isFinite(query.maxPrice) ||
          Number.isNaN(query.maxPrice) ||
          query.maxPrice < 0
        ) {
          throw new ProductError("VALIDATION", "maxPrice debe ser un número finito >= 0");
        }
      }
      if (
        query.minPrice !== undefined &&
        query.maxPrice !== undefined &&
        query.minPrice > query.maxPrice
      ) {
        throw new ProductError("VALIDATION", "minPrice no puede ser mayor que maxPrice");
      }
    }

    let items = Array.from(this.products.values());

    if (query) {
      if (typeof query.search === "string") {
        const search = query.search.trim().toLowerCase();
        if (search.length > 0) {
          items = items.filter((p) => p.name.toLowerCase().includes(search));
        }
      }

      if (typeof query.category === "string") {
        const cat = query.category.trim().toLowerCase();
        if (cat.length > 0) {
          items = items.filter(
            (p) => p.category !== null && p.category.toLowerCase() === cat
          );
        }
      }

      if (typeof query.active === "boolean") {
        items = items.filter((p) => p.active === query.active);
      }

      if (query.minPrice !== undefined) {
        items = items.filter((p) => p.price >= query.minPrice!);
      }

      if (query.maxPrice !== undefined) {
        items = items.filter((p) => p.price <= query.maxPrice!);
      }
    }

    items.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      if (cmp !== 0) {
        return cmp;
      }
      return a.sku.localeCompare(b.sku);
    });

    return items.map(cloneProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    if (typeof id !== "string") {
      throw new ProductError("NOT_FOUND", "Producto no encontrado");
    }

    const current = this.products.get(id);
    if (!current) {
      throw new ProductError("NOT_FOUND", `No existe un producto con id '${id}'`);
    }

    if (!patch || typeof patch !== "object") {
      return cloneProduct(current);
    }

    const hasAnyField =
      patch.name !== undefined ||
      patch.sku !== undefined ||
      patch.price !== undefined ||
      patch.stock !== undefined ||
      patch.category !== undefined ||
      patch.active !== undefined;

    if (!hasAnyField) {
      return cloneProduct(current);
    }

    let nextName = current.name;
    if (patch.name !== undefined) {
      if (typeof patch.name !== "string") {
        throw new ProductError("VALIDATION", "El nombre debe ser un texto");
      }
      const trimmed = patch.name.trim();
      if (trimmed.length < 1 || trimmed.length > 80) {
        throw new ProductError("VALIDATION", "El nombre debe tener entre 1 y 80 caracteres");
      }
      nextName = trimmed;
    }

    let nextSku = current.sku;
    if (patch.sku !== undefined) {
      if (typeof patch.sku !== "string") {
        throw new ProductError("VALIDATION", "El SKU debe ser un texto");
      }
      const normalizedSku = patch.sku.trim().toUpperCase();
      if (normalizedSku.length < 2 || normalizedSku.length > 32 || !SKU_REGEX.test(normalizedSku)) {
        throw new ProductError("VALIDATION", "El SKU no tiene un formato válido");
      }

      for (const item of this.products.values()) {
        if (item.id !== id && item.sku === normalizedSku) {
          throw new ProductError("DUPLICATE_SKU", `El SKU '${normalizedSku}' ya está en uso`);
        }
      }
      nextSku = normalizedSku;
    }

    let nextPrice = current.price;
    if (patch.price !== undefined) {
      if (
        typeof patch.price !== "number" ||
        !Number.isFinite(patch.price) ||
        Number.isNaN(patch.price) ||
        patch.price < 0
      ) {
        throw new ProductError("VALIDATION", "El precio debe ser un número finito >= 0");
      }
      nextPrice = patch.price;
    }

    let nextStock = current.stock;
    if (patch.stock !== undefined) {
      if (
        typeof patch.stock !== "number" ||
        !Number.isInteger(patch.stock) ||
        patch.stock < 0
      ) {
        throw new ProductError("VALIDATION", "El stock debe ser un entero >= 0");
      }
      nextStock = patch.stock;
    }

    let nextCategory = current.category;
    if (patch.category !== undefined) {
      if (patch.category === null) {
        nextCategory = null;
      } else if (typeof patch.category === "string") {
        const trimmed = patch.category.trim();
        nextCategory = trimmed.length > 0 ? trimmed : null;
      } else {
        throw new ProductError("VALIDATION", "La categoría debe ser un texto o null");
      }
    }

    let nextActive = current.active;
    if (patch.active !== undefined) {
      if (typeof patch.active !== "boolean") {
        throw new ProductError("VALIDATION", "Active debe ser un booleano");
      }
      nextActive = patch.active;
    }

    const updated: Product = {
      id: current.id,
      name: nextName,
      sku: nextSku,
      price: nextPrice,
      stock: nextStock,
      category: nextCategory,
      active: nextActive,
      createdAt: current.createdAt,
      updatedAt: new Date(),
    };

    this.products.set(id, cloneProduct(updated));
    return cloneProduct(updated);
  }

  remove(id: string): boolean {
    if (typeof id !== "string") {
      return false;
    }
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    if (
      typeof delta !== "number" ||
      !Number.isInteger(delta) ||
      Number.isNaN(delta) ||
      delta === 0
    ) {
      throw new ProductError("VALIDATION", "El ajuste debe ser un entero distinto de cero");
    }

    if (typeof id !== "string") {
      throw new ProductError("NOT_FOUND", "Producto no encontrado");
    }

    const product = this.products.get(id);
    if (!product) {
      throw new ProductError("NOT_FOUND", `No existe un producto con id '${id}'`);
    }

    const newStock = product.stock + delta;
    if (newStock < 0) {
      throw new ProductError("INSUFFICIENT_STOCK", "El stock no puede quedar negativo");
    }

    product.stock = newStock;
    product.updatedAt = new Date();

    return cloneProduct(product);
  }
}
