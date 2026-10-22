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

function clone(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt),
    updatedAt: new Date(product.updatedAt),
  };
}

function fail(code: ProductErrorCode, message: string): never {
  throw new ProductError(code, message);
}

export class ProductStore {
  private products: Product[] = [];

  create(input: CreateProductInput): Product {
    const name = input.name?.trim();

    if (!name || name.length > 80) {
      fail("VALIDATION", "Nombre inválido");
    }

    const sku = input.sku?.trim().toUpperCase();
    const pattern = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

    if (!sku || sku.length < 2 || sku.length > 32 || !pattern.test(sku)) {
      fail("VALIDATION", "SKU inválido");
    }

    if (this.products.some((p) => p.sku === sku)) {
      fail("DUPLICATE_SKU", "SKU duplicado");
    }

    if (
      typeof input.price !== "number" ||
      !Number.isFinite(input.price) ||
      input.price < 0
    ) {
      fail("VALIDATION", "Precio inválido");
    }

    const stock = input.stock ?? 0;

    if (!Number.isInteger(stock) || stock < 0) {
      fail("VALIDATION", "Stock inválido");
    }

    const now = new Date();

    const product: Product = {
      id: crypto.randomUUID(),
      name,
      sku,
      price: input.price,
      stock,
      category: input.category?.trim()
        ? input.category.trim()
        : null,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    this.products.push(product);

    return clone(product);
  }

  getById(id: string): Product | null {
    const product = this.products.find((p) => p.id === id);
    return product ? clone(product) : null;
  }

  getBySku(sku: string): Product | null {
    const value = sku.trim().toUpperCase();

    const product = this.products.find((p) => p.sku === value);

    return product ? clone(product) : null;
  }

  list(query?: ListProductsQuery): Product[] {
    let products = [...this.products];
    if (
  query?.minPrice !== undefined &&
  (!Number.isFinite(query.minPrice) || query.minPrice < 0)
) {
  fail("VALIDATION", "minPrice inválido");
}

if (
  query?.maxPrice !== undefined &&
  (!Number.isFinite(query.maxPrice) || query.maxPrice < 0)
) {
  fail("VALIDATION", "maxPrice inválido");
}

if (
  query?.minPrice !== undefined &&
  query?.maxPrice !== undefined &&
  query.minPrice > query.maxPrice
) {
  fail("VALIDATION", "Rango inválido");
}

    if (query?.search?.trim()) {
      const search = query.search.trim().toLowerCase();

      products = products.filter((p) =>
        p.name.toLowerCase().includes(search),
      );
    }

    if (query?.category?.trim()) {
      const category = query.category.trim().toLowerCase();

      products = products.filter(
        (p) => p.category?.toLowerCase() === category,
      );
    }

    if (query?.active !== undefined) {
      products = products.filter(
        (p) => p.active === query.active,
      );
    }

    if (query?.minPrice !== undefined) {
      products = products.filter(
        (p) => p.price >= query.minPrice!,
      );
    }

    if (query?.maxPrice !== undefined) {
      products = products.filter(
        (p) => p.price <= query.maxPrice!,
      );
    }

    products.sort((a, b) => {
      const result = a.name.localeCompare(
        b.name,
        "es",
        { sensitivity: "base" },
      );

      if (result !== 0) {
        return result;
      }

      return a.sku.localeCompare(b.sku);
    });

    return products.map(clone);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const product = this.products.find((p) => p.id === id);

    if (!product) {
      fail("NOT_FOUND", "No existe");
    }
    if (Object.keys(patch).length === 0) {
  return clone(product);
}
if (patch.sku !== undefined) {
  const sku = patch.sku.trim().toUpperCase();

  const duplicate = this.products.find(
    (p) => p.id !== id && p.sku === sku,
  );

  if (duplicate) {
    fail("DUPLICATE_SKU", "SKU duplicado");
  }

  product.sku = sku;
}
if (patch.category !== undefined) {
  if (patch.category === null) {
    product.category = null;
  } else {
    product.category = patch.category.trim()
      ? patch.category.trim()
      : null;
  }
}


    if (patch.price !== undefined) {
      if (!Number.isFinite(patch.price) || patch.price < 0) {
        fail("VALIDATION", "Precio inválido");
      }

      product.price = patch.price;
    }

    if (patch.active !== undefined) {
      product.active = patch.active;
    }

    product.updatedAt = new Date();

    return clone(product);
  }

  remove(id: string): boolean {
    const index = this.products.findIndex(
      (p) => p.id === id,
    );

    if (index < 0) {
      return false;
    }

    this.products.splice(index, 1);

    return true;
  }

adjustStock(id: string, delta: number): Product {
  const product = this.products.find(
    (p) => p.id === id,
  );

  if (!product) {
    fail("NOT_FOUND", "No existe");
  }

  if (
    !Number.isInteger(delta) ||
    delta === 0
  ) {
    fail("VALIDATION", "Delta inválido");
  }

  const newStock = product.stock + delta;

  if (newStock < 0) {
    fail(
      "INSUFFICIENT_STOCK",
      "Stock insuficiente",
    );
  }

  product.stock = newStock;
  product.updatedAt = new Date();

  return clone(product);
}
}