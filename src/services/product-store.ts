
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

export type ProductErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "DUPLICATE_SKU"
  | "INSUFFICIENT_STOCK";

export class ProductError extends Error {
  readonly code: ProductErrorCode;

  constructor(code: ProductErrorCode, message: string) {
    super(message);
    this.name = "ProductError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function validation(message: string): never {
  throw new ProductError("VALIDATION", message);
}

function copyProduct(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") {
    return validation("El nombre debe ser texto.");
  }

  const name = value.trim();

  if (name.length < 1 || name.length > 80) {
    return validation("El nombre debe tener entre 1 y 80 caracteres.");
  }

  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") {
    return validation("El SKU debe ser texto.");
  }

  const sku = value.trim().toUpperCase();

  if (
    sku.length < 2 ||
    sku.length > 32 ||
    !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(sku)
  ) {
    return validation("El SKU tiene un formato inválido.");
  }

  return sku;
}

function normalizePrice(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return validation("El precio debe ser un número finito mayor o igual a cero.");
  }

  return value;
}

function normalizeStock(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    return validation("El stock debe ser un entero mayor o igual a cero.");
  }

  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return validation("La categoría debe ser texto o null.");
  }

  const category = value.trim();
  return category.length > 0 ? category : null;
}

function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sameText(a: string, b: string): boolean {
  return normalizeSearch(a) === normalizeSearch(b);
}

export class ProductStore {
  private readonly products = new Map<string, Product>();

  create(input: CreateProductInput): Product {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return validation("Los datos del producto son inválidos.");
    }

    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = normalizePrice(input.price);
    const stock =
      input.stock === undefined ? 0 : normalizeStock(input.stock);
    const category = normalizeCategory(input.category);

    if (this.getBySku(sku) !== null) {
      throw new ProductError(
        "DUPLICATE_SKU",
        "Ya existe un producto con ese SKU.",
      );
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

    for (const product of this.products.values()) {
      if (product.sku === normalizedSku) {
        return copyProduct(product);
      }
    }

    return null;
  }

  list(query?: ListProductsQuery): Product[] {
    const filters = query ?? {};

    if (
      typeof filters !== "object" ||
      filters === null ||
      Array.isArray(filters)
    ) {
      return validation("Los filtros son inválidos.");
    }

    let search = "";
    let category = "";

    if (filters.search !== undefined) {
      if (typeof filters.search !== "string") {
        return validation("La búsqueda debe ser texto.");
      }
      search = normalizeSearch(filters.search);
    }

    if (filters.category !== undefined) {
      if (typeof filters.category !== "string") {
        return validation("La categoría debe ser texto.");
      }
      category = normalizeSearch(filters.category);
    }

    if (
      filters.active !== undefined &&
      typeof filters.active !== "boolean"
    ) {
      return validation("El filtro active debe ser booleano.");
    }

    let minPrice: number | undefined;
    let maxPrice: number | undefined;

    if (filters.minPrice !== undefined) {
      minPrice = normalizePrice(filters.minPrice);
    }

    if (filters.maxPrice !== undefined) {
      maxPrice = normalizePrice(filters.maxPrice);
    }

    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice > maxPrice
    ) {
      return validation("El precio mínimo no puede superar al máximo.");
    }

    const result = [...this.products.values()].filter((product) => {
      if (search !== "") {
        const matchesName = normalizeSearch(product.name).includes(search);
        const matchesSku = normalizeSearch(product.sku).includes(search);

        if (!matchesName && !matchesSku) {
          return false;
        }
      }

      if (category !== "") {
        if (
          product.category === null ||
          normalizeSearch(product.category) !== category
        ) {
          return false;
        }
      }

      if (
        filters.active !== undefined &&
        product.active !== filters.active
      ) {
        return false;
      }

      if (minPrice !== undefined && product.price < minPrice) {
        return false;
      }

      if (maxPrice !== undefined && product.price > maxPrice) {
        return false;
      }

      return true;
    });

    result.sort((a, b) => {
      const byName = a.name.localeCompare(b.name, "es", {
        sensitivity: "base",
      });

      if (byName !== 0) {
        return byName;
      }

      return a.sku.localeCompare(b.sku, "es", {
        sensitivity: "base",
      });
    });

    return result.map(copyProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.products.get(id);

    if (!current) {
      throw new ProductError(
        "NOT_FOUND",
        "No existe un producto con ese identificador.",
      );
    }

    if (
      patch === null ||
      typeof patch !== "object" ||
      Array.isArray(patch)
    ) {
      return validation("Los datos de actualización son inválidos.");
    }

    const keys = Object.keys(patch);

    if (keys.length === 0) {
      return copyProduct(current);
    }

    const allowedKeys = new Set([
      "name",
      "sku",
      "price",
      "stock",
      "category",
      "active",
    ]);

    for (const key of keys) {
      if (!allowedKeys.has(key)) {
        return validation("El parche contiene campos no permitidos.");
      }
    }

    const name =
      patch.name === undefined
        ? current.name
        : normalizeName(patch.name);

    const sku =
      patch.sku === undefined
        ? current.sku
        : normalizeSku(patch.sku);

    const price =
      patch.price === undefined
        ? current.price
        : normalizePrice(patch.price);

    const stock =
      patch.stock === undefined
        ? current.stock
        : normalizeStock(patch.stock);

    const category =
      patch.category === undefined
        ? current.category
        : normalizeCategory(patch.category);

    if (
      patch.active !== undefined &&
      typeof patch.active !== "boolean"
    ) {
      return validation("El campo active debe ser booleano.");
    }

    const active =
      patch.active === undefined ? current.active : patch.active;

    const duplicate = this.getBySku(sku);

    if (duplicate !== null && duplicate.id !== id) {
      throw new ProductError(
        "DUPLICATE_SKU",
        "Ya existe un producto con ese SKU.",
      );
    }

    const updated: Product = {
      id: current.id,
      name,
      sku,
      price,
      stock,
      category,
      active,
      createdAt: new Date(current.createdAt.getTime()),
      updatedAt: new Date(),
    };

    this.products.set(id, updated);

    return copyProduct(updated);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    if (
      typeof delta !== "number" ||
      !Number.isInteger(delta) ||
      delta === 0
    ) {
      return validation("El ajuste debe ser un entero distinto de cero.");
    }

    const current = this.products.get(id);

    if (!current) {
      throw new ProductError(
        "NOT_FOUND",
        "No existe un producto con ese identificador.",
      );
    }

    const newStock = current.stock + delta;

    if (newStock < 0) {
      throw new ProductError(
        "INSUFFICIENT_STOCK",
        "El ajuste no puede dejar el stock por debajo de cero.",
      );
    }

    const updated: Product = {
      ...current,
      stock: newStock,
      createdAt: new Date(current.createdAt.getTime()),
      updatedAt: new Date(),
    };

    this.products.set(id, updated);

    return copyProduct(updated);
  }
}
