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

function cloneProduct(product: Product): Product {
  return {
    ...product,
    createdAt: new Date(product.createdAt.getTime()),
    updatedAt: new Date(product.updatedAt.getTime()),
  };
}

export class ProductStore {
  private products: Product[] = [];

  create(input: CreateProductInput): Product {
    if (!input || typeof input !== "object") {
      throw new ProductError("VALIDATION", "El input es inválido");
    }

    if (typeof input.name !== "string") {
      throw new ProductError("VALIDATION", "El nombre debe ser un texto");
    }
    const name = input.name.trim();
    if (name.length < 1 || name.length > 80) {
      throw new ProductError("VALIDATION", "El nombre debe tener entre 1 y 80 caracteres");
    }

    if (typeof input.sku !== "string") {
      throw new ProductError("VALIDATION", "El SKU debe ser un texto");
    }
    const sku = input.sku.trim().toUpperCase();
    const skuRegex = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
    if (sku.length < 2 || sku.length > 32 || !skuRegex.test(sku)) {
      throw new ProductError("VALIDATION", "El formato del SKU no es válido");
    }

    const skuExists = this.products.some((p) => p.sku === sku);
    if (skuExists) {
      throw new ProductError("DUPLICATE_SKU", "Ya existe un producto con este SKU");
    }

    if (typeof input.price !== "number" || !Number.isFinite(input.price) || input.price < 0) {
      throw new ProductError("VALIDATION", "El precio debe ser un número mayor o igual a 0");
    }

    let stock = 0;
    if (input.stock !== undefined) {
      if (typeof input.stock !== "number" || !Number.isInteger(input.stock) || input.stock < 0) {
        throw new ProductError("VALIDATION", "El stock debe ser un entero mayor o igual a 0");
      }
      stock = input.stock;
    }

    let category: string | null = null;
    if (input.category !== undefined && input.category !== null) {
      if (typeof input.category !== "string") {
        throw new ProductError("VALIDATION", "La categoría debe ser un texto");
      }
      const trimmedCategory = input.category.trim();
      category = trimmedCategory.length > 0 ? trimmedCategory : null;
    }

    const now = new Date();
    const newProduct: Product = {
      id: crypto.randomUUID(),
      name,
      sku,
      price: input.price,
      stock,
      category,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    this.products.push(newProduct);
    return cloneProduct(newProduct);
  }

  getById(id: string): Product | null {
    const product = this.products.find((p) => p.id === id);
    return product ? cloneProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const normalizedSku = sku.trim().toUpperCase();
    const product = this.products.find((p) => p.sku === normalizedSku);
    return product ? cloneProduct(product) : null;
  }

  list(query?: ListProductsQuery): Product[] {
    let result = [...this.products];

    if (query) {
      if (query.minPrice !== undefined) {
        if (typeof query.minPrice !== "number" || !Number.isFinite(query.minPrice) || query.minPrice < 0) {
          throw new ProductError("VALIDATION", "El precio mínimo es inválido");
        }
      }

      if (query.maxPrice !== undefined) {
        if (typeof query.maxPrice !== "number" || !Number.isFinite(query.maxPrice) || query.maxPrice < 0) {
          throw new ProductError("VALIDATION", "El precio máximo es inválido");
        }
      }

      if (query.minPrice !== undefined && query.maxPrice !== undefined) {
        if (query.minPrice > query.maxPrice) {
          throw new ProductError("VALIDATION", "El precio mínimo no puede ser mayor al precio máximo");
        }
      }

      if (query.search !== undefined && typeof query.search === "string") {
        const searchTrimmed = query.search.trim().toLowerCase();
        if (searchTrimmed.length > 0) {
          result = result.filter(
            (p) =>
              p.name.toLowerCase().includes(searchTrimmed) ||
              p.sku.toLowerCase().includes(searchTrimmed)
          );
        }
      }

      if (query.category !== undefined && typeof query.category === "string") {
        const catTrimmed = query.category.trim().toLowerCase();
        if (catTrimmed.length > 0) {
          result = result.filter(
            (p) => p.category !== null && p.category.trim().toLowerCase() === catTrimmed
          );
        }
      }

      if (query.active !== undefined && typeof query.active === "boolean") {
        result = result.filter((p) => p.active === query.active);
      }

      if (query.minPrice !== undefined) {
        result = result.filter((p) => p.price >= query.minPrice!);
      }

      if (query.maxPrice !== undefined) {
        result = result.filter((p) => p.price <= query.maxPrice!);
      }
    }

    result.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      if (cmp !== 0) return cmp;
      return a.sku.localeCompare(b.sku);
    });

