export type UserInput = { name?: unknown; email?: unknown };
export type NewUser = { name: string; email: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Valida y normaliza los datos de un usuario antes de guardarlo en cualquier base.
export function validateUser(input: UserInput): { ok: true; user: NewUser } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";

  if (!name || !email) return { ok: false, error: "name and email are required" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "email is not valid" };

  return { ok: true, user: { name, email } };
}
