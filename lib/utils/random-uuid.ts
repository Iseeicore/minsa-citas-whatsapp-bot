import {
  HEX_DIGITS_PER_BYTE,
  HEX_RADIX,
  UUID_BYTE_LENGTH,
  UUID_VARIANT_BYTE_INDEX,
  UUID_VARIANT_KEEP_MASK,
  UUID_VARIANT_SET_MASK,
  UUID_VERSION_4_KEEP_MASK,
  UUID_VERSION_4_SET_MASK,
  UUID_VERSION_BYTE_INDEX,
} from "@/lib/constants/limits/random-id";
import { UUID_GROUP_BYTE_LENGTHS, UUID_SEPARATOR } from "@/lib/constants/uuid-format";

function formatAsUuidV4(randomBytes: Uint8Array): string {
  const bytes = Uint8Array.from(randomBytes);
  bytes[UUID_VERSION_BYTE_INDEX] = (bytes[UUID_VERSION_BYTE_INDEX] & UUID_VERSION_4_KEEP_MASK) | UUID_VERSION_4_SET_MASK;
  bytes[UUID_VARIANT_BYTE_INDEX] = (bytes[UUID_VARIANT_BYTE_INDEX] & UUID_VARIANT_KEEP_MASK) | UUID_VARIANT_SET_MASK;

  const hex = Array.from(bytes, (byte) => byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, "0")).join("");
  let offset = 0;
  return UUID_GROUP_BYTE_LENGTHS.map((length) => {
    const group = hex.slice(offset, offset + length * HEX_DIGITS_PER_BYTE);
    offset += length * HEX_DIGITS_PER_BYTE;
    return group;
  }).join(UUID_SEPARATOR);
}

export function randomUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return formatAsUuidV4(crypto.getRandomValues(new Uint8Array(UUID_BYTE_LENGTH)));
}
