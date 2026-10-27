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

const SKU_REGEX = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function validateName(name: unknown): string {
  if (typeof name !== "string") {
    throw new ProductError("VALIDATION", "El nombre debe ser una cadena");
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    throw new ProductError("VALIDATION", "El nombre debe tener entre 1 y 80 caracteres");
  }
  return trimmed;
}

function validateSku(sku: unknown): string {
  if (typeof sku !== "string") {
    throw new ProductError("VALIDATION", "El SKU debe ser una cadena");
  }
  const normalized = sku.trim().toUpperCase();
  if (normalized.length < 2 || normalized.length > 32) {
    throw new ProductError("VALIDATION", "El SKU debe tener entre 2 y 32 caracteres");
  }
  if (!SKU_REGEX.test(normalized)) {
    throw new ProductError("VALIDATION", "El formato del SKU es inválido");
  }
  return normalized;
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

function validateCategory(category: unknown): string | null {
  if (category === undefined || category === null) {
    return null;
  }
  if (typeof category !== "string") {
    throw new ProductError("VALIDATION", "La categoría debe ser una cadena de texto o null");
  }
  const trimmed = category.trim();
  return trimmed === "" ? null : trimmed;
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
  private readonly productsById = new Map<string, Product>();
  private readonly productsBySku = new Map<string, Product>();

  create(input: CreateProductInput): Product {
    if (!input || typeof input !== "object") {
      throw new ProductError("VALIDATION", "Los datos de entrada deben ser un objeto");
    }

    const name = validateName(input.name);
    const sku = validateSku(input.sku);

    if (this.productsBySku.has(sku)) {
      throw new ProductError("DUPLICATE_SKU", `Ya existe un producto con el SKU: ${sku}`);
    }

    const price = validatePrice(input.price);

    let stock = 0;
    if (input.stock !== undefined) {
      stock = validateStock(input.stock);
    }

    const category = validateCategory(input.category);

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

    this.productsById.set(product.id, product);
    this.productsBySku.set(product.sku, product);

    return cloneProduct(product);
  }

  getById(id: string): Product | null {
    if (!id || typeof id !== "string") {
      return null;
    }
    const product = this.productsById.get(id);
    return product ? cloneProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (!sku || typeof sku !== "string") {
      return null;
    }
    const normalizedSku = sku.trim().toUpperCase();
    const product = this.productsBySku.get(normalizedSku);
    return product ? cloneProduct(product) : null;
  }

  list(query?: ListProductsQuery): Product[] {
    if (query) {
      if (query.search !== undefined && typeof query.search !== "string") {
        throw new ProductError("VALIDATION", "El parámetro search debe ser una cadena");
      }
      if (query.category !== undefined && typeof query.category !== "string") {
        throw new ProductError("VALIDATION", "El parámetro category debe ser una cadena");
      }
      if (query.active !== undefined && typeof query.active !== "boolean") {
        throw new ProductError("VALIDATION", "El parámetro active debe ser un booleano");
      }
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
      if (
        query.minPrice !== undefined &&
        query.maxPrice !== undefined &&
        query.minPrice > query.maxPrice
      ) {
        throw new ProductError("VALIDATION", "minPrice no puede ser mayor que maxPrice");
      }
    }

    let items = Array.from(this.productsById.values());

    if (query) {
      if (query.search !== undefined) {
        const search = query.search.trim().toLowerCase();
        if (search !== "") {
          items = items.filter((p) => p.name.toLowerCase().includes(search));
        }
      }

      if (query.category !== undefined) {
        const cat = query.category.trim().toLowerCase();
        if (cat !== "") {
          items = items.filter((p) => p.category !== null && p.category.toLowerCase() === cat);
        }
      }

      if (query.active !== undefined) {
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
      const nameDiff = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      if (nameDiff !== 0) {
        return nameDiff;
      }
      return a.sku.localeCompare(b.sku);
    });

    return items.map(cloneProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const product = this.productsById.get(id);
    if (!product) {
      throw new ProductError("NOT_FOUND", "Producto no encontrado");
    }

    if (!patch || typeof patch !== "object") {
      throw new ProductError("VALIDATION", "El parche de actualización debe ser un objeto");
    }

    const hasUpdates =
      patch.name !== undefined ||
      patch.sku !== undefined ||
      patch.price !== undefined ||
      patch.stock !== undefined ||
      patch.category !== undefined ||
      patch.active !== undefined;

    if (!hasUpdates) {
      return cloneProduct(product);
    }

    let newName: string | undefined;
    if (patch.name !== undefined) {
      newName = validateName(patch.name);
    }

    let newSku: string | undefined;
    if (patch.sku !== undefined) {
      newSku = validateSku(patch.sku);
      const existingProduct = this.productsBySku.get(newSku);
      if (existingProduct && existingProduct.id !== id) {
        throw new ProductError("DUPLICATE_SKU", `Ya existe otro producto con el SKU: ${newSku}`);
      }
    }

    let newPrice: number | undefined;
    if (patch.price !== undefined) {
      newPrice = validatePrice(patch.price);
    }

    let newStock: number | undefined;
    if (patch.stock !== undefined) {
      newStock = validateStock(patch.stock);
    }

    let newCategory: string | null | undefined;
    if (patch.category !== undefined) {
      newCategory = validateCategory(patch.category);
    }

    let newActive: boolean | undefined;
    if (patch.active !== undefined) {
      newActive = validateActive(patch.active);
    }

    // Apply updates
    if (newName !== undefined) {
      product.name = newName;
    }
    if (newSku !== undefined) {
      if (product.sku !== newSku) {
        this.productsBySku.delete(product.sku);
        product.sku = newSku;
        this.productsBySku.set(newSku, product);
      }
    }
    if (newPrice !== undefined) {
      product.price = newPrice;
    }
    if (newStock !== undefined) {
      product.stock = newStock;
    }
    if (newCategory !== undefined) {
      product.category = newCategory;
    }
    if (newActive !== undefined) {
      product.active = newActive;
    }

    product.updatedAt = new Date();
    return cloneProduct(product);
  }

  remove(id: string): boolean {
    if (!id || typeof id !== "string") {
      return false;
    }
    const product = this.productsById.get(id);
    if (!product) {
      return false;
    }
    this.productsById.delete(id);
    this.productsBySku.delete(product.sku);
    return true;
  }

  adjustStock(id: string, delta: number): Product {
    const product = this.productsById.get(id);
    if (!product) {
      throw new ProductError("NOT_FOUND", "Producto no encontrado");
    }

    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      throw new ProductError("VALIDATION", "El ajuste de stock debe ser un número entero distinto de cero");
    }

    const newStock = product.stock + delta;
    if (newStock < 0) {
      throw new ProductError("INSUFFICIENT_STOCK", "El stock resultante no puede ser menor a 0");
    }

    product.stock = newStock;
    product.updatedAt = new Date();
    return cloneProduct(product);
  }
}
