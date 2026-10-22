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

function validation(message: string): ProductError {
  return new ProductError("VALIDATION", message);
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") {
    throw validation("El nombre debe ser texto");
  }
  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    throw validation("El nombre debe tener entre 1 y 80 caracteres");
  }
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") {
    throw validation("El sku debe ser texto");
  }
  const sku = value.trim().toUpperCase();
  if (sku.length < 2 || sku.length > 32 || !SKU_PATTERN.test(sku)) {
    throw validation("El sku no tiene un formato valido");
  }
  return sku;
}

function validatePrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw validation("El precio debe ser un numero finito mayor o igual a 0");
  }
  return value;
}

function validateStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw validation("El stock debe ser un entero mayor o igual a 0");
  }
  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw validation("La categoria debe ser texto");
  }
  const category = value.trim();
  return category === "" ? null : category;
}

function validateActive(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw validation("El campo active debe ser booleano");
  }
  return value;
}

function validatePriceBound(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw validation(`${label} debe ser un numero finito mayor o igual a 0`);
  }
  return value;
}

function copyProduct(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

export class ProductStore {
  private readonly products = new Map<string, Product>();

  private findBySku(sku: string): Product | undefined {
    for (const product of this.products.values()) {
      if (product.sku === sku) {
        return product;
      }
    }
    return undefined;
  }

  create(input: CreateProductInput): Product {
    const data = (input ?? {}) as Partial<CreateProductInput>;

    const name = normalizeName(data.name);
    const sku = normalizeSku(data.sku);
    const price = validatePrice(data.price);
    const stock = data.stock === undefined ? 0 : validateStock(data.stock);
    const category = normalizeCategory(data.category);

    if (this.findBySku(sku)) {
      throw new ProductError("DUPLICATE_SKU", "Ya existe un producto con ese sku");
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
      createdAt: new Date(now.getTime()),
      updatedAt: new Date(now.getTime()),
    };

    this.products.set(product.id, product);
    return copyProduct(product);
  }

  getById(id: string): Product | null {
    if (typeof id !== "string") {
      return null;
    }
    const product = this.products.get(id);
    return product ? copyProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") {
      return null;
    }
    const product = this.findBySku(sku.trim().toUpperCase());
    return product ? copyProduct(product) : null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    const q = query ?? {};

    let minPrice: number | undefined;
    let maxPrice: number | undefined;
    if (q.minPrice !== undefined) {
      minPrice = validatePriceBound(q.minPrice, "minPrice");
    }
    if (q.maxPrice !== undefined) {
      maxPrice = validatePriceBound(q.maxPrice, "maxPrice");
    }
    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      throw validation("minPrice no puede ser mayor que maxPrice");
    }

    const search = typeof q.search === "string" ? q.search.trim().toLowerCase() : "";
    const category = typeof q.category === "string" ? q.category.trim().toLowerCase() : "";

    const result: Product[] = [];
    for (const product of this.products.values()) {
      if (search !== "" && !product.name.toLowerCase().includes(search)) {
        continue;
      }
      if (category !== "" && (product.category ?? "").toLowerCase() !== category) {
        continue;
      }
      if (q.active !== undefined && product.active !== q.active) {
        continue;
      }
      if (minPrice !== undefined && product.price < minPrice) {
        continue;
      }
      if (maxPrice !== undefined && product.price > maxPrice) {
        continue;
      }
      result.push(product);
    }

    result.sort((a, b) => {
      const byName = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      if (byName !== 0) {
        return byName;
      }
      if (a.sku < b.sku) {
        return -1;
      }
      return a.sku > b.sku ? 1 : 0;
    });

    return result.map(copyProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) {
      throw new ProductError("NOT_FOUND", "No existe un producto con ese id");
    }

    const data = (patch ?? {}) as UpdateProductInput;
    const hasChanges =
      data.name !== undefined ||
      data.sku !== undefined ||
      data.price !== undefined ||
      data.stock !== undefined ||
      data.category !== undefined ||
      data.active !== undefined;

    if (!hasChanges) {
      return copyProduct(current);
    }

    const next = {
      name: data.name !== undefined ? normalizeName(data.name) : current.name,
      sku: data.sku !== undefined ? normalizeSku(data.sku) : current.sku,
      price: data.price !== undefined ? validatePrice(data.price) : current.price,
      stock: data.stock !== undefined ? validateStock(data.stock) : current.stock,
      category: data.category !== undefined ? normalizeCategory(data.category) : current.category,
      active: data.active !== undefined ? validateActive(data.active) : current.active,
    };

    const owner = this.findBySku(next.sku);
    if (owner && owner.id !== current.id) {
      throw new ProductError("DUPLICATE_SKU", "Ya existe un producto con ese sku");
    }

    current.name = next.name;
    current.sku = next.sku;
    current.price = next.price;
    current.stock = next.stock;
    current.category = next.category;
    current.active = next.active;
    current.updatedAt = new Date();

    return copyProduct(current);
  }

  remove(id: string): boolean {
    if (typeof id !== "string") {
      return false;
    }
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      throw validation("El delta debe ser un entero distinto de cero");
    }

    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) {
      throw new ProductError("NOT_FOUND", "No existe un producto con ese id");
    }

    const nextStock = current.stock + delta;
    if (nextStock < 0) {
      throw new ProductError("INSUFFICIENT_STOCK", "El stock no alcanza para este ajuste");
    }

    current.stock = nextStock;
    current.updatedAt = new Date();
    return copyProduct(current);
  }
}