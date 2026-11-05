export function findContactPhoneNumber(): string | undefined {
  const phone = process.env.CONTACT_PHONE_NUMBER?.trim();
  return phone ? phone : undefined;
}
