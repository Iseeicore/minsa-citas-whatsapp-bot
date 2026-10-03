export function isValidDniFormat(value: string): boolean {
  return /^\d{8}$/.test(value.trim());
}

export function isValidOtpFormat(value: string): boolean {
  return /^\d{4,8}$/.test(value.trim());
}
