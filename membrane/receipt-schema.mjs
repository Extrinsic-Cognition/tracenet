// Standalone sanitized receipt validation (from tracenet-register.mjs)
export const SANITIZED_HEX = 48;
const HEX64 = /^[0-9a-f]{64}$/;
export const SANITIZED_REF = (sha256) => `tracenet/sanitized/${String(sha256).slice(0, SANITIZED_HEX)}`;
export function validReceipt(item) {
  const r = item?.sanitized;
  return Boolean(r) && typeof r === 'object' && r.ref === SANITIZED_REF(item.sha256) && Number.isSafeInteger(r.rev) && r.rev >= 0 &&
    typeof r.seat === 'string' && r.seat.length > 0 && r.seat.length <= 120 && Number.isFinite(r.ts) && r.ts > 0;
}

/** When a drop becomes everyone's (ms): OPEN_DAYS after its publish time; null when the publish time is not a date (the build refuses such a register). */
