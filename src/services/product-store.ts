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

function validateAndNormalizeSku(sku: unknown): string {
  if (typeof sku !== "string") {
    throw new ProductError("VALIDATION", "El SKU debe ser una cadena de texto");
  }
  const normalized = sku.trim().toUpperCase();
  if (normalized.length < 2 || normalized.length > 32 || !SKU_REGEX.test(normalized)) {
    throw new ProductError("VALIDATION", "El formato del SKU no es válido");
  }
  return normalized;
}

function validateAndNormalizeName(name: unknown): string {
  if (typeof name !== "string") {
    throw new ProductError("VALIDATION", "El nombre debe ser una cadena de texto");
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    throw new ProductError("VALIDATION", "El nombre debe tener entre 1 y 80 caracteres");
  }
  return trimmed;
}

function validatePrice(price: unknown): number {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    throw new ProductError("VALIDATION", "El precio debe ser un número finito mayor o igual a 0");
  }
  return price;
}

function validateStock(stock: unknown): number {
  if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0) {
    throw new ProductError("VALIDATION", "El stock debe ser un entero mayor o igual a 0");
  }
  return stock;
}

function validateAndNormalizeCategory(category: unknown): string | null {
  if (category === undefined || category === null) {
    return null;
  }
  if (typeof category !== "string") {
    throw new ProductError("VALIDATION", "La categoría debe ser una cadena de texto o null");
  }
  const trimmed = category.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateActive(active: unknown): boolean {
  if (typeof active !== "boolean") {
    throw new ProductError("VALIDATION", "El campo active debe ser un booleano");
  }
  return active;
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
    if (!input || typeof input !== "object") {
      throw new ProductError("VALIDATION", "Los datos de entrada son requeridos");
    }

    const name = validateAndNormalizeName(input.name);
    const sku = validateAndNormalizeSku(input.sku);
    const price = validatePrice(input.price);
    const stock = input.stock !== undefined ? validateStock(input.stock) : 0;
    const category = validateAndNormalizeCategory(input.category);

    for (const existing of this.products.values()) {
      if (existing.sku === sku) {
        throw new ProductError("DUPLICATE_SKU", `Ya existe un producto con el SKU ${sku}`);
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
    const product = this.products.get(id);
    return product ? cloneProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") {
      return null;
    }
    const normalized = sku.trim().toUpperCase();
    for (const product of this.products.values()) {
      if (product.sku === normalized) {
        return cloneProduct(product);
      }
    }
    return null;
  }

  list(query?: ListProductsQuery): Product[] {
    if (query) {
      if (query.minPrice !== undefined) {
        if (typeof query.minPrice !== "number" || !Number.isFinite(query.minPrice) || query.minPrice < 0) {
          throw new ProductError("VALIDATION", "minPrice debe ser un número finito mayor o igual a 0");
        }
      }
      if (query.maxPrice !== undefined) {
        if (typeof query.maxPrice !== "number" || !Number.isFinite(query.maxPrice) || query.maxPrice < 0) {
          throw new ProductError("VALIDATION", "maxPrice debe ser un número finito mayor o igual a 0");
        }
      }
      if (query.minPrice !== undefined && query.maxPrice !== undefined && query.minPrice > query.maxPrice) {
        throw new ProductError("VALIDATION", "minPrice no puede ser mayor que maxPrice");
      }
    }

    let results = Array.from(this.products.values());

    if (query) {
      if (query.search !== undefined && typeof query.search === "string") {
        const searchTrimmed = query.search.trim().toLowerCase();
        if (searchTrimmed.length > 0) {
          results = results.filter((p) => p.name.toLowerCase().includes(searchTrimmed));
        }
      }

      if (query.category !== undefined && typeof query.category === "string") {
        const catTrimmed = query.category.trim().toLowerCase();
        if (catTrimmed.length > 0) {
          results = results.filter(
            (p) => p.category !== null && p.category.toLowerCase() === catTrimmed,
          );
        }
      }

      if (query.active !== undefined) {
        results = results.filter((p) => p.active === query.active);
      }

      if (query.minPrice !== undefined) {
        results = results.filter((p) => p.price >= query.minPrice!);
      }

      if (query.maxPrice !== undefined) {
        results = results.filter((p) => p.price <= query.maxPrice!);
      }
    }

    results.sort((a, b) => {
      const nameDiff = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      if (nameDiff !== 0) {
        return nameDiff;
      }
      return a.sku.localeCompare(b.sku);
    });

    return results.map(cloneProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const existing = this.products.get(id);
    if (!existing) {
      throw new ProductError("NOT_FOUND", `Producto con ID ${id} no encontrado`);
    }

    if (!patch || typeof patch !== "object") {
      throw new ProductError("VALIDATION", "El objeto de actualización es requerido");
    }

    const hasUpdates =
      patch.name !== undefined ||
      patch.sku !== undefined ||
      patch.price !== undefined ||
      patch.stock !== undefined ||
      patch.category !== undefined ||
      patch.active !== undefined;

    if (!hasUpdates) {
      return cloneProduct(existing);
    }

    const updatedName = patch.name !== undefined ? validateAndNormalizeName(patch.name) : undefined;
    const updatedSku = patch.sku !== undefined ? validateAndNormalizeSku(patch.sku) : undefined;
    const updatedPrice = patch.price !== undefined ? validatePrice(patch.price) : undefined;
    const updatedStock = patch.stock !== undefined ? validateStock(patch.stock) : undefined;
    const updatedCategory =
      patch.category !== undefined ? validateAndNormalizeCategory(patch.category) : undefined;
    const updatedActive = patch.active !== undefined ? validateActive(patch.active) : undefined;

    if (updatedSku !== undefined) {
      for (const prod of this.products.values()) {
        if (prod.id !== id && prod.sku === updatedSku) {
          throw new ProductError("DUPLICATE_SKU", `Ya existe otro producto con el SKU ${updatedSku}`);
        }
      }
    }

    const updatedProduct: Product = {
      ...existing,
      ...(updatedName !== undefined && { name: updatedName }),
      ...(updatedSku !== undefined && { sku: updatedSku }),
      ...(updatedPrice !== undefined && { price: updatedPrice }),
      ...(updatedStock !== undefined && { stock: updatedStock }),
      ...(patch.category !== undefined && { category: updatedCategory }),
      ...(updatedActive !== undefined && { active: updatedActive }),
      createdAt: new Date(existing.createdAt.getTime()),
      updatedAt: new Date(),
    };

    this.products.set(id, cloneProduct(updatedProduct));
    return cloneProduct(updatedProduct);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const existing = this.products.get(id);
    if (!existing) {
      throw new ProductError("NOT_FOUND", `Producto con ID ${id} no encontrado`);
    }

    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      throw new ProductError("VALIDATION", "El ajuste debe ser un entero distinto de cero");
    }

    const newStock = existing.stock + delta;
    if (newStock < 0) {
      throw new ProductError("INSUFFICIENT_STOCK", "El ajuste dejaría el stock por debajo de cero");
    }

    const updatedProduct: Product = {
      ...existing,
      stock: newStock,
      createdAt: new Date(existing.createdAt.getTime()),
      updatedAt: new Date(),
    };

    this.products.set(id, cloneProduct(updatedProduct));
    return cloneProduct(updatedProduct);
  }
}
