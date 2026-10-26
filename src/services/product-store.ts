import { randomUUID } from "crypto";

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

export class ProductStore {
  private products = new Map<string, Product>();

  private clone(product: Product): Product {
    return {
      ...product,
      createdAt: new Date(product.createdAt),
      updatedAt: new Date(product.updatedAt),
    };
  }

  private validation(message: string): never {
    throw new ProductError("VALIDATION", message);
  }

  private normalizeName(name: string): string {
    if (typeof name !== "string") {
      this.validation("invalid name");
    }

    const value = name.trim();

    if (value.length < 1 || value.length > 80) {
      this.validation("invalid name");
    }

    return value;
  }

  private normalizeSku(sku: string): string {
    if (typeof sku !== "string") {
      this.validation("invalid sku");
    }

    const value = sku.trim().toUpperCase();
    const pattern = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

    if (value.length < 2 || value.length > 32 || !pattern.test(value)) {
      this.validation("invalid sku");
    }

    return value;
  }

  private normalizeCategory(category?: string | null): string | null {
    if (category === undefined || category === null) {
      return null;
    }

    const value = category.trim();

    return value === "" ? null : value;
  }

  private validatePrice(price: number): void {
    if (
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      this.validation("invalid price");
    }
  }

  private validateStock(stock: number): void {
    if (
      typeof stock !== "number" ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      this.validation("invalid stock");
    }
  }

  create(input: CreateProductInput): Product {
    const name = this.normalizeName(input.name);
    const sku = this.normalizeSku(input.sku);

    this.validatePrice(input.price);

    const stock = input.stock ?? 0;
    this.validateStock(stock);

    if (this.getBySku(sku)) {
      throw new ProductError(
        "DUPLICATE_SKU",
        "duplicate sku",
      );
    }

    const now = new Date();

    const product: Product = {
      id: randomUUID(),
      name,
      sku,
      price: input.price,
      stock,
      category: this.normalizeCategory(input.category),
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    this.products.set(product.id, product);

    return this.clone(product);
  }

  getById(id: string): Product | null {
    const product = this.products.get(id);

    return product ? this.clone(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") {
      return null;
    }

    const normalized = sku.trim().toUpperCase();

    if (!normalized) {
      return null;
    }

    for (const product of this.products.values()) {
      if (product.sku === normalized) {
        return this.clone(product);
      }
    }

    return null;
  }

  list(query?: ListProductsQuery): Product[] {
    let products = [...this.products.values()];

    if (query) {
      const { search, category, active, minPrice, maxPrice } = query;

      if (
        minPrice !== undefined &&
        (!Number.isFinite(minPrice) || minPrice < 0)
      ) {
        this.validation("invalid minPrice");
      }

      if (
        maxPrice !== undefined &&
        (!Number.isFinite(maxPrice) || maxPrice < 0)
      ) {
        this.validation("invalid maxPrice");
      }

      if (
        minPrice !== undefined &&
        maxPrice !== undefined &&
        minPrice > maxPrice
      ) {
        this.validation("invalid range");
      }

      if (search && search.trim()) {
        const term = search.trim().toLowerCase();

        products = products.filter((product) =>
          product.name.toLowerCase().includes(term),
        );
      }

      if (category && category.trim()) {
        const cat = category.trim().toLowerCase();

        products = products.filter(
          (product) =>
            product.category?.toLowerCase() === cat,
        );
      }

      if (active !== undefined) {
        products = products.filter(
          (product) => product.active === active,
        );
      }

      if (minPrice !== undefined) {
        products = products.filter(
          (product) => product.price >= minPrice,
        );
      }

      if (maxPrice !== undefined) {
        products = products.filter(
          (product) => product.price <= maxPrice,
        );
      }
    }

    return products
      .sort((a, b) => {
        const byName = a.name.localeCompare(
          b.name,
          "es",
          { sensitivity: "base" },
        );

        if (byName !== 0) {
          return byName;
        }

        return a.sku.localeCompare(b.sku);
      })
      .map((product) => this.clone(product));
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.products.get(id);

    if (!current) {
      throw new ProductError("NOT_FOUND", "not found");
    }

    if (Object.keys(patch).length === 0) {
      return this.clone(current);
    }

    const candidate: Product = {
      ...current,
    };

    if (patch.name !== undefined) {
      candidate.name = this.normalizeName(patch.name);
    }

    if (patch.sku !== undefined) {
      const sku = this.normalizeSku(patch.sku);

      for (const product of this.products.values()) {
        if (product.id !== id && product.sku === sku) {
          throw new ProductError(
            "DUPLICATE_SKU",
            "duplicate sku",
          );
        }
      }

      candidate.sku = sku;
    }

    if (patch.price !== undefined) {
      this.validatePrice(patch.price);
      candidate.price = patch.price;
    }

    if (patch.stock !== undefined) {
      this.validateStock(patch.stock);
      candidate.stock = patch.stock;
    }

    if (patch.category !== undefined) {
      candidate.category = this.normalizeCategory(
        patch.category,
      );
    }

    if (patch.active !== undefined) {
      candidate.active = patch.active;
    }

    candidate.updatedAt = new Date();

    this.products.set(id, candidate);

    return this.clone(candidate);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.products.get(id);

    if (!current) {
      throw new ProductError("NOT_FOUND", "not found");
    }

    if (!Number.isInteger(delta) || delta === 0) {
      this.validation("invalid delta");
    }

    const newStock = current.stock + delta;

    if (newStock < 0) {
      throw new ProductError(
        "INSUFFICIENT_STOCK",
        "insufficient stock",
      );
    }

    const updated: Product = {
      ...current,
      stock: newStock,
      updatedAt: new Date(),
    };

    this.products.set(id, updated);

    return this.clone(updated);
  }
}