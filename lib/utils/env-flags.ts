import { FLAG_DISABLED_VALUE, FLAG_ENABLED_VALUE } from "@/lib/constants/env-flags";

export const isFlagEnabled = (value: string | undefined): boolean => value === FLAG_ENABLED_VALUE;

export const isFlagDisabled = (value: string | undefined): boolean => value === FLAG_DISABLED_VALUE;
