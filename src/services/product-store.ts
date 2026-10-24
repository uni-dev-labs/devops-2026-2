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

const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function fail(code: ProductErrorCode, message: string): never {
  throw new ProductError(code, message);
}

function copy(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

function parseName(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "El nombre debe ser texto");
  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    fail("VALIDATION", "El nombre debe tener entre 1 y 80 caracteres");
  }
  return name;
}

function parseSKU(value: unknown): string {
  if (typeof value !== "string") fail("VALIDATION", "El sku debe ser texto");
  const sku = value.trim().toUpperCase();
  if (sku.length < 2 || sku.length > 32 || !SKU_PATTERN.test(sku)) {
    fail("VALIDATION", "El sku es invalido");
  }
  return sku;
}

function parsePrice(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", "El precio debe ser un numero finito o igual o mayor a 0");
  }
  return value;
}
function parseStock(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail("VALIDATION", "El stock debe ser un entero mayor o igual a 0");
  }
  return value;
}

function parseCategory(value: unknown): string | null {
  if (value == undefined || value === null) return null;
  if (typeof value !== "string") fail("VALIDATION", "La categoria debe ser texto");
  const category = value.trim();
  return category === "" ? null : category;
}

function parsePriceBound(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("VALIDATION", `${label} debe ser un número finito mayor o igual a 0`);
  }
  return value;
}

export class ProductStore {
  private readonly products = new Map<string, Product>();

  private findBySku(sku: string, exceptId?: string): Product | undefined {
    for (const product of this.products.values()) {
      if (product.sku === sku && product.id !== exceptId) return product;
    }
    return undefined;
  }
  create(input: CreateProductInput): Product {
    if (typeof input !== "object" || input === null) {
      fail("VALIDATION", "Los datos del producto son inválidos");
    }
    const name = parseName(input.name);
    const sku = parseSKU(input.sku);
    const price = parsePrice(input.price);
    const stock = input.stock === undefined ? 0 : parseStock(input.stock);
    const category = parseCategory(input.category);

    if (this.findBySku(sku)) {
      fail("DUPLICATE_SKU", `Ya existe un producto con el sku ${sku}`);
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
      updatedAt: new Date(now.getTime()),
    };
    this.products.set(product.id, product);
    return copy(product);
  }
  getById(id: string): Product | null {
    if (typeof id !== "string") return null;
    const product = this.products.get(id);
    return product ? copy(product) : null;
  }
  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const product = this.findBySku(sku.trim().toUpperCase());
    return product ? copy(product) : null;
  }
  list(query: ListProductsQuery = {}): Product[] {
    const minPrice = parsePriceBound(query.minPrice, "minprice");
    const maxprice = parsePriceBound(query.maxPrice, "maxPrice");
    if (minPrice !== undefined && maxprice !== undefined && minPrice > maxprice) {
      fail("VALIDATION", "minPrice no puede ser mayor que maxPrice");
    }
    const search =
      typeof query.search === "string" ? query.search.trim().toLocaleLowerCase() : "";
    const category =
      typeof query.category === "string" ? query.category.trim().toLowerCase() : "";

    return [...this.products.values()]
      .filter((p) => search === "" || p.name.toLocaleLowerCase().includes(search))
      .filter((p) => category === "" || (p.category?.toLocaleLowerCase() ?? null) === category)
      .filter((p) => query.active === undefined || p.active === query.active)
      .filter((p) => minPrice === undefined || p.price >= minPrice)
      .filter((p) => maxprice === undefined || p.price <= maxprice)
      .sort((a, b) => {
        const byName = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
        if (byName !== 0) return byName;
        return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
      })
      .map(copy);
  }
  update(id: string, patch: UpdateProductInput): Product {
    const current = typeof id == "string" ? this.products.get(id) : undefined;
    if (!current) fail("NOT_FOUND", "El producto no existe");
    if (typeof patch !== "object" || patch == null) {
      fail("VALIDATION", "El parche es invalido");
    }

    const next: Product = { ...current };
    let changed = false;

    if (patch.name !== undefined) {
      next.name = parseName(patch.name);
      changed = true;
    }
    if (patch.sku !== undefined) {
      const sku = parseSKU(patch.sku);
      if (this.findBySku(sku, current.id)) {
        fail("DUPLICATE_SKU", `Ya existe un producto con el sku ${sku}`);
      }
      next.sku = sku;
      changed = true;
    }
    if (patch.price !== undefined) {
      next.price = parsePrice(patch.price);
      changed = true;
    }
    if (patch.stock !== undefined) {
      next.stock = parseStock(patch.stock);
      changed = true;
    }
    if (patch.category !== undefined) {
      next.category = parseCategory(patch.category);
      changed = true;
    }
    if (patch.active !== undefined) {
      if (typeof patch.active !== "boolean") {
        fail("VALIDATION", "active debe ser booleano");
      }
      next.active = patch.active;
      changed = true;
    }

    if (!changed) return copy(current);

    next.updatedAt = new Date();
    this.products.set(next.id, next);
    return copy(next);
  }

  remove(id: string): boolean {
    if (typeof id !== "string") return false;
    return this.products.delete(id);
  }
  adjustStock(id: string, delta: number): Product {
    const current = typeof id === "string" ? this.products.get(id) : undefined;
    if (!current) fail("NOT_FOUND", "El producto no existe");

    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      fail("VALIDATION", "El delta debe ser un entero distinto de cero");
    }

    const stock = current.stock + delta;
    if (stock < 0) {
      fail("INSUFFICIENT_STOCK", "El stock no puede quedar por debajo de 0");
    }

    const next: Product = { ...current, stock, updatedAt: new Date() };
    this.products.set(next.id, next);
    return copy(next);
  }
}



