export function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return fallback;
}

export function parseFiniteNumber(value: unknown, fallback: number): number {
  const parsed: number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized: string = typeof value === "string" ? value.trim().toLowerCase() : "";
  return allowed.includes(normalized as T) ? (normalized as T) : fallback;
}

export function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
