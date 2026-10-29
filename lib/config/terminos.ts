export function findTerminosUrl(): string | undefined {
  const url = process.env.TERMINOS_URL?.trim();
  return url ? url : undefined;
}
