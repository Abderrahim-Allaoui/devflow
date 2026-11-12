/** Shared validation rules — imported by routes and tests so they never drift. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PRIORITIES: string[] = ["low", "medium", "high"];
export const MIN_PASSWORD = 8;
/** bcrypt only uses the first 72 BYTES; cap to a UTF-8 byte length. */
export const MAX_PASSWORD = 72;
