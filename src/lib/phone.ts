/** Normalises a spoken/typed Indian-context phone number to E.164 (+91…). Returns null if it can't be a valid number. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hasPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (hasPlus && digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0") && /^[6-9]/.test(digits.slice(1))) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) return `+${digits}`;
  return null;
}
