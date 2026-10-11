import { pgPool } from "../db/postgres.js";

export interface University {
  id: number;
  name: string;
  city: string;
  created_at: string;
}

export interface NewUniversity {
  name: string;
  city: string;
}

export class ValidationError extends Error {}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS universities (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;

// Revisa que lleguen name y city como texto no vacío y les quita espacios sobrantes.
export function validateUniversity(input: unknown): NewUniversity {
  const { name, city } = (input ?? {}) as Record<string, unknown>;

  if (typeof name !== "string" || name.trim() === "") {
    throw new ValidationError("name is required");
  }
  if (typeof city !== "string" || city.trim() === "") {
    throw new ValidationError("city is required");
  }

  return { name: name.trim(), city: city.trim() };
}

export async function listUniversities(): Promise<University[]> {
  await pgPool.query(CREATE_TABLE);
  const result = await pgPool.query(
    "SELECT id, name, city, created_at FROM universities ORDER BY id ASC"
  );
  return result.rows;
}

export async function createUniversity(input: unknown): Promise<University> {
  const university = validateUniversity(input);
  await pgPool.query(CREATE_TABLE);
  const result = await pgPool.query(
    `INSERT INTO universities (name, city)
     VALUES ($1, $2)
     RETURNING id, name, city, created_at`,
    [university.name, university.city]
  );
  return result.rows[0];
}