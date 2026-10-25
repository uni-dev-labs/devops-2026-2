
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

function validateName(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProductError("VALIDATION", "El nombre debe ser texto.");
  }

  const name = value.trim();

  if (name.length < 1 || name.length > 80) {
    throw new ProductError(
      "VALIDATION",
      "El nombre debe contener entre 1 y 80 caracteres."
    );
  }

  return name;
}

function validateSku(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProductError("VALIDATION", "El SKU debe ser texto.");
  }

  const sku = value.trim().toUpperCase();
  const pattern = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

  if (sku.length < 2 || sku.length > 32 || !pattern.test(sku)) {
    throw new ProductError("VALIDATION", "El formato del SKU es inválido.");
  }

  return sku;
}

function validatePrice(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new ProductError(
      "VALIDATION",
      "El precio debe ser un número finito mayor o igual a cero."
    );
  }

  return value;
}

function validateStock(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new ProductError(
      "VALIDATION",
      "El stock debe ser un entero mayor o igual a cero."
    );
  }

  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ProductError(
      "VALIDATION",
      "La categoría debe ser texto o null."
    );
  }

  const category = value.trim();
  return category === "" ? null : category;
}

function cloneProduct(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

function normalizeSearch(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function validateFilterPrice(value: unknown): number {
  return validatePrice(value);
}

export class ProductStore {
  private readonly products = new Map<string, Product>();

  create(input: CreateProductInput): Product {
    if (!input || typeof input !== "object") {
      throw new ProductError(
        "VALIDATION",
        "Los datos del producto son inválidos."
      );
    }

    const name = validateName(input.name);
    const sku = validateSku(input.sku);
    const price = validatePrice(input.price);
    const stock = validateStock(
      input.stock === undefined ? 0 : input.stock
    );
    const category = normalizeCategory(input.category);

    for (const product of this.products.values()) {
      if (product.sku === sku) {
        throw new ProductError(
          "DUPLICATE_SKU",
          "Ya existe un producto con ese SKU."
        );
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
      createdAt: new Date(now.getTime()),
      updatedAt: new Date(now.getTime()),
    };

    this.products.set(product.id, product);

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

    const normalizedSku = sku.trim().toUpperCase();

    for (const product of this.products.values()) {
      if (product.sku === normalizedSku) {
        return cloneProduct(product);
      }
    }

    return null;
  }

  list(query?: ListProductsQuery): Product[] {
    const filters = query ?? {};

    const minPrice =
      filters.minPrice === undefined
        ? undefined
        : validateFilterPrice(filters.minPrice);

    const maxPrice =
      filters.maxPrice === undefined
        ? undefined
        : validateFilterPrice(filters.maxPrice);

    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice > maxPrice
    ) {
      throw new ProductError(
        "VALIDATION",
        "El precio mínimo no puede superar el máximo."
      );
    }

    let products = Array.from(this.products.values());

    if (filters.search !== undefined) {
      if (typeof filters.search !== "string") {
        throw new ProductError(
          "VALIDATION",
          "La búsqueda debe ser texto."
        );
      }

      const search = normalizeSearch(filters.search);

      if (search !== "") {
        products = products.filter(
          (product) =>
            normalizeSearch(product.name).includes(search) ||
            normalizeSearch(product.sku).includes(search)
        );
      }
    }

    if (filters.category !== undefined) {
      if (typeof filters.category !== "string") {
        throw new ProductError(
          "VALIDATION",
          "El filtro de categoría debe ser texto."
        );
      }

      const category = normalizeSearch(filters.category);

      if (category !== "") {
        products = products.filter(
          (product) =>
            product.category !== null &&
            normalizeSearch(product.category) === category
        );
      }
    }

    if (filters.active !== undefined) {
      if (typeof filters.active !== "boolean") {
        throw new ProductError(
          "VALIDATION",
          "El filtro active debe ser booleano."
        );
      }

      products = products.filter(
        (product) => product.active === filters.active
      );
    }

    if (minPrice !== undefined) {
      products = products.filter(
        (product) => product.price >= minPrice
      );
    }

    if (maxPrice !== undefined) {
      products = products.filter(
        (product) => product.price <= maxPrice
      );
    }

    products.sort((a, b) => {
      const byName = a.name.localeCompare(
        b.name,
        "es",
        { sensitivity: "base" }
      );

      if (byName !== 0) {
        return byName;
      }

      return a.sku.localeCompare(
        b.sku,
        "es",
        { sensitivity: "base" }
      );
    });

    return products.map(cloneProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const existing = this.products.get(id);

    if (!existing) {
      throw new ProductError(
        "NOT_FOUND",
        "El producto no existe."
      );
    }

    if (!patch || typeof patch !== "object") {
      throw new ProductError(
        "VALIDATION",
        "Los datos de actualización son inválidos."
      );
    }

    const updated = cloneProduct(existing);

    const hasField = (field: keyof UpdateProductInput): boolean =>
      Object.prototype.hasOwnProperty.call(patch, field);

    if (hasField("name")) {
      updated.name = validateName(patch.name);
    }

    if (hasField("sku")) {
      const sku = validateSku(patch.sku);

      for (const product of this.products.values()) {
        if (product.id !== id && product.sku === sku) {
          throw new ProductError(
            "DUPLICATE_SKU",
            "El SKU pertenece a otro producto."
          );
        }
      }

      updated.sku = sku;
    }

    if (hasField("price")) {
      updated.price = validatePrice(patch.price);
    }

    if (hasField("stock")) {
      updated.stock = validateStock(patch.stock);
    }

    if (hasField("category")) {
      updated.category = normalizeCategory(patch.category);
    }

    if (hasField("active")) {
      if (typeof patch.active !== "boolean") {
        throw new ProductError(
          "VALIDATION",
          "El campo active debe ser booleano."
        );
      }

      updated.active = patch.active;
    }

    const changedFields: (keyof UpdateProductInput)[] = [
      "name",
      "sku",
      "price",
      "stock",
      "category",
      "active",
    ];

    const hasChanges = changedFields.some((field) =>
      hasField(field)
    );

    if (!hasChanges) {
      return cloneProduct(existing);
    }

    updated.updatedAt = new Date();

    this.products.set(id, updated);

    return cloneProduct(updated);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const existing = this.products.get(id);

    if (!existing) {
      throw new ProductError(
        "NOT_FOUND",
        "El producto no existe."
      );
    }

    if (
      typeof delta !== "number" ||
      !Number.isInteger(delta) ||
      delta === 0
    ) {
      throw new ProductError(
        "VALIDATION",
        "El ajuste debe ser un entero distinto de cero."
      );
    }

    const newStock = existing.stock + delta;

    if (newStock < 0) {
      throw new ProductError(
        "INSUFFICIENT_STOCK",
        "El ajuste dejaría el stock por debajo de cero."
      );
    }

    if (!Number.isSafeInteger(newStock)) {
      throw new ProductError(
        "VALIDATION",
        "El stock resultante no es válido."
      );
    }

    const updated = cloneProduct(existing);

    updated.stock = newStock;
    updated.updatedAt = new Date();

    this.products.set(id, updated);

    return cloneProduct(updated);
  }
}