    return result.map(cloneProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    if (!patch || typeof patch !== "object") {
      throw new ProductError("VALIDATION", "El parche es inválido");
    }

    const index = this.products.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new ProductError("NOT_FOUND", "Producto no encontrado");
    }

    const current = this.products[index];

    let hasChanges = false;
    let newName = current.name;
    let newSku = current.sku;
    let newPrice = current.price;
    let newStock = current.stock;
    let newCategory = current.category;
    let newActive = current.active;

    if (patch.name !== undefined) {
      if (typeof patch.name !== "string") {
        throw new ProductError("VALIDATION", "El nombre debe ser un texto");
      }
      const trimmed = patch.name.trim();
      if (trimmed.length < 1 || trimmed.length > 80) {
        throw new ProductError("VALIDATION", "El nombre debe tener entre 1 y 80 caracteres");
      }
      newName = trimmed;
      hasChanges = true;
    }

    if (patch.sku !== undefined) {
      if (typeof patch.sku !== "string") {
        throw new ProductError("VALIDATION", "El SKU debe ser un texto");
      }
      const trimmedSku = patch.sku.trim().toUpperCase();
      const skuRegex = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
      if (trimmedSku.length < 2 || trimmedSku.length > 32 || !skuRegex.test(trimmedSku)) {
        throw new ProductError("VALIDATION", "El formato del SKU no es válido");
      }

      const skuExists = this.products.some((p) => p.id !== id && p.sku === trimmedSku);
      if (skuExists) {
        throw new ProductError("DUPLICATE_SKU", "Ya existe otro producto con este SKU");
      }

      newSku = trimmedSku;
      hasChanges = true;
    }

    if (patch.price !== undefined) {
      if (typeof patch.price !== "number" || !Number.isFinite(patch.price) || patch.price < 0) {
        throw new ProductError("VALIDATION", "El precio debe ser un número mayor o igual a 0");
      }
      newPrice = patch.price;
      hasChanges = true;
    }

    if (patch.stock !== undefined) {
      if (typeof patch.stock !== "number" || !Number.isInteger(patch.stock) || patch.stock < 0) {
        throw new ProductError("VALIDATION", "El stock debe ser un entero mayor o igual a 0");
      }
      newStock = patch.stock;
      hasChanges = true;
    }

    if (patch.category !== undefined) {
      if (patch.category === null) {
        newCategory = null;
      } else if (typeof patch.category === "string") {
        const trimmedCat = patch.category.trim();
        newCategory = trimmedCat.length > 0 ? trimmedCat : null;
      } else {
        throw new ProductError("VALIDATION", "La categoría debe ser un texto o null");
      }
      hasChanges = true;
    }

    if (patch.active !== undefined) {
      if (typeof patch.active !== "boolean") {
        throw new ProductError("VALIDATION", "El campo active debe ser un booleano");
      }
      newActive = patch.active;
      hasChanges = true;
    }

    const updatedProduct: Product = {
      ...current,
      name: newName,
      sku: newSku,
      price: newPrice,
      stock: newStock,
      category: newCategory,
      active: newActive,
      updatedAt: hasChanges ? new Date() : current.updatedAt,
    };

    this.products[index] = updatedProduct;
    return cloneProduct(updatedProduct);
  }

  remove(id: string): boolean {
    const index = this.products.findIndex((p) => p.id === id);
    if (index === -1) {
      return false;
    }
    this.products.splice(index, 1);
    return true;
  }

  adjustStock(id: string, delta: number): Product {
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      throw new ProductError("VALIDATION", "El delta debe ser un entero distinto de cero");
    }

    const product = this.products.find((p) => p.id === id);
    if (!product) {
      throw new ProductError("NOT_FOUND", "Producto no encontrado");
    }

    const newStock = product.stock + delta;
    if (newStock < 0) {
      throw new ProductError("INSUFFICIENT_STOCK", "Stock insuficiente para la operación");
    }

    product.stock = newStock;
    product.updatedAt = new Date();

    return cloneProduct(product);
  }
}