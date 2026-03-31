import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password strength:
 * - At least 10 characters
 * - At least one uppercase, one lowercase, one digit
 */
export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (password.length < 10) return { valid: false, reason: "Password must be at least 10 characters" };
  if (!/[A-Z]/.test(password)) return { valid: false, reason: "Password must contain an uppercase letter" };
  if (!/[a-z]/.test(password)) return { valid: false, reason: "Password must contain a lowercase letter" };
  if (!/[0-9]/.test(password)) return { valid: false, reason: "Password must contain a digit" };
  return { valid: true };
}
