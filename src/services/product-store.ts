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

const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function invalid(message: string): never {
  throw new ProductError("VALIDATION", message);
}

function normalizeName(value: unknown): string {
  if (typeof value !== "string") invalid("name must be a string");
  const name = value.trim();
  if (name.length < 1 || name.length > 80) invalid("name must have between 1 and 80 characters");
  return name;
}

function normalizeSku(value: unknown): string {
  if (typeof value !== "string") invalid("sku must be a string");
  const sku = value.trim().toUpperCase();
  if (sku.length < 2 || sku.length > 32) invalid("sku must have between 2 and 32 characters");
  if (!SKU_PATTERN.test(sku)) invalid("sku has an invalid format");
  return sku;
}

function validatePrice(value: unknown, field = "price"): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid(`${field} must be a finite number >= 0`);
  }
  return value;
}

function validateStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    invalid("stock must be an integer >= 0");
  }
  return value;
}

function normalizeCategory(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") invalid("category must be a string or null");
  const category = value.trim();
  return category.length > 0 ? category : null;
}

function validateActive(value: unknown): boolean {
  if (typeof value !== "boolean") invalid("active must be a boolean");
  return value;
}

function copy(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

const nameCollator = new Intl.Collator("es", { sensitivity: "base" });

export class ProductStore {
  private readonly products = new Map<string, Product>();

  create(input: CreateProductInput): Product {
    if (typeof input !== "object" || input === null) invalid("input must be an object");

    const name = normalizeName(input.name);
    const sku = normalizeSku(input.sku);
    const price = validatePrice(input.price);
    const stock = input.stock === undefined ? 0 : validateStock(input.stock);
    const category = normalizeCategory(input.category);

    if (this.findBySku(sku)) {
      throw new ProductError("DUPLICATE_SKU", `sku ${sku} already exists`);
    }

    const now = new Date();
    const product: Product = {
      id: crypto.randomUUID(),
      name,
      sku,
      price,
      stock,
      category,
      active: true,
      createdAt: now,
      updatedAt: new Date(now.getTime()),
    };
    this.products.set(product.id, product);
    return copy(product);
  }

  getById(id: string): Product | null {
    const product = this.products.get(id);
    return product ? copy(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const product = this.findBySku(sku.trim().toUpperCase());
    return product ? copy(product) : null;
  }

  list(query: ListProductsQuery = {}): Product[] {
    const search =
      typeof query.search === "string" ? query.search.trim().toLowerCase() : "";
    const category =
      typeof query.category === "string" ? query.category.trim().toLowerCase() : "";
    const active = query.active === undefined ? undefined : validateActive(query.active);
    const minPrice =
      query.minPrice === undefined ? undefined : validatePrice(query.minPrice, "minPrice");
    const maxPrice =
      query.maxPrice === undefined ? undefined : validatePrice(query.maxPrice, "maxPrice");

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
      invalid("minPrice cannot be greater than maxPrice");
    }

    return [...this.products.values()]
      .filter((product) => {
        if (search && !product.name.toLowerCase().includes(search)) return false;
        if (category && product.category?.toLowerCase() !== category) return false;
        if (active !== undefined && product.active !== active) return false;
        if (minPrice !== undefined && product.price < minPrice) return false;
        if (maxPrice !== undefined && product.price > maxPrice) return false;
        return true;
      })
      .sort((a, b) => {
        const byName = nameCollator.compare(a.name, b.name);
        if (byName !== 0) return byName;
        return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
      })
      .map(copy);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const current = this.products.get(id);
    if (!current) throw new ProductError("NOT_FOUND", `product ${id} not found`);
    if (typeof patch !== "object" || patch === null) invalid("patch must be an object");

    const changes: Partial<Product> = {};
    if (patch.name !== undefined) changes.name = normalizeName(patch.name);
    if (patch.sku !== undefined) changes.sku = normalizeSku(patch.sku);
    if (patch.price !== undefined) changes.price = validatePrice(patch.price);
    if (patch.stock !== undefined) changes.stock = validateStock(patch.stock);
    if (patch.category !== undefined) changes.category = normalizeCategory(patch.category);
    if (patch.active !== undefined) changes.active = validateActive(patch.active);

    if (Object.keys(changes).length === 0) return copy(current);

    if (changes.sku !== undefined) {
      const owner = this.findBySku(changes.sku);
      if (owner && owner.id !== id) {
        throw new ProductError("DUPLICATE_SKU", `sku ${changes.sku} already exists`);
      }
    }

    const updated: Product = { ...current, ...changes, updatedAt: new Date() };
    this.products.set(id, updated);
    return copy(updated);
  }

  remove(id: string): boolean {
    return this.products.delete(id);
  }

  adjustStock(id: string, delta: number): Product {
    const current = this.products.get(id);
    if (!current) throw new ProductError("NOT_FOUND", `product ${id} not found`);
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      invalid("delta must be a non-zero integer");
    }

    const stock = current.stock + delta;
    if (stock < 0) {
      throw new ProductError("INSUFFICIENT_STOCK", `insufficient stock for product ${id}`);
    }

    const updated: Product = { ...current, stock, updatedAt: new Date() };
    this.products.set(id, updated);
    return copy(updated);
  }

  private findBySku(sku: string): Product | undefined {
    for (const product of this.products.values()) {
      if (product.sku === sku) return product;
    }
    return undefined;
  }
}
