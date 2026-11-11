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

import { randomUUID } from "node:crypto";

const SKU_REGEX = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export class ProductStore {
  private readonly products = new Map<string, Product>();

  private cloneProduct(product: Product): Product {
    return {
      ...product,
      createdAt: new Date(product.createdAt.getTime()),
      updatedAt: new Date(product.updatedAt.getTime()),
    };
  }

  create(input: CreateProductInput): Product {
    if (typeof input.name !== "string") {
      throw new ProductError("VALIDATION", "El nombre es obligatorio y debe ser un texto.");
    }
    const trimmedName = input.name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 80) {
      throw new ProductError("VALIDATION", "El nombre debe tener entre 1 y 80 caracteres.");
    }

    if (typeof input.sku !== "string") {
      throw new ProductError("VALIDATION", "El SKU es obligatorio y debe ser un texto.");
    }
    const normalizedSku = input.sku.trim().toUpperCase();
    if (
      normalizedSku.length < 2 ||
      normalizedSku.length > 32 ||
      !SKU_REGEX.test(normalizedSku)
    ) {
      throw new ProductError("VALIDATION", "El formato del SKU no es válido.");
    }

    for (const p of this.products.values()) {
      if (p.sku.toUpperCase() === normalizedSku) {
        throw new ProductError("DUPLICATE_SKU", `El SKU "${normalizedSku}" ya pertenece a otro producto.`);
      }
    }

    if (
      typeof input.price !== "number" ||
      Number.isNaN(input.price) ||
      !Number.isFinite(input.price) ||
      input.price < 0
    ) {
      throw new ProductError("VALIDATION", "El precio debe ser un número finito mayor o igual a 0.");
    }

    let stock = 0;
    if (input.stock !== undefined) {
      if (
        typeof input.stock !== "number" ||
        Number.isNaN(input.stock) ||
        !Number.isInteger(input.stock) ||
        input.stock < 0
      ) {
        throw new ProductError("VALIDATION", "El stock debe ser un número entero mayor o igual a 0.");
      }
      stock = input.stock;
    }

    let category: string | null = null;
    if (input.category !== undefined && input.category !== null) {
      if (typeof input.category !== "string") {
        throw new ProductError("VALIDATION", "La categoría debe ser un texto o null.");
      }
      category = input.category.trim() || null;
    }

    const now = new Date();
    const product: Product = {
      id: randomUUID(),
      name: trimmedName,
      sku: normalizedSku,
      price: input.price,
      stock,
      category,
      active: true,
      createdAt: now,
      updatedAt: new Date(now.getTime()),
    };

    this.products.set(product.id, this.cloneProduct(product));
    return this.cloneProduct(product);
  }

  getById(id: string): Product | null {
    if (typeof id !== "string" || !id.trim()) {
      return null;
    }
    const product = this.products.get(id);
    return product ? this.cloneProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string" || !sku.trim()) {
      return null;
    }
    const normalized = sku.trim().toUpperCase();
    for (const p of this.products.values()) {
      if (p.sku.toUpperCase() === normalized) {
        return this.cloneProduct(p);
      }
    }
    return null;
  }

  list(query?: ListProductsQuery): Product[] {
    if (query?.minPrice !== undefined) {
      if (
        typeof query.minPrice !== "number" ||
        Number.isNaN(query.minPrice) ||
        !Number.isFinite(query.minPrice) ||
        query.minPrice < 0
      ) {
        throw new ProductError("VALIDATION", "El minPrice debe ser un número finito mayor o igual a 0.");
      }
    }

    if (query?.maxPrice !== undefined) {
      if (
        typeof query.maxPrice !== "number" ||
        Number.isNaN(query.maxPrice) ||
        !Number.isFinite(query.maxPrice) ||
        query.maxPrice < 0
      ) {
        throw new ProductError("VALIDATION", "El maxPrice debe ser un número finito mayor o igual a 0.");
      }
    }

    if (
      query?.minPrice !== undefined &&
      query?.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new ProductError("VALIDATION", "minPrice no puede ser mayor que maxPrice.");
    }

    let results = Array.from(this.products.values());

    if (query) {
      if (query.search !== undefined) {
        const s = query.search.trim().toLowerCase();
        if (s.length > 0) {
          results = results.filter((p) => p.name.toLowerCase().includes(s));
        }
      }

      if (query.category !== undefined) {
        const c = query.category.trim().toLowerCase();
        if (c.length > 0) {
          results = results.filter((p) => p.category !== null && p.category.toLowerCase() === c);
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
      const cmp = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      if (cmp !== 0) {
        return cmp;
      }
      return a.sku.localeCompare(b.sku);
    });

    return results.map((p) => this.cloneProduct(p));
  }

  update(id: string, patch: UpdateProductInput): Product {
    const existing = this.products.get(id);
    if (!existing) {
      throw new ProductError("NOT_FOUND", `Producto con id ${id} no encontrado.`);
    }

    const hasFields =
      patch.name !== undefined ||
      patch.sku !== undefined ||
      patch.price !== undefined ||
      patch.stock !== undefined ||
      patch.category !== undefined ||
      patch.active !== undefined;

    if (!hasFields) {
      return this.cloneProduct(existing);
    }

    let updatedName = existing.name;
    if (patch.name !== undefined) {
      if (typeof patch.name !== "string") {
        throw new ProductError("VALIDATION", "El nombre debe ser un texto.");
      }
      const trimmed = patch.name.trim();
      if (trimmed.length < 1 || trimmed.length > 80) {
        throw new ProductError("VALIDATION", "El nombre debe tener entre 1 y 80 caracteres.");
      }
      updatedName = trimmed;
    }

    let updatedSku = existing.sku;
    if (patch.sku !== undefined) {
      if (typeof patch.sku !== "string") {
        throw new ProductError("VALIDATION", "El SKU debe ser un texto.");
      }
      const normalized = patch.sku.trim().toUpperCase();
      if (
        normalized.length < 2 ||
        normalized.length > 32 ||
        !SKU_REGEX.test(normalized)
      ) {
        throw new ProductError("VALIDATION", "El SKU no tiene un formato válido.");
      }
      for (const p of this.products.values()) {
        if (p.id !== id && p.sku.toUpperCase() === normalized) {
          throw new ProductError("DUPLICATE_SKU", `El SKU "${normalized}" ya pertenece a otro producto.`);
        }
      }
      updatedSku = normalized;
    }

    let updatedPrice = existing.price;
    if (patch.price !== undefined) {
      if (
        typeof patch.price !== "number" ||
        Number.isNaN(patch.price) ||
        !Number.isFinite(patch.price) ||
        patch.price < 0
      ) {
        throw new ProductError("VALIDATION", "El precio debe ser un número finito mayor o igual a 0.");
      }
      updatedPrice = patch.price;
    }

    let updatedStock = existing.stock;
    if (patch.stock !== undefined) {
      if (
        typeof patch.stock !== "number" ||
        Number.isNaN(patch.stock) ||
        !Number.isInteger(patch.stock) ||
        patch.stock < 0
      ) {
        throw new ProductError("VALIDATION", "El stock debe ser un entero mayor o igual a 0.");
      }
      updatedStock = patch.stock;
    }

    let updatedCategory = existing.category;
    if (patch.category !== undefined) {
      if (patch.category === null) {
        updatedCategory = null;
      } else if (typeof patch.category === "string") {
        updatedCategory = patch.category.trim() || null;
      } else {
        throw new ProductError("VALIDATION", "La categoría debe ser un texto o null.");
      }
    }

    let updatedActive = existing.active;
    if (patch.active !== undefined) {
      if (typeof patch.active !== "boolean") {
        throw new ProductError("VALIDATION", "El campo active debe ser booleano.");
      }
      updatedActive = patch.active;
    }

    existing.name = updatedName;
    existing.sku = updatedSku;
    existing.price = updatedPrice;
    existing.stock = updatedStock;
    existing.category = updatedCategory;
    existing.active = updatedActive;
    existing.updatedAt = new Date();

    return this.cloneProduct(existing);
  }

  remove(id: string): boolean {
    if (typeof id !== "string" || !id.trim()) {
      return false;
    }
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const existing = this.products.get(id);
    if (!existing) {
      throw new ProductError("NOT_FOUND", `Producto con id ${id} no encontrado.`);
    }

    if (
      typeof delta !== "number" ||
      Number.isNaN(delta) ||
      !Number.isInteger(delta) ||
      delta === 0
    ) {
      throw new ProductError("VALIDATION", "El delta debe ser un entero distinto de cero.");
    }

    if (existing.stock + delta < 0) {
      throw new ProductError("INSUFFICIENT_STOCK", "Stock insuficiente para realizar el ajuste.");
    }

    existing.stock += delta;
    existing.updatedAt = new Date();

    return this.cloneProduct(existing);
  }
}
