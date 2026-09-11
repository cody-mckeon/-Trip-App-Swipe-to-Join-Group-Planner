export function parseMoney(value, currency) {
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Missing monetary amount");
  const exponent = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
  const factor = 10 ** exponent;
  const minor = Math.round(Number(value) * factor);
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error(`Invalid ${currency} amount: ${value}`);
  return minor;
}

export function divideMoney(totalMinor, people) {
  // One explicitly documented rule: round the displayed per-person amount to
  // the nearest minor unit, with .5 away from zero. The grand total remains
  // authoritative, so displayed shares may differ by a minor unit in aggregate.
  return Math.round(totalMinor / people);
}
