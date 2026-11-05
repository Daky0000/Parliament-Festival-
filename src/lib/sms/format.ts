// Pure SMS helpers with no server dependencies, safe to import in the browser.

/**
 * Normalizes a Ghana number to E.164 (+233 followed by 9 digits). Returns null
 * for anything that is not a valid Ghana mobile/landline number.
 */
export function normalizeGhanaPhone(phone: string): string | null {
  const digits = phone.replace(/[\s().-]/g, "");
  let national: string | null = null;
  if (/^\+233\d{9}$/.test(digits)) national = digits.slice(4);
  else if (/^233\d{9}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{9}$/.test(digits)) national = digits.slice(1);
  else if (/^\d{9}$/.test(digits)) national = digits;
  if (!national || !/^[235]\d{8}$/.test(national)) return null;
  return `+233${national}`;
}

// GSM 03.38 basic set and the extension table (each extension char costs 2).
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";

/** Segment count per GSM 03.38 (7-bit) or UCS-2 when any character is outside GSM. */
export function calculateSmsSegments(text: string): number {
  let septets = 0;
  let gsm = true;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) septets += 1;
    else if (GSM_EXTENDED.includes(ch)) septets += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) return septets <= 160 ? 1 : Math.ceil(septets / 153);
  const units = [...text].reduce((n, ch) => n + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0);
  return units <= 70 ? 1 : Math.ceil(units / 67);
}
