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

function validationError(message: string): ProductError {
  return new ProductError("VALIDATION", message);
}

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw validationError(message);
  }
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") {
    throw validationError("El nombre debe ser texto.");
  }

  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    throw validationError("El nombre debe tener entre 1 y 80 caracteres.");
  }

  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") {
    throw validationError("El SKU debe ser texto.");
  }

  const sku = value.trim().toUpperCase();
  if (sku.length < 2 || sku.length > 32 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(sku)) {
    throw validationError("El SKU tiene un formato inválido.");
  }

  return sku;
}

function validatePrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw validationError("El precio debe ser un número finito mayor o igual a cero.");
  }

  return value;
}

function validateStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw validationError("El stock debe ser un entero mayor o igual a cero.");
  }

  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw validationError("La categoría debe ser texto o null.");
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
    assertRecord(input, "Los datos del producto deben ser un objeto.");

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
    if (typeof sku !== "string" || !sku.trim()) {
      return null;
    }

    const normalizedSku = sku.trim().toUpperCase();
    for (const product of this.products.values()) {
      if (product.sku === normalizedSku) {
        return copyProduct(product);
      }
    }

    return null;
  }

  list(query?: ListProductsQuery): Product[] {
    let search: string | undefined;
    let category: string | undefined;
    let active: boolean | undefined;
    let minPrice: number | undefined;
    let maxPrice: number | undefined;

    if (query !== undefined) {
      assertRecord(query, "Los filtros deben ser un objeto.");

      if (query.search !== undefined) {
        if (typeof query.search !== "string") {
          throw validationError("La búsqueda debe ser texto.");
        }
        search = query.search.trim().toLocaleLowerCase("es");
      }

      if (query.category !== undefined) {
        if (typeof query.category !== "string") {
          throw validationError("La categoría debe ser texto.");
        }
        category = query.category.trim().toLocaleLowerCase("es");
      }

      if (query.active !== undefined) {
        if (typeof query.active !== "boolean") {
          throw validationError("El filtro active debe ser booleano.");
        }
        active = query.active;
      }

      if (query.minPrice !== undefined) {
        minPrice = validatePrice(query.minPrice);
      }
      if (query.maxPrice !== undefined) {
        maxPrice = validatePrice(query.maxPrice);
      }
      if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
        throw validationError("El precio mínimo no puede superar al máximo.");
      }
    }

    const collator = new Intl.Collator("es", { sensitivity: "base" });
    return [...this.products.values()]
      .filter((product) => {
        if (search && !product.name.toLocaleLowerCase("es").includes(search)) {
          return false;
        }
        if (
          category &&
          product.category?.toLocaleLowerCase("es") !== category
        ) {
          return false;
        }
        if (active !== undefined && product.active !== active) {
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
      .sort(
        (left, right) =>
          collator.compare(left.name, right.name) || collator.compare(left.sku, right.sku),
      )
      .map(copyProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.products.get(id);
    if (!current) {
      throw new ProductError("NOT_FOUND", "No existe un producto con ese id.");
    }
    assertRecord(patch, "Los cambios deben ser un objeto.");

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
        throw validationError("El estado active debe ser booleano.");
      }
      updated.active = patch.active;
    }

    if (
      [...this.products.values()].some(
        (product) => product.id !== id && product.sku === updated.sku,
      )
    ) {
      throw new ProductError("DUPLICATE_SKU", "Ya existe un producto con ese SKU.");
    }

    const changed =
      patch.name !== undefined ||
      patch.sku !== undefined ||
      patch.price !== undefined ||
      patch.stock !== undefined ||
      patch.category !== undefined ||
      patch.active !== undefined;

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
      throw new ProductError("NOT_FOUND", "No existe un producto con ese id.");
    }
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      throw validationError("El ajuste de stock debe ser un entero distinto de cero.");
    }

    const stock = current.stock + delta;
    if (stock < 0) {
      throw new ProductError("INSUFFICIENT_STOCK", "El ajuste supera el stock disponible.");
    }
    if (!Number.isFinite(stock) || !Number.isInteger(stock)) {
      throw validationError("El stock resultante debe ser un entero finito.");
    }

    const updated: Product = {
      ...current,
      stock,
      updatedAt: new Date(),
    };
    this.products.set(id, updated);
    return copyProduct(updated);
  }
}
