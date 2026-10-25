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

// Función auxiliar para clonar productos garantizando copias de Date
function cloneProduct(p: Product): Product {
  return {
    ...p,
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
  };
}

// Función auxiliar para normalizar texto quitando tildes y pasando a minúsculas
function normalizeStr(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export class ProductStore {
  private products: Product[] = [];

  create(input: CreateProductInput): Product {
    if (typeof input.name !== "string" || input.name.trim() === "") {
      throw new ProductError("VALIDATION", "El nombre es obligatorio");
    }
    if (input.name.trim().length > 80) {
      throw new ProductError("VALIDATION", "El nombre supera los 80 caracteres");
    }
    if (typeof input.price !== "number" || input.price < 0 || !Number.isFinite(input.price)) {
      throw new ProductError("VALIDATION", "El precio es inválido");
    }
    if (input.stock !== undefined && (typeof input.stock !== "number" || input.stock < 0 || !Number.isInteger(input.stock))) {
      throw new ProductError("VALIDATION", "El stock es inválido");
    }

    const skuClean = typeof input.sku === "string" ? input.sku.trim().toUpperCase() : "";
    const skuRegex = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
    if (!skuClean || !skuRegex.test(skuClean) || skuClean.length < 2 || skuClean.length > 32) {
      throw new ProductError("VALIDATION", "El SKU es inválido");
    }

    if (this.products.some(p => p.sku === skuClean)) {
      throw new ProductError("DUPLICATE_SKU", "El SKU ya existe");
    }

    let finalCategory: string | null = null;
    if (typeof input.category === "string" && input.category.trim() !== "") {
      finalCategory = input.category.trim();
    }

    const now = new Date();
    const newProduct: Product = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      sku: skuClean,
      price: input.price,
      stock: input.stock ?? 0,
      category: finalCategory,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    this.products.push(newProduct);
    return cloneProduct(newProduct);
  }

  getById(id: string): Product | null {
    const product = this.products.find(p => p.id === id);
    return product ? cloneProduct(product) : null;
  }

  getBySku(sku: string): Product | null {
    if (typeof sku !== "string") return null;
    const product = this.products.find(p => p.sku === sku.trim().toUpperCase());
    return product ? cloneProduct(product) : null;
  }

  list(query?: ListProductsQuery): Product[] {
    // 1. Validar que minPrice y maxPrice sean números válidos (>= 0 y finitos) y que minPrice <= maxPrice
    if (query?.minPrice !== undefined) {
      if (typeof query.minPrice !== "number" || !Number.isFinite(query.minPrice) || query.minPrice < 0) {
        throw new ProductError("VALIDATION", "El precio mínimo es inválido");
      }
    }
    if (query?.maxPrice !== undefined) {
      if (typeof query.maxPrice !== "number" || !Number.isFinite(query.maxPrice) || query.maxPrice < 0) {
        throw new ProductError("VALIDATION", "El precio máximo es inválido");
      }
    }
    if (query?.minPrice !== undefined && query?.maxPrice !== undefined && query.minPrice > query.maxPrice) {
      throw new ProductError("VALIDATION", "El precio mínimo no puede ser mayor al máximo");
    }

    // 2. Limpiar textos de búsqueda y categoría
    const searchText = query?.search?.trim() ?? "";
    const searchCategory = query?.category?.trim() ?? "";

    const normSearch = searchText ? normalizeStr(searchText) : "";
    const normCategory = searchCategory ? normalizeStr(searchCategory) : "";

    // 3. Filtrado combinando reglas con AND
    const filtered = this.products.filter(p => {
      if (normSearch) {
        const matchName = normalizeStr(p.name).includes(normSearch);
        const matchSku = normalizeStr(p.sku).includes(normSearch);
        if (!matchName && !matchSku) return false;
      }

      if (normCategory) {
        if (!p.category || normalizeStr(p.category) !== normCategory) return false;
      }

      if (query?.active !== undefined && p.active !== query.active) {
        return false;
      }

      if (query?.minPrice !== undefined && p.price < query.minPrice) {
        return false;
      }

      if (query?.maxPrice !== undefined && p.price > query.maxPrice) {
        return false;
      }

      return true;
    });

    // 4. Ordenamiento local en español ("es") con sensitivity: "base" y desempate por SKU
    filtered.sort((a, b) => {
      const nameCmp = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
      if (nameCmp !== 0) return nameCmp;
      return a.sku.localeCompare(b.sku, "es", { sensitivity: "base" });
    });

    return filtered.map(cloneProduct);
  }

  update(id: string, patch: UpdateProductInput): Product {
    const index = this.products.findIndex(p => p.id === id);
    if (index === -1) throw new ProductError("NOT_FOUND", "Producto no encontrado");

    const p = this.products[index];

    if (patch.name !== undefined) {
      if (typeof patch.name !== "string" || patch.name.trim() === "" || patch.name.trim().length > 80) {
        throw new ProductError("VALIDATION", "Nombre inválido");
      }
    }

    if (patch.price !== undefined) {
      if (typeof patch.price !== "number" || patch.price < 0 || !Number.isFinite(patch.price)) {
        throw new ProductError("VALIDATION", "Precio inválido");
      }
    }

    if (patch.stock !== undefined) {
      if (typeof patch.stock !== "number" || patch.stock < 0 || !Number.isInteger(patch.stock)) {
        throw new ProductError("VALIDATION", "Stock inválido");
      }
    }

    let newSku = p.sku;
    if (patch.sku !== undefined) {
      if (typeof patch.sku !== "string") throw new ProductError("VALIDATION", "SKU inválido");
      newSku = patch.sku.trim().toUpperCase();
      const skuRegex = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
      if (!skuRegex.test(newSku) || newSku.length < 2 || newSku.length > 32) {
        throw new ProductError("VALIDATION", "SKU inválido");
      }

      if (this.products.some(prod => prod.sku === newSku && prod.id !== id)) {
        throw new ProductError("DUPLICATE_SKU", "SKU duplicado");
      }
    }

    let changed = false;

    if (patch.name !== undefined) { p.name = patch.name.trim(); changed = true; }
    if (patch.sku !== undefined) { p.sku = newSku; changed = true; }
    if (patch.price !== undefined) { p.price = patch.price; changed = true; }
    if (patch.stock !== undefined) { p.stock = patch.stock; changed = true; }
    if (patch.active !== undefined) { p.active = patch.active; changed = true; }
    if (patch.category !== undefined) {
      p.category = patch.category === null ? null : (patch.category.trim() === "" ? null : patch.category.trim());
      changed = true;
    }

    if (changed) {
      p.updatedAt = new Date();
    }

    return cloneProduct(p);
  }

  remove(id: string): boolean {
    const index = this.products.findIndex(p => p.id === id);
    if (index === -1) return false;
    this.products.splice(index, 1);
    return true;
  }

  adjustStock(id: string, delta: number): Product {
    if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
      throw new ProductError("VALIDATION", "Delta debe ser entero distinto de cero");
    }

    const product = this.products.find(p => p.id === id);
    if (!product) throw new ProductError("NOT_FOUND", "Producto no encontrado");

    if (product.stock + delta < 0) {
      throw new ProductError("INSUFFICIENT_STOCK", "Stock insuficiente");
    }

    product.stock += delta;
    product.updatedAt = new Date();

    return cloneProduct(product);
  }
}