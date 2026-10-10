export type PaginationQuery = { page?: unknown; limit?: unknown };
export type Pagination = { page: number; limit: number; offset: number };

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;

// Convierte un valor del query string en entero positivo; si no sirve, usa el valor por defecto.
function toPositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// Lee ?page y ?limit de la petición y calcula el offset para la consulta a la base de datos.
export function parsePagination(query: PaginationQuery = {}): Pagination {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, DEFAULT_LIMIT), MAX_LIMIT);

  return { page, limit, offset: (page - 1) * limit };
}
